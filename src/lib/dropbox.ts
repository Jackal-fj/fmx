// Thin Dropbox v2 API wrapper for uploading generated reports.
//
// Multi-client: the mirror path uses the client short_code (KGF, OOFI, ...)
// so each client's photos + reports land in their own folder under
// /FMX/04_CLIENTS/.
//
// Uses a scoped App-Folder or Full access token. Set DROPBOX_ACCESS_TOKEN in
// Vercel env vars.

const UPLOAD_URL = 'https://content.dropboxapi.com/2/files/upload';

export function isDropboxConfigured(): boolean {
  return !!process.env.DROPBOX_ACCESS_TOKEN;
}

export function dropboxReportPath(
  clientShortCode: string,
  reportMonth: string,
  filename: string,
): string {
  const base = (process.env.DROPBOX_CLIENTS_ROOT || '/FMX/04_CLIENTS').replace(/\/+$/, '');
  // KGF uses the historical path with the "4. Reporting" sub-folder; new
  // clients get a flatter structure. Override individually via env if needed.
  if (clientShortCode === 'KGF') {
    return `${base}/KGF/Client-wide/4. Reporting/FMX/${reportMonth}/${filename}`;
  }
  return `${base}/${clientShortCode}/Reports/${reportMonth}/${filename}`;
}

type UploadResult = { ok: true; path: string } | { ok: false; error: string };

// Per-property defect-photo mirror path. Folder name resolution:
// 1. Known KGF properties use the human-readable folder names Carl set up
// 2. Everything else uses the property short_code as folder name
const PROPERTY_FOLDER_NAMES: Record<string, string> = {
  GH: 'Gunu House',
  KH: 'Korobasaga',
  NH: 'Naibati House',
  OOFI: 'OOFI Onsite Sales Facility',
};

export function dropboxDefectPhotoPath(
  clientShortCode: string,
  propertyShortCode: string,
  defectNumber: string,
  yearMonth: string,
  filename: string,
): string {
  const base = (process.env.DROPBOX_CLIENTS_ROOT || '/FMX/04_CLIENTS').replace(/\/+$/, '');
  const propertyFolder = PROPERTY_FOLDER_NAMES[propertyShortCode] || propertyShortCode;
  return `${base}/${clientShortCode}/${propertyFolder}/02_Photos/${yearMonth}/${defectNumber}/${filename}`;
}

export async function uploadDefectPhotoToDropbox(
  clientShortCode: string,
  propertyShortCode: string,
  defectNumber: string,
  yearMonth: string,
  filename: string,
  buffer: Buffer,
  mimeType: string = 'application/octet-stream',
): Promise<UploadResult> {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'DROPBOX_ACCESS_TOKEN not configured' };

  const path = dropboxDefectPhotoPath(clientShortCode, propertyShortCode, defectNumber, yearMonth, filename);
  return uploadRaw(token, path, buffer, mimeType);
}

export async function uploadReportToDropbox(
  clientShortCode: string,
  reportMonth: string,
  filename: string,
  buffer: Buffer,
): Promise<UploadResult> {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'DROPBOX_ACCESS_TOKEN not configured' };

  const path = dropboxReportPath(clientShortCode, reportMonth, filename);
  return uploadRaw(token, path, buffer, 'application/octet-stream');
}

// -------------------------------------------------------------------------
// Internal: raw Dropbox upload. Both report-mirror and photo-mirror use this.
// -------------------------------------------------------------------------
async function uploadRaw(
  token: string,
  path: string,
  buffer: Buffer,
  mimeType: string,
): Promise<UploadResult> {
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
    const body = new Blob([ab], { type: mimeType });

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
