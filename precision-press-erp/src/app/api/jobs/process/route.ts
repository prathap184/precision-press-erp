import { NextRequest, NextResponse } from 'next/server';
import { processQueue, startWorkerHeartbeat, stopWorkerHeartbeat, recoverDeadWorkers } from '@/lib/job-queue';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleProcess(req);
}

export async function POST(req: NextRequest) {
  return handleProcess(req);
}

async function handleProcess(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Security: require CRON_SECRET in all environments
  if (!cronSecret) {
    console.error('[Jobs Route] CRON_SECRET env var is not set — blocking all requests');
    return NextResponse.json({ error: 'Server misconfiguration: job queue secret not configured.' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: any[] = [];
  const maxBatch = 5; // process up to 5 jobs per invocation
  let processedCount = 0;

  // Run recovery before processing
  await recoverDeadWorkers();

  const workerId = `worker_${process.pid}_${Date.now()}`;
  const heartbeatInterval = startWorkerHeartbeat(workerId);

  try {
    for (let i = 0; i < maxBatch; i++) {
      const res = await processQueue(workerId);
      if (!res.processed) {
        break; // no more jobs to process
      }
      processedCount++;
      results.push(res);
    }

    await stopWorkerHeartbeat(workerId, heartbeatInterval);

    return NextResponse.json({
      success: true,
      processed: processedCount,
      jobs: results
    });
  } catch (error: any) {
    await stopWorkerHeartbeat(workerId, heartbeatInterval);
    console.error('[Jobs Route] Batch process error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
