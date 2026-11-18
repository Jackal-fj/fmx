'use server';

// FMX-051: resolve a logged write conflict. Three outcomes:
//   • 'acknowledged'   — Carl reviewed; whatever the merge wrote stays.
//   • 'kept_incoming'  — revert to the value the client tried to write.
//   • 'kept_server'    — revert to what the server held before the merge.
// The audit row records the choice; the target row gets patched only if
// the choice requires a change.

import { supabaseServer } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

type Choice = 'acknowledged' | 'kept_incoming' | 'kept_server';

export async function resolveConflict(
  conflictId: string,
  choice: Choice,
  secretKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const required = process.env.QUICK_ADD_SECRET;
  if (!required || secretKey !== required) return { ok: false, error: 'Not authorised.' };
  if (!conflictId) return { ok: false, error: 'Missing conflict id.' };
  if (!['acknowledged', 'kept_incoming', 'kept_server'].includes(choice)) {
    return { ok: false, error: 'Invalid choice.' };
  }

  const { data: conflict, error: readErr } = await supabaseServer
    .from('write_conflicts')
    .select('id, table_name, row_id, column_name, server_value, incoming_value, resolved_at')
    .eq('id', conflictId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!conflict) return { ok: false, error: 'Conflict not found.' };
  if (conflict.resolved_at) return { ok: false, error: 'Already resolved.' };

  // Only mutate the target row when the choice differs from what's there.
  if (choice === 'kept_incoming' || choice === 'kept_server') {
    const targetValue = choice === 'kept_incoming' ? conflict.incoming_value : conflict.server_value;
    const { error: upErr } = await supabaseServer
      .from(conflict.table_name)
      .update({ [conflict.column_name]: targetValue, updated_at: new Date().toISOString() })
      .eq('id', conflict.row_id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  const { error: logErr } = await supabaseServer
    .from('write_conflicts')
    .update({
      resolved_at: new Date().toISOString(),
      resolution: choice,
    })
    .eq('id', conflictId);
  if (logErr) return { ok: false, error: logErr.message };

  revalidatePath('/conflicts');
  return { ok: true };
}
