export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

function findFileInUserDirs(fileNameOrPath: string): string {
  if (fs.existsSync(fileNameOrPath)) return fileNameOrPath;

  const base = path.basename(fileNameOrPath);
  const home = os.homedir();
  const candidateDirs = [
    path.join(home, 'Downloads'),
    path.join(home, 'Desktop'),
    path.join(home, 'Pictures'),
    path.join(home, 'Videos'),
    path.join(home, 'Documents'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, 'OneDrive', 'Pictures'),
    path.join(home, 'OneDrive', 'Documents'),
    path.join(home, 'OneDrive', 'Pictures', 'WhatsApp'),
    path.join(home, 'OneDrive', 'Videos'),
  ];

  for (const dir of candidateDirs) {
    try {
      if (fs.existsSync(dir)) {
        const full = path.join(dir, base);
        if (fs.existsSync(full)) {
          return full;
        }
      }
    } catch {}
  }

  return fileNameOrPath;
}

export async function POST(req: NextRequest) {
  try {
    const { tiffPath } = await req.json();

    if (!tiffPath || typeof tiffPath !== 'string') {
      return NextResponse.json({ success: false, error: 'Path is required' }, { status: 400 });
    }

    const trimmedPath = tiffPath.trim();
    const resolvedPath = findFileInUserDirs(trimmedPath);
    const platform = os.platform();

    let cmd = '';
    if (platform === 'win32') {
      // Windows: use start command. Strip double quotes to prevent injection.
      const safePath = resolvedPath.replace(/"/g, '');
      cmd = `start "" "${safePath}"`;
    } else if (platform === 'darwin') {
      // macOS: use open
      const safePath = resolvedPath.replace(/"/g, '');
      cmd = `open "${safePath}"`;
    } else {
      // Linux: use xdg-open
      const safePath = resolvedPath.replace(/"/g, '');
      cmd = `xdg-open "${safePath}"`;
    }

    console.log(`[OS OPEN] Platform: ${platform}, Resolved: "${resolvedPath}", Command: ${cmd}`);

    exec(cmd, (error) => {
      if (error) {
        console.error('Failed to open local path natively:', error);
      }
    });

    return NextResponse.json({ success: true, resolvedPath });
  } catch (error: any) {
    console.error('Open TIFF Route Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
