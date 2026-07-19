export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import os from 'os';

export async function POST(req: NextRequest) {
  try {
    const { tiffPath } = await req.json();

    if (!tiffPath || typeof tiffPath !== 'string') {
      return NextResponse.json({ success: false, error: 'Path is required' }, { status: 400 });
    }

    const trimmedPath = tiffPath.trim();
    const platform = os.platform();

    let cmd = '';
    if (platform === 'win32') {
      // Windows: use start command. Strip internal double quotes to prevent injection.
      const safePath = trimmedPath.replace(/"/g, '');
      cmd = `start "" "${safePath}"`;
    } else if (platform === 'darwin') {
      // macOS: use open
      const safePath = trimmedPath.replace(/"/g, '');
      cmd = `open "${safePath}"`;
    } else {
      // Linux: use xdg-open
      const safePath = trimmedPath.replace(/"/g, '');
      cmd = `xdg-open "${safePath}"`;
    }

    console.log(`[OS OPEN] Platform: ${platform}, Executing command: ${cmd}`);

    exec(cmd, (error) => {
      if (error) {
        console.error('Failed to open local path natively:', error);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Open TIFF Route Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
