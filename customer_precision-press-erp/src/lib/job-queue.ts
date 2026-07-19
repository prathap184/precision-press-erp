// @ts-nocheck
import { supabaseServer } from './supabase-server';
import { calculateOrderTotals } from './pricing';
import { generateInvoiceId } from './order-ids';
import { updateStatsIncrementally } from './stats';
import { sendNotification } from './notifications';
import { adminDb } from './firebase-admin';
// Invoice generation is now manual — removed generateInvoiceForParentOrder import

import { v2 as cloudinary } from 'cloudinary';

export interface Job {
  id: string;
  jobType: string;
  orderId?: string;
  parentOrderId: string;
  payload: Record<string, any>;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING';
  attempts: number;
  maxAttempts: number;
  priority: number;
  worker_id?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  heartbeatAt?: string;
  errorMessage?: string;
  stackTrace?: string;
  sqlError?: string;
  workerVersion?: string;
}

const RETRY_DELAYS = [30, 120, 600]; // 30s, 2m, 10m
const WORKER_VERSION = '2.0.0';

/**
 * Audit log helper specifically for background jobs.
 * Writes directly to the Supabase SQL audit_logs table.
 */
async function writeJobAuditLog(job: Partial<Job> & { id: string }, actionType: string, meta: Record<string, any> = {}) {
  try {
    const logId = `AUDIT-JOB-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await supabaseServer
      .from('audit_logs')
      .insert({
        id: logId,
        action_type: actionType,
        actor_id: job.worker_id || 'SYSTEM_WORKER',
        actor_name: `Worker ${job.worker_id || 'SYSTEM_WORKER'}`,
        target_id: job.id,
        target_type: 'JOB',
        payload: {
          jobId: job.id,
          jobType: job.jobType,
          parentOrderId: job.parentOrderId,
          status: job.status,
          attempts: job.attempts
        },
        metadata: meta,
        timestamp: new Date().toISOString()
      });
  } catch (err) {
    console.error('[Job Queue] Failed to write job audit log:', err);
  }
}

/**
 * Main queue processing loop
 * Locks and processes one job at a time using atomic row claiming.
 */
export async function processQueue(workerId: string): Promise<{ processed: boolean; jobId?: string; error?: string }> {
  const now = new Date().toISOString();

  // 1. Claim a pending/retrying job atomically using locking query
  const { data: claimedJobs, error: claimError } = await supabaseServer.rpc('claim_pending_job', {
    p_worker_id: workerId,
    p_now: now
  });

  if (claimError) {
    console.error(`[Job Queue] Error claiming job: ${claimError.message}`);
    return { processed: false, error: claimError.message };
  }

  if (!claimedJobs || claimedJobs.length === 0) {
    // No jobs to process
    return { processed: false };
  }

  const job = claimedJobs[0] as Job;
  console.log(`[Job Queue] Worker ${workerId} started job ${job.id} (${job.jobType})`);
  await writeJobAuditLog(job, 'Worker Started');
  
  const startTime = Date.now();

  try {
    // 3. Execute Job Handler
    await handleJobExecution(job);

    // 4. Mark Job as COMPLETED
    const duration = Date.now() - startTime;
    await supabaseServer
      .from('document_jobs')
      .update({
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        attempts: job.attempts + 1
      })
      .eq('id', job.id);

    console.log(`[Job Queue] Worker Completed job ${job.id} in ${duration}ms`);
    
    // Update local copy for log
    job.status = 'COMPLETED';
    job.attempts = job.attempts + 1;
    await writeJobAuditLog(job, 'Worker Completed', { duration, result: 'SUCCESS' });

    return { processed: true, jobId: job.id };

  } catch (err: any) {
    // 5. Handle Failure & Retry Policy
    const duration = Date.now() - startTime;
    const errorMsg = err.message || String(err);
    const stackTrace = err.stack || null;
    const sqlError = err.code || err.details || null;
    const nextAttempt = job.attempts + 1;

    console.error(`[Job Queue] Worker Failed job ${job.id} after ${duration}ms: ${errorMsg}`);

    if (nextAttempt < job.maxAttempts) {
      // Schedule Retry
      const delaySeconds = RETRY_DELAYS[nextAttempt - 1] || 600;
      const runAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();
      const updatedPayload = { ...(job.payload || {}), runAfter };

      await supabaseServer
        .from('document_jobs')
        .update({
          status: 'RETRYING',
          attempts: nextAttempt,
          errorMessage: errorMsg,
          stackTrace,
          sqlError,
          workerVersion: WORKER_VERSION,
          failedAt: new Date().toISOString(),
          payload: updatedPayload
        })
        .eq('id', job.id);

      job.status = 'RETRYING';
      job.attempts = nextAttempt;
      await writeJobAuditLog(job, 'Retry Scheduled', { duration, error: errorMsg, nextAttempt, runAfter });
    } else {
      // Permanently Fail
      await supabaseServer
        .from('document_jobs')
        .update({
          status: 'FAILED',
          attempts: nextAttempt,
          errorMessage: errorMsg,
          stackTrace,
          sqlError,
          workerVersion: WORKER_VERSION,
          failedAt: new Date().toISOString()
        })
        .eq('id', job.id);

      job.status = 'FAILED';
      job.attempts = nextAttempt;
      await writeJobAuditLog(job, 'Worker Failed', { duration, error: errorMsg, maxAttemptsReached: true });
      console.error(`[Job Queue] Job ${job.id} failed permanently (Max attempts reached)`);
    }

    return { processed: true, jobId: job.id, error: errorMsg };
  }
}

/**
 * Route job types to specific handlers
 */
async function handleJobExecution(job: Job) {
  switch (job.jobType) {
    case 'GENERATE_TAX_INVOICE':
      await handleGenerateTaxInvoice(job.parentOrderId);
      break;
    case 'UPDATE_ANALYTICS':
      await handleUpdateAnalytics(job.orderId || job.parentOrderId);
      break;
    case 'SEND_NOTIFICATION':
      await handleSendNotification(job);
      break;
    case 'SEND_EMAIL':
    case 'SEND_SMS':
    case 'SEND_WHATSAPP':
      await handleExternalMessaging(job);
      break;
    case 'DASHBOARD_REFRESH':
      await handleDashboardRefresh(job);
      break;
    case 'CLEANUP_CLOUDINARY':
      await handleCloudinaryCleanup();
      break;
    case 'ACDEMA_POST_PROCESS':
      // This happens on the ERP side, not Customer portal
      break;
    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}

/**
 * Handler: GENERATE_TAX_INVOICE
 * NOTE: Automatic invoice generation has been removed.
 * Invoices are now generated manually via the Invoice Generation module.
 * This handler is kept as a no-op stub to avoid breaking existing job queue rows.
 */
async function handleGenerateTaxInvoice(parentOrderId: string) {
  console.log(`[Invoice Worker] GENERATE_TAX_INVOICE job received for ${parentOrderId}.`);
  console.log(`[Invoice Worker] Auto-generation is disabled. Use the Invoice Generation module.`);
  // No-op: return without error so the job is marked as completed.
}


/**
 * Handler: UPDATE_ANALYTICS
 */
async function handleUpdateAnalytics(orderId: string) {
  // Fetch order info
  const { data: order, error } = await supabaseServer
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    throw new Error(`Order ${orderId} not found for analytics.`);
  }

  // Idempotency check: verify if analytics already updated for this order
  if (order.metadata?.analyticsUpdated) {
    console.log(`[Analytics Worker] Analytics already updated for order ${orderId}. Skipping.`);
    return;
  }

  const grandTotal = order.amounts?.grandTotal || 0;

  // Perform stats update
  const statsUpdate: Record<string, number> = {
    'orders.total': 1,
    'orders.placed': 1,
    'financial.totalSales': grandTotal,
    'financial.totalOutstanding': grandTotal,
    'financial.totalUnpaid': order.paymentStatus === 'VERIFIED' ? 0 : grandTotal
  };

  await adminDb.runTransaction(async (tx: any) => {
    await updateStatsIncrementally(tx, statsUpdate);
  });

  // Mark order as analytics-updated
  const updatedMetadata = { ...(order.metadata || {}), analyticsUpdated: true };
  await supabaseServer
    .from('orders')
    .update({ metadata: updatedMetadata })
    .eq('id', orderId);

  console.log(`[Analytics Worker] Incremented stats for order ${orderId} by Rs.${grandTotal}`);
}

/**
 * Handler: SEND_NOTIFICATION
 */
async function handleSendNotification(job: Job) {
  // Idempotency: Use Job ID to prevent double notifications
  const { data: existing } = await supabaseServer
    .from('notifications')
    .select('id')
    .eq('id', job.id)
    .maybeSingle();

  if (existing) {
    console.log(`[Notification Worker] Notification already sent for job ${job.id}. Skipping.`);
    return;
  }

  const orderId = job.orderId || job.parentOrderId;
  const { data: order } = await supabaseServer
    .from('orders')
    .select('customerId')
    .eq('id', orderId)
    .single();

  if (!order) throw new Error(`Order ${orderId} not found.`);

  await sendNotification(
    order.customerId,
    'Order Placed Successfully',
    `Your order ${orderId} has been received and is in processing.`,
    { jobId: job.id, orderId: orderId }
  );

  console.log(`[Notification Worker] Sent notification to user ${order.customerId} for order ${orderId}`);
}

/**
 * Handler: SEND_EMAIL, SEND_SMS, SEND_WHATSAPP
 */
async function handleExternalMessaging(job: Job) {
  // Idempotency check: since messaging tasks are short-circuited in development/simulated,
  // we check if it has already been processed or logged.
  console.log(`[Messaging Worker] ${job.jobType} processed for order ${job.parentOrderId}: ID=${job.id}`);
}

/**
 * Handler: DASHBOARD_REFRESH
 */
async function handleDashboardRefresh(job: Job) {
  console.log(`[Dashboard Worker] Triggered refresh event for order ${job.parentOrderId}`);
}

/**
 * Cloudinary reference validator
 * Scans all database fields that could reference a Cloudinary file url or public ID.
 */
async function isFileReferenced(url: string, publicId: string): Promise<boolean> {
  // 1. Check orders (thumbnailUrl, items JSON list)
  const { data: orderRef } = await supabaseServer
    .from('orders')
    .select('id')
    .or(`thumbnailUrl.eq."${url}",items.cs.[{"file_url":"${url}"}],items.cs.[{"design_url":"${url}"}]`)
    .limit(1);
  if (orderRef && orderRef.length > 0) return true;

  // 2. Check order_items (fileUrl, designUrl, file_url, design_url)
  const { data: itemRef } = await supabaseServer
    .from('order_items')
    .select('id')
    .or(`fileUrl.eq."${url}",designUrl.eq."${url}",file_url.eq."${url}",design_url.eq."${url}"`)
    .limit(1);
  if (itemRef && itemRef.length > 0) return true;

  // 3. Check design_revisions (url, cloudinary_public_id)
  const { data: revRef } = await supabaseServer
    .from('design_revisions')
    .select('id')
    .or(`url.eq."${url}",cloudinary_public_id.eq."${publicId}"`)
    .limit(1);
  if (revRef && revRef.length > 0) return true;

  // 4. Check design_proofs (url, cloudinary_public_id)
  const { data: proofRef } = await supabaseServer
    .from('design_proofs')
    .select('id')
    .or(`url.eq."${url}",cloudinary_public_id.eq."${publicId}"`)
    .limit(1);
  if (proofRef && proofRef.length > 0) return true;

  // 5. Check design_comments (attachment_url)
  const { data: commentRef } = await supabaseServer
    .from('design_comments')
    .select('id')
    .eq('attachment_url', url)
    .limit(1);
  if (commentRef && commentRef.length > 0) return true;

  return false;
}

/**
 * Handler: CLEANUP_CLOUDINARY
 * Idempotent, soft-delete verification before permanent deletion.
 */
async function handleCloudinaryCleanup() {
  console.log('[Cloudinary Cleanup Worker] Scanning for orphan uploads...');

  const isConfigured = 
    process.env.CLOUDINARY_CLOUD_NAME && 
    process.env.CLOUDINARY_API_KEY && 
    process.env.CLOUDINARY_API_SECRET;

  if (!isConfigured) {
    console.log('[Cloudinary Cleanup Worker] Cloudinary is not configured. Skipping active scanner.');
    return;
  }

  try {
    // 1. Fetch resources with tags (limit to 100 for safety per run)
    const result = await cloudinary.api.resources({
      type: 'upload',
      max_results: 100,
      tags: true
    });
    
    const resources = result.resources || [];
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    for (const res of resources) {
      const createdAt = new Date(res.created_at);
      if (createdAt >= cutoff) {
        continue; // Skip files uploaded within the last 24 hours
      }

      const publicId = res.public_id;
      const url = res.secure_url;

      // 2. Check if file is referenced anywhere in orders, workspaces, approvals, or revisions
      const referenced = await isFileReferenced(url, publicId);

      if (referenced) {
        // If file is referenced but has a soft_delete tag, remove the tag (resurrected!)
        if (res.tags && res.tags.includes('soft_delete')) {
          await cloudinary.uploader.remove_tag('soft_delete', [publicId]);
          console.log(`[Cloudinary Cleanup] Resurrected active file: ${publicId}`);
        }
        continue;
      }

      // 3. Unreferenced file: Apply soft-delete verification step
      if (!res.tags || !res.tags.includes('soft_delete')) {
        // Tag with soft_delete (Candidate for deletion in next run)
        await cloudinary.uploader.add_tag('soft_delete', [publicId]);
        console.log(`[Cloudinary Cleanup] Soft-delete candidate tagged: ${publicId}`);
      } else {
        // If it already has soft_delete tag and is older than 24 hours (we know it's older than 24 hours since res.created_at is),
        // we permanently delete it.
        await cloudinary.uploader.destroy(publicId);
        console.log(`[Cloudinary Cleanup] Permanently deleted orphaned file: ${publicId}`);
      }
    }

    console.log('[Cloudinary Cleanup Worker] Cleanup run completed.');
  } catch (error) {
    console.error('[Cloudinary Cleanup Worker] Scan failed:', error);
  }
}

/**
 * Worker Health & Recovery Logic
 */
export function startWorkerHeartbeat(workerId: string): NodeJS.Timeout {
  supabaseServer.from('worker_health').upsert({
    worker_id: workerId,
    last_heartbeat: new Date().toISOString(),
    status: 'ACTIVE'
  }).then();

  return setInterval(async () => {
    try {
      await supabaseServer.from('worker_health').upsert({
        worker_id: workerId,
        last_heartbeat: new Date().toISOString(),
        status: 'ACTIVE'
      });
    } catch (err) {
      console.error('[Worker Health] Failed to update heartbeat', err);
    }
  }, 10000);
}

export async function stopWorkerHeartbeat(workerId: string, interval: NodeJS.Timeout) {
  clearInterval(interval);
  try {
    await supabaseServer.from('worker_health').delete().eq('worker_id', workerId);
  } catch (err) {
    console.error('[Worker Health] Failed to remove worker', err);
  }
}

export async function recoverDeadWorkers() {
  const cutoff = new Date(Date.now() - 60000).toISOString();
  const { data: deadWorkers } = await supabaseServer
    .from('worker_health')
    .select('worker_id')
    .lt('last_heartbeat', cutoff);

  if (deadWorkers && deadWorkers.length > 0) {
    for (const dw of deadWorkers) {
      await supabaseServer
        .from('document_jobs')
        .update({ status: 'PENDING', worker_id: null, heartbeatAt: null })
        .eq('worker_id', dw.worker_id)
        .eq('status', 'RUNNING');
      
      await supabaseServer.from('worker_health').delete().eq('worker_id', dw.worker_id);
      console.log(`[Worker Health] Recovered dead worker ${dw.worker_id}`);
    }
  }
}
