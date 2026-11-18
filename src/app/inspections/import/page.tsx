import { redirect } from 'next/navigation';
import ImportForm from './form';

export const dynamic = 'force-dynamic';

// FMX-065: paste-text template import. File upload (.docx / .xlsx) is a
// follow-up — plain text covers the first-pass need (Carl's current
// checklists live in Word / Excel; copy-paste from either works here).
export default function TemplateImportPage() {
  const key = process.env.QUICK_ADD_SECRET;
  if (!key) redirect('/');
  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-navy mb-1">Import template</h1>
      <p className="text-sm text-muted mb-5">
        Paste a list of questions, one per line, from your Word or Excel checklist. Each line becomes one Yes/No item (edit kind + flags after). Leading bullets, numbers, and dashes are stripped automatically.
      </p>
      <ImportForm secretKey={key} />
    </div>
  );
}
