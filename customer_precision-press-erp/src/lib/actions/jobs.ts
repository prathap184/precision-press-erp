// @ts-nocheck
'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

async function writeJobAuditLog(job: any, actionType: string, meta: Record<string, any> = {}) {
  try {
    const logId = `AUDIT-JOB-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await supabaseServer
      .from('audit_logs')
      .insert({
        id: logId,
        action_type: actionType,
        actor_id: 'ADMIN_DASHBOARD',
        actor_name: 'Admin User',
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
    console.error('[Job Server Actions] Audit log failed:', err);
  }
}

export async function getJobsList() {
  try {
    const { data, error } = await supabaseServer
      .from('document_jobs')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function retryJob(jobId: string) {
  try {
    const { data: job, error: fetchError } = await supabaseServer
      .from('document_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      return { success: false, error: 'Job not found' };
    }

    const { error } = await supabaseServer
      .from('document_jobs')
      .update({
        status: 'PENDING',
        attempts: 0,
        errorMessage: null,
        stackTrace: null,
        sqlError: null,
        failedAt: null,
        startedAt: null,
        completedAt: null
      })
      .eq('id', jobId);

    if (error) throw error;

    await writeJobAuditLog({ ...job, status: 'PENDING', attempts: 0 }, 'Manual Retry', { byAdmin: true });
    
    revalidatePath('/admin/job-queue');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function cancelJob(jobId: string) {
  try {
    const { data: job, error: fetchError } = await supabaseServer
      .from('document_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      return { success: false, error: 'Job not found' };
    }

    const { error } = await supabaseServer
      .from('document_jobs')
      .update({
        status: 'FAILED',
        errorMessage: 'Cancelled by Admin',
        failedAt: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) throw error;

    await writeJobAuditLog({ ...job, status: 'FAILED' }, 'Manual Cancel', { byAdmin: true });
    
    revalidatePath('/admin/job-queue');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getJobAuditLogs() {
  try {
    const { data, error } = await supabaseServer
      .from('audit_logs')
      .select('*')
      .eq('target_type', 'JOB')
      .order('timestamp', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
