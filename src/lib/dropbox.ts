// Thin Dropbox v2 API wrapper for uploading generated reports.
//
// Uses a scoped App-Folder or Full access token. Set DROPBOX_ACCESS_TOKEN in
// Vercel env vars. Optional DROPBOX_REPORTS_ROOT overrides the default path
// prefix (default: /FMX/04_CLIENTS/KGF/Client-wide/4. Reporting/FMX).

const UPLOAD_URL = 'https://content.dropboxapi.com/2/files/upload';

export function isDropboxConfigured(): boolean {
  return !!process.env.DROPBOX_ACCESS_TOKEN;
}

export function dropboxReportPath(reportMonth: string, filename: string): string {
  const root = (process.env.DROPBOX_REPORTS_ROOT
    || '/FMX/04_CLIENTS/KGF/Client-wide/4. Reporting/FMX').replace(/\/+$/, '');
  return `${root}/${reportMonth}/${filename}`;
}

type UploadResult = { ok: true; path: string } | { ok: false; error: string };

export async function uploadReportToDropbox(
  reportMonth: string,
  filename: string,
  buffer: Buffer,
): Promise<UploadResult> {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'DROPBOX_ACCESS_TOKEN not configured' };

  const path = dropboxReportPath(reportMonth, filename);

  const apiArg = {
    path,
    mode: 'overwrite',          // replace if a file with the same name exists
    autorename: false,
    mute: true,                 // don't trigger a notification in Dropbox client
    strict_conflict: false,
  };

  try {
    // Copy into a fresh ArrayBuffer (not SharedArrayBuffer) so Blob typing
    // accepts it. Blob is a valid BodyInit for fetch.
    const ab = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(ab).set(buffer);
    const body = new Blob([ab], { type: 'application/octet-stream' });

    const res = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify(apiArg),
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Dropbox ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, path };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Dropbox upload failed' };
  }
}
