'use server';

// FMX-080: approval actions for queued outbound tenant messages.
// Thin pass-through to the queue module, with a QUICK_ADD_SECRET gate.

import { revalidatePath } from 'next/cache';
import { sendQueuedOutbound, skipQueuedOutbound } from '@/lib/outbound-messaging/queue';

type Result = { ok: boolean; error?: string };

export async function approveSend(id: string, secretKey: string): Promise<Result> {
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || secretKey !== required) return { ok: false, error: 'Not authorised.' };
  const r = await sendQueuedOutbound(id);
  revalidatePath('/tenant-outbound');
  return r;
}

export async function skipMessage(id: string, secretKey: string): Promise<Result> {
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || secretKey !== required) return { ok: false, error: 'Not authorised.' };
  const r = await skipQueuedOutbound(id);
  revalidatePath('/tenant-outbound');
  return r;
}
