export const TIFF_EXTENSIONS = ['.tif', '.tiff'] as const;

export type TiffWorkflowStatus = 'TIFF_PENDING' | 'TIFF_READY' | 'PRINT_STARTED' | 'PRINT_COMPLETED';

export interface TiffPathInfo {
  originalPath: string;
  normalizedPath: string;
  fileName: string;
  extension: string;
  orderFolder: string;
  networkRoot: string;
  isValid: boolean;
  fileUrl: string;
}

export function sanitizeTiffPath(path?: string | null): string {
  if (!path) return '';
  return path.trim().replace(/^["']+|["']+$/g, '').trim();
}

export function resolvePrintWorkflow(order: any) {
  return order?.workflow?.printWorkflow || order?.printWorkflow || null;
}

export function getFileNameFromPath(path: string) {
  if (!path) return 'final-print.tiff';

  const cleaned = sanitizeTiffPath(path);
  const normalized = cleaned.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'final-print.tiff';
}

export function hasSupportedTiffExtension(path: string) {
  const fileName = getFileNameFromPath(path).toLowerCase();
  return /\.[a-z0-9]{2,5}$/.test(fileName);
}

export function hasSupportedSharedPathPrefix(path: string) {
  const trimmed = path.trim();
  // Accept UNC (\\server\share), file:// URLs, and Windows drive-letter absolute paths (C:\...)
  return (
    trimmed.startsWith('\\\\') ||
    /^file:\/\//i.test(trimmed) ||
    /^[A-Za-z]:\\/.test(trimmed) ||
    /^[A-Za-z]:\//.test(trimmed)
  );
}

export function isValidTiffPath(path: string) {
  const trimmed = path.trim();
  return Boolean(trimmed) && hasSupportedSharedPathPrefix(trimmed) && hasSupportedTiffExtension(trimmed);
}

export function normalizeNetworkPath(path: string) {
  const trimmed = path.trim();

  if (/^file:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Windows drive-letter absolute path -> convert to file:///C:/path style
  if (/^[A-Za-z]:\\/.test(trimmed) || /^[A-Za-z]:\//.test(trimmed)) {
    const replaced = trimmed.replace(/\\/g, '/');
    // Ensure there's no leading slash before drive letter
    const pathPart = replaced.replace(/^\/+/, '');
    return `file:///${pathPart}`;
  }

  if (!trimmed.startsWith('\\\\')) {
    // Fallback: return as-is
    return trimmed;
  }

  const withoutLeadingSlashes = trimmed.replace(/^\\\\+/, '');
  const normalized = withoutLeadingSlashes.replace(/\\/g, '/');
  return `file:////${normalized}`;
}

export function normalizeTiffPathToFileUrl(path: string) {
  return normalizeNetworkPath(path);
}

export function inspectTiffPath(path: string): TiffPathInfo {
  const originalPath = path || '';
  const normalizedPath = originalPath.trim();
  const fileName = getFileNameFromPath(normalizedPath);
  const extension = fileName.includes('.') ? `.${fileName.split('.').pop()?.toLowerCase() || ''}` : '';
  const isValid = isValidTiffPath(normalizedPath);
  const fileUrl = normalizeNetworkPath(normalizedPath);

  let networkRoot = '';
  let orderFolder = '';

  if (normalizedPath.startsWith('\\\\')) {
    const parts = normalizedPath.replace(/^\\\\+/, '').split('\\').filter(Boolean);
    const server = parts[0] || '';
    const share = parts[1] || '';
    orderFolder = parts[2] || '';
    networkRoot = server && share ? `\\\\${server}\\${share}` : normalizedPath;
  } else if (/^file:\/\//i.test(normalizedPath)) {
    const urlParts = normalizedPath.replace(/^file:\/\//i, '').split('/').filter(Boolean);
    const server = urlParts[0] || '';
    const share = urlParts[1] || '';
    orderFolder = urlParts[2] || '';
    networkRoot = server && share ? `file://${server}/${share}` : normalizedPath;
  }

  return {
    originalPath,
    normalizedPath,
    fileName,
    extension,
    orderFolder,
    networkRoot,
    isValid,
    fileUrl,
  };
}

export async function openTiffInSystem(tiffPath: string): Promise<boolean> {
  if (!tiffPath || typeof tiffPath !== 'string') return false;
  const cleaned = sanitizeTiffPath(tiffPath);
  if (!cleaned) return false;

  // 1. If it's a web/cloud/API/blob URL, open directly in browser tab on any laptop or device
  if (/^https?:\/\//i.test(cleaned) || cleaned.startsWith('/') || cleaned.startsWith('data:') || cleaned.startsWith('blob:')) {
    if (typeof window !== 'undefined') {
      window.open(cleaned, '_blank', 'noopener,noreferrer');
      return true;
    }
  }

  // 2. If it's a local/UNC path, attempt native system open via server endpoint
  try {
    const res = await fetch('/api/workflow/open-tiff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tiffPath: trimmed }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        return true;
      }
    }
  } catch (error) {
    console.error('Failed to open TIFF in system via API:', error);
  }

  // 3. Fallback: normalized file URL open in browser
  if (typeof window !== 'undefined') {
    const fileUrl = normalizeNetworkPath(trimmed);
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
    return true;
  }

  return false;
}
