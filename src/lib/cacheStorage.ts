export const CACHE_NAME = 'app-cache-v1';

export interface CachedFileMetadata {
  url: string;
  name: string;
  size: number;
  type: string;
  timestamp: string;
}

export async function getOrStoreCache(url: string, mimeType: string): Promise<string> {
  if (typeof window === 'undefined' || !window.caches) {
    const res = await fetch(url);
    const b = await res.blob();
    return URL.createObjectURL(new Blob([b], { type: mimeType }));
  }

  const cache = await window.caches.open(CACHE_NAME);
  let response = await cache.match(url);

  if (!response) {
    const networkResponse = await fetch(url);
    if (!networkResponse.ok) throw new Error(`Fetch failed: ${networkResponse.statusText}`);
    await cache.put(url, networkResponse.clone());
    response = networkResponse;
  }

  const blob = await response.blob();
  return URL.createObjectURL(new Blob([blob], { type: mimeType }));
}

export async function deleteCachedFile(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || !window.caches) return false;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    return await cache.delete(url);
  } catch (err) {
    console.warn('deleteCachedFile error:', err);
    return false;
  }
}

export async function purgeFailedTransferCache(fileIdOrName?: string): Promise<void> {
  if (typeof window === 'undefined' || !window.caches) return;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    const keys = await cache.keys();
    for (const request of keys) {
      const url = request.url;
      if (
        !fileIdOrName ||
        url.includes(encodeURIComponent(fileIdOrName)) ||
        url.includes(fileIdOrName) ||
        url.includes('partial') ||
        url.includes('nexus_temp')
      ) {
        await cache.delete(request);
      }
    }
  } catch (err) {
    console.warn('purgeFailedTransferCache error:', err);
  }
}

export async function clearAllCache(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.caches) return false;
  try {
    return await window.caches.delete(CACHE_NAME);
  } catch (err) {
    console.warn('clearAllCache error:', err);
    return false;
  }
}

export async function getCacheSizeMB(): Promise<number> {
  if (typeof window === 'undefined' || !window.caches) return 0;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let totalBytes = 0;

    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalBytes += blob.size;
      }
    }

    return Number((totalBytes / (1024 * 1024)).toFixed(2));
  } catch (err) {
    console.warn('getCacheSizeMB error:', err);
    return 0;
  }
}

export async function storeFileInSandboxCache(
  fileId: string,
  name: string,
  blobOrFile: Blob | File,
  mimeType: string,
  extraMetadata?: Record<string, string>
): Promise<{ cacheUrl: string; blobUrl: string }> {
  const safeName = encodeURIComponent(name);
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.local';
  const cacheUrl = `${origin}/sandbox-cache/${fileId}/${safeName}`;

  if (typeof window !== 'undefined' && window.caches && blobOrFile.size < 25 * 1024 * 1024) {
    try {
      const cache = await window.caches.open(CACHE_NAME);
      const headers = new Headers();
      headers.set('Content-Type', mimeType || blobOrFile.type || 'application/octet-stream');
      headers.set('Content-Length', blobOrFile.size.toString());
      headers.set('X-Sandbox-File-Id', fileId);
      headers.set('X-Sandbox-File-Name', encodeURIComponent(name));
      headers.set('X-Sandbox-Date', new Date().toISOString());

      if (extraMetadata) {
        for (const [k, v] of Object.entries(extraMetadata)) {
          headers.set(`X-Sandbox-${k}`, encodeURIComponent(v));
        }
      }

      const response = new Response(blobOrFile, { headers });
      await cache.put(cacheUrl, response);
    } catch (e) {
      console.warn('storeFileInSandboxCache quota notice:', e);
    }
  }

  const blobUrl = URL.createObjectURL(blobOrFile);
  return { cacheUrl, blobUrl };
}

export async function getCachedBlob(cacheUrl: string): Promise<Blob | null> {
  if (typeof window === 'undefined' || !window.caches) return null;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    const response = await cache.match(cacheUrl);
    if (!response) return null;
    return await response.blob();
  } catch (err) {
    console.warn('getCachedBlob error:', err);
    return null;
  }
}

export const cacheStorageManager = {
  async saveFile(file: File): Promise<string> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { cacheUrl } = await storeFileInSandboxCache(id, file.name, file, file.type);
    return cacheUrl;
  },
  async getCachedFiles(): Promise<CachedFileMetadata[]> {
    if (typeof window === 'undefined' || !window.caches) return [];
    try {
      const cache = await window.caches.open(CACHE_NAME);
      const requests = await cache.keys();
      const items: CachedFileMetadata[] = [];
      for (const req of requests) {
        if (!req.url.includes('/sandbox-cache/')) continue;
        const res = await cache.match(req);
        if (!res) continue;
        const nameHeader = res.headers.get('X-Sandbox-File-Name');
        const sizeHeader = res.headers.get('Content-Length');
        const dateHeader = res.headers.get('X-Sandbox-Date');
        const typeHeader = res.headers.get('Content-Type');
        items.push({
          url: req.url,
          name: nameHeader ? decodeURIComponent(nameHeader) : req.url.split('/').pop() || 'file',
          size: sizeHeader ? parseInt(sizeHeader, 10) : 0,
          type: typeHeader || 'application/octet-stream',
          timestamp: dateHeader || new Date().toISOString(),
        });
      }
      return items;
    } catch {
      return [];
    }
  },
  async downloadCachedFile(url: string, filename: string): Promise<void> {
    const blob = await getCachedBlob(url);
    if (!blob) return;
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  },
  async deleteCachedFile(url: string): Promise<boolean> {
    return deleteCachedFile(url);
  },
  async clearCache(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.caches) return false;
    try {
      const cache = await window.caches.open(CACHE_NAME);
      const keys = await cache.keys();
      for (const req of keys) {
        if (req.url.includes('/sandbox-cache/')) {
          await cache.delete(req);
        }
      }
      return true;
    } catch {
      return false;
    }
  },
};
