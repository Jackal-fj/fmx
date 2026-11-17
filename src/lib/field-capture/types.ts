// FMX-048: shared TypeScript types for the append-only field-capture
// tables. Phones mint UUIDs client-side (crypto.randomUUID) so writes
// are idempotent on sync; the server trusts the id and uses upsert.

export type InspectionSession = {
  id: string;                  // client-assigned uuid
  template_id: string;
  property_id?: string | null;
  asset_id?: string | null;
  inspector_name?: string | null;
  started_at: string;          // ISO
  completed_at?: string | null;
  signature_data_url?: string | null;
  attendance_photo_url?: string | null;
  notes?: string | null;
  source?: 'web' | 'mobile' | 'import';
};

export type InspectionResult = {
  id: string;                  // client-assigned uuid
  session_id: string;
  template_item_id: string;
  sort_order: number;
  question: string;
  kind: 'yes_no' | 'rating' | 'number' | 'text';
  answer_bool?: boolean | null;
  answer_number?: number | null;
  answer_text?: string | null;
  photo_urls?: string[];
  voice_note_url?: string | null;
  failed?: boolean;
  failure_reason?: string | null;
  defect_id?: string | null;
  answered_at: string;         // ISO
};

export type ScanEvent = {
  id: string;
  target_kind: 'property' | 'asset' | 'client' | 'agreement' | 'defect' | 'vendor' | 'other';
  target_id: string;
  target_path?: string | null;
  scanned_by?: string | null;
  context?: string | null;
  session_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  scanned_at: string;          // ISO
};

export type Reading = {
  id: string;
  asset_id?: string | null;
  property_id?: string | null;
  kind: string;
  value_number?: number | null;
  value_text?: string | null;
  unit?: string | null;
  session_id?: string | null;
  taken_by?: string | null;
  photo_url?: string | null;
  taken_at: string;            // ISO
};
