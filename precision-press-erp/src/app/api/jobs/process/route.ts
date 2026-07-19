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
  // Simple token security (or bypass in local development)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Optionally enforce secret in production
    // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
