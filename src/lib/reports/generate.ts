// FMX Monthly FM Report Generator v2 — polished CMS Fiji branding.
// - Cover page with CMS Fiji brand accent (dark purple #402D41)
// - Executive summary as first interior page with headline KPIs
// - Priority matrix highlighting critical/major items
// - Open defects with age analysis (days-open) + first photo embedded
// - Compliance calendar for the next 60 days
// - Notes and recommendations

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  TabStopType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, ImageRun,
} from 'docx';

import type {
  ReportSnapshot, Property, Fca, DefectCount, OpenDefect,
  ServiceContractRow, AssetSummaryRow, ComplianceEvent,
} from './data';

const COMPANY = 'Commercial Management Solutions Pte Limited';
const COMPANY_SHORT = 'CMS Fiji';
const COMPANY_TAGLINE = 'Project, Logistics & Facilities Management';
const COMPANY_CONTACT = '414 Victoria Parade, Suva   |   +679 331 7156   |   carl@cmsfiji.com';

// ----- palette --------------------------------------------------------------
// Simple, plain, elegant, professional. Grayscale primary with restrained
// use of colour reserved for genuine signal (critical severity, resolved).

const FONT = 'Calibri';
const HEADING_COLOR  = '1A1A1A';   // headings + primary emphasis
const COLOR_TEXT     = '1A1A1A';
const COLOR_MUTED    = '6B6B6B';
const COLOR_BORDER   = 'D6D6D6';
const SHADE_HEADER   = 'F2F2F2';   // very light gray
const SHADE_ROW_ALT  = 'FAFAFA';
const OK_GREEN       = '1F7A3D';   // used sparingly for resolved counts
const WARN_AMBER     = 'B87200';   // for aged items
const BAD_RED        = 'A6202D';   // critical only

// Legacy names kept as aliases to reduce diff churn in the rest of the file.
const BRAND_PURPLE = HEADING_COLOR;
const BRAND_GOLD   = COLOR_MUTED;

const PAGE_WIDTH   = 12240;
const PAGE_HEIGHT  = 15840;
const MARGIN       = 1080;
const CONTENT_W    = PAGE_WIDTH - 2 * MARGIN;

const border = { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function monthLabel(reportMonth: string): string {
  const [y, m] = reportMonth.split('-').map(Number);
  const months = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  return `${months[m - 1]} ${y}`;
}

// ----- helpers --------------------------------------------------------------

function p(text: string, opts: any = {}): Paragraph {
  const { bold = false, italics = false, color = COLOR_TEXT, size = 22, spaceAfter = 80, align } = opts;
  return new Paragraph({
    alignment: align,
    spacing: { after: spaceAfter },
    children: [new TextRun({ text, bold, italics, color, size, font: FONT })],
  });
}

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND_PURPLE, space: 8 } },
    children: [new TextRun({ text, bold: true, size: 32, color: BRAND_PURPLE, font: FONT })],
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: BRAND_PURPLE, font: FONT })],
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, color: COLOR_MUTED, font: FONT })],
  });
}

function muted(text: string): Paragraph {
  return p(text, { italics: true, color: COLOR_MUTED, size: 18 });
}

function cell(text: any, opts: any = {}): TableCell {
  const {
    bold = false, color = COLOR_TEXT, fill, width, align = AlignmentType.LEFT,
    size = 20, font = FONT, children,
  } = opts;
  return new TableCell({
    borders: cellBorders,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: fill ? { fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: children || [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text ?? ''), bold, color, size, font })],
    })],
  });
}

function table(rows: TableRow[], columnWidths: number[], opts: any = {}): Table {
  const total = columnWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths,
    rows,
    ...opts,
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

function ratingColor(label: string | null | undefined): string {
  switch ((label || '').toLowerCase()) {
    case 'excellent':
    case 'good':       return OK_GREEN;
    case 'adequate':   return BRAND_PURPLE;
    case 'marginal':   return WARN_AMBER;
    case 'poor':
    case 'failed':     return BAD_RED;
    default:           return COLOR_MUTED;
  }
}

function severityColor(s: string | null | undefined): string {
  switch ((s || '').toLowerCase()) {
    case 'critical': return BAD_RED;
    case 'major':    return BAD_RED;
    case 'moderate': return WARN_AMBER;
    case 'minor':    return COLOR_MUTED;
    default:         return COLOR_MUTED;
  }
}

// ----- page furniture -------------------------------------------------------

function buildHeader(title: string): Header {
  return new Header({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND_PURPLE, space: 4 } },
      children: [
        new TextRun({ text: COMPANY_SHORT, bold: true, size: 18, color: BRAND_PURPLE, font: FONT }),
        new TextRun({ text: '\t' + title, size: 18, color: COLOR_MUTED, font: FONT }),
      ],
    })],
  });
}

function buildFooter(reportLabel: string, reportDate: string): Footer {
  return new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      children: [
        new TextRun({ text: `${reportLabel} FM Report  •  Issued ${reportDate}  •  Confidential`, size: 16, color: COLOR_MUTED, font: FONT }),
        new TextRun({ text: '\tPage ', size: 16, color: COLOR_MUTED, font: FONT }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLOR_MUTED, font: FONT }),
        new TextRun({ text: ' of ', size: 16, color: COLOR_MUTED, font: FONT }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: COLOR_MUTED, font: FONT }),
      ],
    })],
  });
}

const baseStyles = {
  default: { document: { run: { font: FONT, size: 22 } } },
  paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 32, bold: true, font: FONT, color: BRAND_PURPLE },
      paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 26, bold: true, font: FONT, color: BRAND_PURPLE },
      paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 22, bold: true, font: FONT, color: COLOR_MUTED },
      paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
  ],
};

const numberingConfig = {
  config: [
    { reference: 'bullets',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ],
};

function bullet(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text, size: 22, font: FONT, color: COLOR_TEXT })],
  });
}

// ----- cover page -----------------------------------------------------------

function coverPage({ title, subtitle, propLabel, reportDate }: {
  title: string; subtitle: string; propLabel?: string; reportDate: string;
}): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 2000 }, children: [] }),

    // Small top tagline
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 400 },
      children: [new TextRun({ text: COMPANY_TAGLINE.toUpperCase(), size: 18, color: BRAND_GOLD, font: FONT, characterSpacing: 60 })],
    }),

    // Big Kinetic Growth Fund
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: 'Kinetic Growth Fund', bold: true, size: 44, color: BRAND_PURPLE, font: FONT })],
    }),

    // Divider line
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 400 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND_PURPLE, space: 4 } },
      children: [],
    }),

    // Report title
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: [new TextRun({ text: title, bold: true, size: 40, color: COLOR_TEXT, font: FONT })],
    }),

    // Month subtitle
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 240 },
      children: [new TextRun({ text: subtitle, size: 28, color: COLOR_MUTED, font: FONT })],
    }),

    // Property label
    propLabel ? new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: [new TextRun({ text: propLabel, italics: true, size: 22, color: COLOR_MUTED, font: FONT })],
    }) : new Paragraph({ children: [] }),

    new Paragraph({ spacing: { before: 1800 }, children: [] }),

    // Prepared by block
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 60 },
      children: [new TextRun({ text: 'PREPARED BY', size: 18, color: COLOR_MUTED, font: FONT, characterSpacing: 40 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 40 },
      children: [new TextRun({ text: COMPANY, bold: true, size: 24, color: BRAND_PURPLE, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: [new TextRun({ text: COMPANY_CONTACT, size: 18, color: COLOR_MUTED, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: `Issued ${reportDate}`, italics: true, size: 18, color: COLOR_MUTED, font: FONT })],
    }),

    pageBreak(),
  ];
}

// ----- KPI banner (used in executive summary) -------------------------------

function kpiBanner(items: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }>): Table {
  const widths: number[] = new Array(items.length).fill(Math.floor(CONTENT_W / items.length));
  const toneColor = (t?: string) => t === 'good' ? OK_GREEN : t === 'warn' ? WARN_AMBER : t === 'bad' ? BAD_RED : BRAND_PURPLE;

  const row = new TableRow({
    children: items.map((it, i) => new TableCell({
      borders: cellBorders,
      width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: 'F9F7FA', type: ShadingType.CLEAR, color: 'auto' },
      margins: { top: 160, bottom: 160, left: 120, right: 120 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 40 },
          children: [new TextRun({ text: it.label.toUpperCase(), size: 16, color: COLOR_MUTED, font: FONT, characterSpacing: 30 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: it.value, bold: true, size: 40, color: toneColor(it.tone), font: FONT })],
        }),
      ],
    })),
  });
  return table([row], widths);
}

// ----- photo loader ---------------------------------------------------------

async function fetchImageAsBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

async function imageParagraph(url: string, maxWidth = 1400): Promise<Paragraph | null> {
  const buf = await fetchImageAsBuffer(url);
  if (!buf) return null;
  try {
    // Use fixed dimensions; docx will scale. We aim for ~200x150 in report body.
    return new Paragraph({
      children: [new ImageRun({
        // @ts-expect-error — docx typing across versions varies for buffer input
        data: buf,
        transformation: { width: 180, height: 135 },
      })],
    });
  } catch {
    return null;
  }
}

// ----- section builders -----------------------------------------------------

function fcaTable(fca: Fca | undefined): (Paragraph | Table)[] {
  if (!fca) return [muted('No condition assessment on record.')];
  const cw = [3200, 1600, 1400, CONTENT_W - 6200];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Component',   { bold: true, fill: SHADE_HEADER, width: cw[0], color: BRAND_PURPLE }),
      cell('Rating',      { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Score',       { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('',            { bold: true, fill: SHADE_HEADER, width: cw[3] }),
    ],
  });
  const rows = fca.components.map(([name, label, score], i) => new TableRow({
    children: [
      cell(name,                                        { width: cw[0], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(label,                                       { width: cw[1], align: AlignmentType.CENTER, color: ratingColor(label), bold: true, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(score == null ? '—' : score.toFixed(2),     { width: cw[2], align: AlignmentType.CENTER, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell('',                                          { width: cw[3], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
    ],
  }));
  const overallRow = new TableRow({
    children: [
      cell('OVERALL',                                                       { bold: true, width: cw[0], fill: SHADE_HEADER, color: BRAND_PURPLE }),
      cell((fca.overall_rating || '').toUpperCase(),                        { bold: true, width: cw[1], align: AlignmentType.CENTER, color: ratingColor(fca.overall_rating), fill: SHADE_HEADER }),
      cell(fca.numeric_score == null ? '—' : Number(fca.numeric_score).toFixed(2), { bold: true, width: cw[2], align: AlignmentType.CENTER, fill: SHADE_HEADER }),
      cell(`${fca.photo_count || 0} reference photos`,                       { width: cw[3], fill: SHADE_HEADER, color: COLOR_MUTED }),
    ],
  });
  return [table([header, ...rows, overallRow], cw)];
}

function defectCountTable(dc: DefectCount | undefined): (Paragraph | Table)[] {
  const c = dc || { open:0, resolved:0, work_ordered:0, critical_open:0, major_open:0, moderate_open:0, minor_open:0 };
  const cw = [2200, 1400, 1400, 1400, 1400, CONTENT_W - 7800];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Status',     { bold: true, fill: SHADE_HEADER, width: cw[0], color: BRAND_PURPLE }),
      cell('Critical',   { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Major',      { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Moderate',   { bold: true, fill: SHADE_HEADER, width: cw[3], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Minor',      { bold: true, fill: SHADE_HEADER, width: cw[4], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Total',      { bold: true, fill: SHADE_HEADER, width: cw[5], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
    ],
  });
  const openRow = new TableRow({
    children: [
      cell('Open',                  { width: cw[0], bold: true }),
      cell(c.critical_open,         { width: cw[1], align: AlignmentType.CENTER, color: c.critical_open ? BAD_RED : COLOR_MUTED, bold: !!c.critical_open }),
      cell(c.major_open,            { width: cw[2], align: AlignmentType.CENTER, color: c.major_open ? BAD_RED : COLOR_MUTED, bold: !!c.major_open }),
      cell(c.moderate_open,         { width: cw[3], align: AlignmentType.CENTER }),
      cell(c.minor_open,            { width: cw[4], align: AlignmentType.CENTER }),
      cell(c.open + (c.work_ordered||0), { width: cw[5], align: AlignmentType.CENTER, bold: true }),
    ],
  });
  const resolvedRow = new TableRow({
    children: [
      cell('Resolved (cumulative)', { width: cw[0], bold: true }),
      cell('—', { width: cw[1], align: AlignmentType.CENTER }),
      cell('—', { width: cw[2], align: AlignmentType.CENTER }),
      cell('—', { width: cw[3], align: AlignmentType.CENTER }),
      cell('—', { width: cw[4], align: AlignmentType.CENTER }),
      cell(c.resolved, { width: cw[5], align: AlignmentType.CENTER, color: OK_GREEN, bold: true }),
    ],
  });
  return [table([header, openRow, resolvedRow], cw)];
}

// Open defects table with age-in-days + first-photo column
async function openDefectsTable(list: OpenDefect[], embedPhotos: boolean): Promise<(Paragraph | Table)[]> {
  if (list.length === 0) return [muted('No open defects.')];

  // Sort oldest first (highest days_open at top)
  const sorted = [...list].sort((a, b) => (b.days_open ?? 0) - (a.days_open ?? 0));

  const cw = [1200, 900, 1000, 1300, CONTENT_W - 4400 - 1600, 1600];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Ref',        { bold: true, fill: SHADE_HEADER, width: cw[0], color: BRAND_PURPLE }),
      cell('Severity',   { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Days Open',  { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Location',   { bold: true, fill: SHADE_HEADER, width: cw[3], color: BRAND_PURPLE }),
      cell('Defect',     { bold: true, fill: SHADE_HEADER, width: cw[4], color: BRAND_PURPLE }),
      cell('Photo',      { bold: true, fill: SHADE_HEADER, width: cw[5], color: BRAND_PURPLE, align: AlignmentType.CENTER }),
    ],
  });

  // Only embed photos for critical/major, first URL, first 15 rows to keep size sane
  const eligible = sorted.filter(d => embedPhotos && d.photo_urls.length > 0 &&
    (d.severity === 'critical' || d.severity === 'major')).slice(0, 15);
  const photoParaByRef = new Map<string, Paragraph>();
  for (const d of eligible) {
    const pg = await imageParagraph(d.photo_urls[0]);
    if (pg) photoParaByRef.set(d.defect_number, pg);
  }

  const rows = sorted.map((d, i) => {
    const ageDisplay = d.days_open == null ? '—' : `${d.days_open}d`;
    const ageColor = (d.days_open ?? 0) > 90 ? BAD_RED
                   : (d.days_open ?? 0) > 30 ? WARN_AMBER
                   : COLOR_TEXT;
    const photoCell = photoParaByRef.has(d.defect_number)
      ? cell('', { width: cw[5], fill: i % 2 ? SHADE_ROW_ALT : undefined, children: [photoParaByRef.get(d.defect_number)!] })
      : cell(d.photo_urls.length > 0 ? `${d.photo_urls.length} on file` : '—',
          { width: cw[5], size: 16, align: AlignmentType.CENTER, color: COLOR_MUTED, fill: i % 2 ? SHADE_ROW_ALT : undefined });

    return new TableRow({
      children: [
        cell(d.defect_number, { width: cw[0], size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell((d.severity || '').toUpperCase(), { width: cw[1], align: AlignmentType.CENTER, color: severityColor(d.severity), bold: true, size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(ageDisplay, { width: cw[2], align: AlignmentType.CENTER, color: ageColor, bold: (d.days_open ?? 0) > 30, size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(d.space || '—', { width: cw[3], size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(`${d.title}\n${d.description || ''}`.trim(), { width: cw[4], size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        photoCell,
      ],
    });
  });

  return [table([header, ...rows], cw)];
}

function priorityMatrix(list: OpenDefect[]): (Paragraph | Table)[] {
  // Critical + major only, oldest first, top 8
  const focus = list
    .filter(d => d.severity === 'critical' || d.severity === 'major')
    .sort((a, b) => (b.days_open ?? 0) - (a.days_open ?? 0))
    .slice(0, 8);

  if (focus.length === 0) {
    return [
      p('No critical or major open defects.', { color: OK_GREEN, bold: true }),
    ];
  }

  const rows: Paragraph[] = [
    p(`${focus.length} critical/major item${focus.length === 1 ? '' : 's'} requiring attention, ordered by age:`, { spaceAfter: 120 }),
  ];

  for (const d of focus) {
    const age = d.days_open == null ? '' : `${d.days_open} days open`;
    rows.push(new Paragraph({
      spacing: { after: 60 },
      numbering: { reference: 'bullets', level: 0 },
      children: [
        new TextRun({ text: `${(d.severity || '').toUpperCase()}   `, bold: true, color: severityColor(d.severity), size: 20, font: FONT }),
        new TextRun({ text: `${d.defect_number}   `, size: 20, color: COLOR_MUTED, font: FONT }),
        new TextRun({ text: `${d.space} — ${d.title}   `, size: 22, font: FONT, color: COLOR_TEXT }),
        new TextRun({ text: age ? `(${age})` : '', italics: true, size: 20, color: (d.days_open ?? 0) > 90 ? BAD_RED : COLOR_MUTED, font: FONT }),
      ],
    }));
  }
  return rows;
}

function complianceCalendarTable(events: ComplianceEvent[], shortCode?: string): (Paragraph | Table)[] {
  const filtered = shortCode
    ? events.filter(e => e.short_code === shortCode || e.short_code === null)
    : events;

  if (filtered.length === 0) {
    return [muted('No compliance or servicing events due in the next 60 days.')];
  }

  const cw = [1400, 3200, 2600, CONTENT_W - 7200];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Due',       { bold: true, fill: SHADE_HEADER, width: cw[0], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Item',      { bold: true, fill: SHADE_HEADER, width: cw[1], color: BRAND_PURPLE }),
      cell('Detail',    { bold: true, fill: SHADE_HEADER, width: cw[2], color: BRAND_PURPLE }),
      cell('Kind',      { bold: true, fill: SHADE_HEADER, width: cw[3], color: BRAND_PURPLE }),
    ],
  });
  const rows = filtered.map((e, i) => {
    const dueColor = e.days_until < 0 ? BAD_RED : e.days_until < 15 ? WARN_AMBER : COLOR_TEXT;
    const dueLabel = e.days_until < 0 ? `${Math.abs(e.days_until)}d ago`
                  : e.days_until === 0 ? 'Today'
                  : `${e.days_until}d`;
    const kindLabel = e.kind === 'service_contract' ? 'Service contract'
                   : e.kind === 'asset_pm' ? 'Asset PM'
                   : 'Contract renewal';
    return new TableRow({
      children: [
        cell(dueLabel, { width: cw[0], align: AlignmentType.CENTER, color: dueColor, bold: e.days_until < 15, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(e.label, { width: cw[1], bold: true, size: 20, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(e.detail, { width: cw[2], size: 18, color: COLOR_MUTED, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(kindLabel, { width: cw[3], size: 18, color: COLOR_MUTED, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      ],
    });
  });
  return [table([header, ...rows], cw)];
}

function serviceContractsTable(list: ServiceContractRow[]): (Paragraph | Table)[] {
  if (list.length === 0) return [muted('No active service contracts on record.')];
  const cw = [3600, 1800, 1500, 1500, CONTENT_W - 8400];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Contract',          { bold: true, fill: SHADE_HEADER, width: cw[0], color: BRAND_PURPLE }),
      cell('Frequency',         { bold: true, fill: SHADE_HEADER, width: cw[1], color: BRAND_PURPLE }),
      cell('Fee',               { bold: true, fill: SHADE_HEADER, width: cw[2], color: BRAND_PURPLE, align: AlignmentType.RIGHT }),
      cell('Next Service',      { bold: true, fill: SHADE_HEADER, width: cw[3], color: BRAND_PURPLE }),
      cell('Provider',          { bold: true, fill: SHADE_HEADER, width: cw[4], color: BRAND_PURPLE }),
    ],
  });
  const rows = list.map((sc, i) => new TableRow({
    children: [
      cell(sc.contract_name, { width: cw[0], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(sc.frequency || '—', { width: cw[1], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(sc.fee_amount == null ? 'TBC' : `${sc.fee_currency} ${Number(sc.fee_amount).toFixed(2)}`, { width: cw[2], align: AlignmentType.RIGHT, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(sc.next_service_date || 'TBC', { width: cw[3], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(sc.provider_name || '—', { width: cw[4], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
    ],
  }));
  return [table([header, ...rows], cw)];
}

function assetSummaryTable(list: AssetSummaryRow[]): (Paragraph | Table)[] {
  if (list.length === 0) return [muted('No registered assets.')];
  const cw = [3600, 1500, 1500, 1500, CONTENT_W - 8100];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Asset class',  { bold: true, fill: SHADE_HEADER, width: cw[0], color: BRAND_PURPLE }),
      cell('Count',        { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Good',         { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Poor',         { bold: true, fill: SHADE_HEADER, width: cw[3], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Failed',       { bold: true, fill: SHADE_HEADER, width: cw[4], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
    ],
  });
  const rows = list.map((a, i) => new TableRow({
    children: [
      cell(a.asset_type, { width: cw[0], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(a.count, { width: cw[1], align: AlignmentType.CENTER, bold: true, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(a.good, { width: cw[2], align: AlignmentType.CENTER, color: OK_GREEN, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(a.poor, { width: cw[3], align: AlignmentType.CENTER, color: a.poor ? WARN_AMBER : COLOR_MUTED, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(a.failed, { width: cw[4], align: AlignmentType.CENTER, color: a.failed ? BAD_RED : COLOR_MUTED, bold: !!a.failed, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
    ],
  }));
  return [table([header, ...rows], cw)];
}

// ----- per-property report --------------------------------------------------

async function propertyReport(prop: Property, snap: ReportSnapshot, reportMonth: string): Promise<Document> {
  const reportLabel = monthLabel(reportMonth);
  const reportDate = new Date().toISOString().slice(0, 10);
  const fca = snap.fcas.find(f => f.short_code === prop.short_code);
  const dc  = snap.defectCounts.find(d => d.short_code === prop.short_code);
  const resolved = snap.resolvedThisMonth.find(r => r.short_code === prop.short_code)?.count ?? 0;
  const propOpenDefects = snap.openDefects.filter(d => d.short_code === prop.short_code);
  const propLabel = `${prop.name} (${prop.short_code})  •  ${prop.tenant_name || '—'}`;

  const totalOpen = (dc?.open || 0) + (dc?.work_ordered || 0);
  const criticalCount = dc?.critical_open || 0;
  const majorCount = dc?.major_open || 0;
  const overdue90 = propOpenDefects.filter(d => (d.days_open ?? 0) > 90 && (d.severity === 'critical' || d.severity === 'major')).length;

  const openDefectsRows = await openDefectsTable(propOpenDefects, true);

  const children: any[] = [
    ...coverPage({
      title: `${prop.name} — FM Report`,
      subtitle: reportLabel,
      propLabel,
      reportDate,
    }),

    // Executive Summary
    h1('Executive Summary'),
    p(`This report covers facility management activity at ${prop.name} for ${reportLabel}. It consolidates the latest Facility Condition Assessment, the current defect tracker, servicing schedule, and asset register.`, { spaceAfter: 200 }),

    kpiBanner([
      { label: 'FCA Rating',   value: (fca?.overall_rating || '—').toUpperCase(),
        tone: fca?.overall_rating === 'good' || fca?.overall_rating === 'excellent' ? 'good'
            : fca?.overall_rating === 'marginal' ? 'warn'
            : fca?.overall_rating === 'poor' || fca?.overall_rating === 'failed' ? 'bad' : 'neutral' },
      { label: 'FCA Score',    value: fca?.numeric_score == null ? '—' : Number(fca.numeric_score).toFixed(2), tone: 'neutral' },
      { label: 'Open Defects', value: String(totalOpen), tone: totalOpen === 0 ? 'good' : totalOpen > 20 ? 'bad' : 'warn' },
      { label: 'Critical',     value: String(criticalCount), tone: criticalCount === 0 ? 'good' : 'bad' },
      { label: 'Resolved (mo)', value: String(resolved), tone: 'good' },
    ]),

    new Paragraph({ spacing: { before: 240 }, children: [] }),

    overdue90 > 0
      ? p(`${overdue90} critical or major defect${overdue90 === 1 ? '' : 's'} have been open for more than 90 days.`, { color: BAD_RED, bold: true, spaceAfter: 120 })
      : p('No critical or major defects open beyond 90 days.', { color: OK_GREEN, spaceAfter: 120 }),

    h2('Immediate Priorities'),
    ...priorityMatrix(propOpenDefects),

    pageBreak(),

    // Property Snapshot
    h1('1. Property Snapshot'),
    table([
      new TableRow({ children: [
        cell('Property', { bold: true, fill: SHADE_HEADER, width: 2800, color: BRAND_PURPLE }),
        cell(`${prop.name} (${prop.short_code})`, { width: CONTENT_W - 2800 }),
      ]}),
      new TableRow({ children: [
        cell('Address', { bold: true, fill: SHADE_HEADER, width: 2800, color: BRAND_PURPLE }),
        cell(prop.address || '—', { width: CONTENT_W - 2800 }),
      ]}),
      new TableRow({ children: [
        cell('Facility type', { bold: true, fill: SHADE_HEADER, width: 2800, color: BRAND_PURPLE }),
        cell(`${prop.facility_type || '—'}${prop.storeys ? ` • ${prop.storeys} storeys` : ''}`, { width: CONTENT_W - 2800 }),
      ]}),
      new TableRow({ children: [
        cell('Tenant', { bold: true, fill: SHADE_HEADER, width: 2800, color: BRAND_PURPLE }),
        cell(`${prop.tenant_name || '—'}${prop.tenant_short_code ? ` (${prop.tenant_short_code})` : ''}`, { width: CONTENT_W - 2800 }),
      ]}),
      new TableRow({ children: [
        cell('Last FCA', { bold: true, fill: SHADE_HEADER, width: 2800, color: BRAND_PURPLE }),
        cell(fca?.assessed_at ? `${fca.assessed_at} — ${fca.overall_rating?.toUpperCase()} (${Number(fca.numeric_score).toFixed(2)})` : '—', { width: CONTENT_W - 2800 }),
      ]}),
    ], [2800, CONTENT_W - 2800]),

    h1('2. Facility Condition Assessment'),
    p(fca?.summary || 'No condition assessment on record.', { spaceAfter: 160 }),
    h3('Component scores'),
    ...fcaTable(fca),
    h3('Recommendations'),
    p(fca?.recommendations || '—'),

    h1('3. Defect Tracker'),
    h3('Status summary'),
    ...defectCountTable(dc),
    h3('Open defects (oldest first, photos where available)'),
    ...openDefectsRows,

    h1('4. Compliance & PM Calendar — next 60 days'),
    ...complianceCalendarTable(snap.complianceEvents, prop.short_code),

    h1('5. Asset Register'),
    ...assetSummaryTable(snap.assetSummary.filter(a => a.short_code === prop.short_code)),

    h1('6. Service Contracts'),
    ...serviceContractsTable(snap.serviceContracts.filter(sc => sc.short_code === prop.short_code)),

    h1('7. Notes & Recommendations'),
    ...propertyNotes(prop.short_code),
  ];

  return new Document({
    creator: COMPANY,
    title: `${prop.name} ${reportLabel} FM Report`,
    description: `Monthly facility management report — ${prop.name} (${prop.short_code})`,
    styles: baseStyles,
    numbering: numberingConfig,
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: { default: buildHeader(`${prop.name} (${prop.short_code}) — ${reportLabel}`) },
      footers: { default: buildFooter(reportLabel, reportDate) },
      children,
    }],
  });
}

function propertyNotes(shortCode: string): Paragraph[] {
  if (shortCode === 'GH') {
    return [
      bullet('Fire alarm panel inactive — IFS site visit before next monthly test would close that risk.'),
      bullet('Tenant-installed backup generator continues under CARPTRAC PM. Verify whether KGF inherits PM cost on tenancy expiry.'),
      bullet('AC register: 32 units, 8 flagged Poor and 1 (2F1) flagged for immediate replacement.'),
      bullet('Driveway pavement / WAF service compromise: notify FRA and WAF for external infrastructure remediation.'),
    ];
  }
  if (shortCode === 'KH') {
    return [
      bullet('Fire protection rated POOR — fire alarm panel inactive, no extinguishers visible. Fire reactivation is the highest priority.'),
      bullet('Plumbing: 26 items remediated (Feb 2026). 5 outstanding non-critical items remain — non-return valves on water tank flagged as major.'),
      bullet('Storage and clutter onsite is a critical OHS concern; tenant should be advised to seek alternative storage solutions.'),
      bullet('AC audit not yet captured for this property — schedule when next on site.'),
    ];
  }
  if (shortCode === 'NH') {
    return [
      bullet('CRITICAL: L2 server room GPOs likely overloaded — fire and operational continuity risk. Should be top of next dispatch list.'),
      bullet('Conveyance Poor (1) — elevator shaft and well requires follow-up inspection by qualified inspector.'),
      bullet('Backup generator and water supply have NOT been completed despite tenancy agreement — formal letter to tenant recommended.'),
      bullet('44 open electrical items (1 critical, 9 major, 5 moderate, 29 minor). Bulk troffer-tube and GPO checks can be batched into one electrical campaign.'),
      bullet('AC register: 22 placeholder records — fill make/model/serial from V3.1 Gatekeeper xlsm or via scheduled re-audit.'),
    ];
  }
  return [muted('—')];
}

// ----- portfolio report -----------------------------------------------------

async function portfolioReport(snap: ReportSnapshot, reportMonth: string): Promise<Document> {
  const reportLabel = monthLabel(reportMonth);
  const reportDate = new Date().toISOString().slice(0, 10);

  const totals = snap.defectCounts.reduce((a, d) => ({
    open: a.open + d.open + d.work_ordered,
    resolved: a.resolved + d.resolved,
    critical_open: a.critical_open + d.critical_open,
    major_open: a.major_open + d.major_open,
  }), { open: 0, resolved: 0, critical_open: 0, major_open: 0 });

  const totalResolvedThisMonth = snap.resolvedThisMonth.reduce((a, r) => a + r.count, 0);

  const portfolioFcaAvg = (() => {
    const scored = snap.fcas.filter(f => f.numeric_score != null);
    if (scored.length === 0) return null;
    return scored.reduce((a, f) => a + Number(f.numeric_score), 0) / scored.length;
  })();

  const overdue90Count = snap.openDefects.filter(d =>
    (d.days_open ?? 0) > 90 && (d.severity === 'critical' || d.severity === 'major')
  ).length;

  const fcaBy = new Map(snap.fcas.map(f => [f.short_code, f]));
  const dcBy = new Map(snap.defectCounts.map(d => [d.short_code, d]));

  const cw = [2400, 1600, 1500, 1500, CONTENT_W - 7000];
  const portfolioHeader = new TableRow({
    tableHeader: true,
    children: [
      cell('Property',        { bold: true, fill: SHADE_HEADER, width: cw[0], color: BRAND_PURPLE }),
      cell('FCA Rating',      { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Score',           { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Open defects',    { bold: true, fill: SHADE_HEADER, width: cw[3], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Tenant',          { bold: true, fill: SHADE_HEADER, width: cw[4], color: BRAND_PURPLE }),
    ],
  });
  const portfolioRows = snap.properties.map((prop, i) => {
    const fca = fcaBy.get(prop.short_code);
    const dc  = dcBy.get(prop.short_code);
    const totalOpen = (dc?.open || 0) + (dc?.work_ordered || 0);
    return new TableRow({
      children: [
        cell(`${prop.name} (${prop.short_code})`, { width: cw[0], bold: true, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell((fca?.overall_rating || '—').toUpperCase(), { width: cw[1], align: AlignmentType.CENTER, color: ratingColor(fca?.overall_rating), bold: true, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(fca?.numeric_score == null ? '—' : Number(fca.numeric_score).toFixed(2), { width: cw[2], align: AlignmentType.CENTER, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(totalOpen, { width: cw[3], align: AlignmentType.CENTER, bold: totalOpen > 0, color: totalOpen > 0 ? BAD_RED : COLOR_MUTED, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(prop.tenant_name || '—', { width: cw[4], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      ],
    });
  });

  const openDefectsRows = await openDefectsTable(
    snap.openDefects.filter(d => d.severity === 'critical' || d.severity === 'major'),
    true,
  );

  const children: any[] = [
    ...coverPage({
      title: 'KGF Portfolio FM Report',
      subtitle: reportLabel,
      propLabel: `${snap.properties.length} properties  •  Suva, Fiji`,
      reportDate,
    }),

    h1('Executive Summary'),
    p(`This report consolidates facility management activity across the KGF portfolio for ${reportLabel}. Data as at ${reportDate}.`, { spaceAfter: 200 }),

    kpiBanner([
      { label: 'Portfolio FCA', value: portfolioFcaAvg == null ? '—' : portfolioFcaAvg.toFixed(2), tone: 'neutral' },
      { label: 'Open Defects',  value: String(totals.open), tone: totals.open === 0 ? 'good' : 'warn' },
      { label: 'Critical',      value: String(totals.critical_open), tone: totals.critical_open === 0 ? 'good' : 'bad' },
      { label: 'Major',         value: String(totals.major_open), tone: totals.major_open === 0 ? 'good' : 'bad' },
      { label: 'Resolved (mo)', value: String(totalResolvedThisMonth), tone: 'good' },
    ]),

    new Paragraph({ spacing: { before: 240 }, children: [] }),

    overdue90Count > 0
      ? p(`${overdue90Count} critical or major defect${overdue90Count === 1 ? '' : 's'} across the portfolio have been open for more than 90 days. See Priority Matrix.`, { color: BAD_RED, bold: true, spaceAfter: 120 })
      : p('No critical or major defects open beyond 90 days.', { color: OK_GREEN, spaceAfter: 120 }),

    h2('Priority Matrix'),
    ...priorityMatrix(snap.openDefects),

    pageBreak(),

    h1('1. Portfolio Snapshot'),
    table([portfolioHeader, ...portfolioRows], cw),

    h1('2. Per-Property Summary'),
    ...snap.properties.flatMap((prop) => {
      const fca = fcaBy.get(prop.short_code);
      const dc  = dcBy.get(prop.short_code);
      const resolved = snap.resolvedThisMonth.find(r => r.short_code === prop.short_code)?.count ?? 0;
      return [
        h2(`${prop.name} (${prop.short_code})`),
        p(fca?.summary || '—'),
        p(`Open: ${(dc?.open || 0) + (dc?.work_ordered || 0)}  •  Resolved this month: ${resolved}  •  Critical open: ${dc?.critical_open || 0}  •  Major open: ${dc?.major_open || 0}`, { italics: true, color: COLOR_MUTED, size: 20 }),
      ];
    }),

    h1('3. Critical & Major Defects — Portfolio-wide'),
    ...openDefectsRows,

    h1('4. Compliance & PM Calendar — next 60 days'),
    ...complianceCalendarTable(snap.complianceEvents),

    h1('5. Service Contracts — Portfolio View'),
    ...((() => {
      const cw2 = [3600, 1800, 1500, 1500, CONTENT_W - 8400];
      const headerRow = new TableRow({
        tableHeader: true,
        children: [
          cell('Contract',          { bold: true, fill: SHADE_HEADER, width: cw2[0], color: BRAND_PURPLE }),
          cell('Property',          { bold: true, fill: SHADE_HEADER, width: cw2[1], color: BRAND_PURPLE }),
          cell('Frequency',         { bold: true, fill: SHADE_HEADER, width: cw2[2], color: BRAND_PURPLE }),
          cell('Fee',               { bold: true, fill: SHADE_HEADER, width: cw2[3], color: BRAND_PURPLE, align: AlignmentType.RIGHT }),
          cell('Next service',      { bold: true, fill: SHADE_HEADER, width: cw2[4], color: BRAND_PURPLE }),
        ],
      });
      const rows = snap.serviceContracts.map((sc, i) => new TableRow({
        children: [
          cell(sc.contract_name, { width: cw2[0], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
          cell(sc.short_code || '—', { width: cw2[1], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
          cell(sc.frequency || '—', { width: cw2[2], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
          cell(sc.fee_amount == null ? 'TBC' : `${sc.fee_currency} ${Number(sc.fee_amount).toFixed(2)}`, { width: cw2[3], align: AlignmentType.RIGHT, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
          cell(sc.next_service_date || 'TBC', { width: cw2[4], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        ],
      }));
      return [table([headerRow, ...rows], cw2)];
    })()),

    h1('6. Open Follow-ups & Notes'),
    bullet('Naibati AC asset detail capture — parse V3.1 Gatekeeper xlsm or schedule a re-audit visit.'),
    bullet('Korobasaga AC audit — none on file; schedule when next on site.'),
    bullet('Lease ingestion — KH lease, NH lease, NH Pacific Power lease are scanned PDFs and need OCR before metadata can be captured.'),
    bullet('Insurance ingestion — CIS Certificate of Currency available; pending an insurance_policies table.'),
    bullet('Genset load calculation at NH (and KH) before formal procurement.'),
  ];

  return new Document({
    creator: COMPANY,
    title: `KGF Portfolio FM Report — ${reportLabel}`,
    description: `KGF portfolio facility management report covering Gunu House, Korobasaga House, Naibati House.`,
    styles: baseStyles,
    numbering: numberingConfig,
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: { default: buildHeader(`KGF Portfolio — ${reportLabel}`) },
      footers: { default: buildFooter(reportLabel, reportDate) },
      children,
    }],
  });
}

// ----- entry points ---------------------------------------------------------

export type GeneratedReport = {
  filename: string;
  buffer: Buffer;
  scope: 'property' | 'portfolio';
  short_code: string;
};

export async function buildPropertyReport(
  snap: ReportSnapshot,
  shortCode: string,
  reportMonth: string,
): Promise<GeneratedReport | null> {
  const prop = snap.properties.find(p => p.short_code === shortCode);
  if (!prop) return null;
  const clientCode = prop.client_short_code;
  const doc = await propertyReport(prop, snap, reportMonth);
  const buf = await Packer.toBuffer(doc);
  return {
    filename: `${clientCode}-${shortCode}-${reportMonth}-Report.docx`,
    buffer: buf,
    scope: 'property',
    short_code: shortCode,
  };
}

export async function buildPortfolioReport(
  snap: ReportSnapshot,
  reportMonth: string,
): Promise<GeneratedReport> {
  const clientCode = snap.properties[0]?.client_short_code || 'KGF';
  const doc = await portfolioReport(snap, reportMonth);
  const buf = await Packer.toBuffer(doc);
  return {
    filename: `${clientCode}-${reportMonth}-Portfolio-Report.docx`,
    buffer: buf,
    scope: 'portfolio',
    short_code: clientCode,
  };
}

// Kept for backwards compatibility; generates the full set.
export async function buildReportsForMonth(
  snap: ReportSnapshot,
  reportMonth: string,
): Promise<GeneratedReport[]> {
  const out: GeneratedReport[] = [];
  for (const prop of snap.properties) {
    const r = await buildPropertyReport(snap, prop.short_code, reportMonth);
    if (r) out.push(r);
  }
  out.push(await buildPortfolioReport(snap, reportMonth));
  return out;
}
