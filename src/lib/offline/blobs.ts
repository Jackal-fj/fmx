'use client';

// FMX-072: tiny helpers around the pending_blobs Dexie table.
// Blobs are keyed by client-assigned uuid; the queue payload references
// them by id, so a photo and its queued upload-op can live in different
// rows without a join.

import { db } from './db';

export async function storeBlob(blob: Blob): Promise<string> {
  const id = crypto.randomUUID();
  await db().blobs.add({
    id,
    blob,
    mime: blob.type || 'application/octet-stream',
    size: blob.size,
    createdAt: Date.now(),
  });
  return id;
}

export async function getBlob(id: string): Promise<Blob | null> {
  const row = await db().blobs.get(id);
  return row?.blob || null;
}

export async function deleteBlob(id: string): Promise<void> {
  await db().blobs.delete(id);
}
