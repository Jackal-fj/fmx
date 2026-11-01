// FMX Monthly FM Report Generator v2 - polished CMS Fiji branding.
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
  ServiceContractRow, AssetSummaryRow, ComplianceEvent, ResolvedDefect,
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

// Text sanitizer - strips typographic flourishes that print poorly in Word:
//   em dash (-), en dash (–), bullet (•), section mark (§), smart quotes
//   ('' "" ‟„‛), ellipsis (…), middle dot (·), tildes (~), semicolons (;),
//   non-breaking spaces, zero-width spaces. Replaces each with a plain ASCII
//   equivalent so reports look clean and parsers don't choke.
//
// Applied automatically to every string that reaches p() / cell() / TextRun.
// Hardcoded template strings pass through this too - so we only use plain
// ASCII in author-side strings and let the sanitizer catch anything else.
export function clean(input: unknown): string {
  if (input == null) return '';
  const s = String(input);
  return s
    // Dashes: all unicode dashes become plain hyphen with a surrounding space pass later.
    .replace(/[–-―−]/g, '-')          // en, em, horizontal bar, minus → hyphen
    // Quotes: curly/typographic → straight
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    // Bullet / dot characters that appear mid-text (not Word's own list bullets)
    .replace(/[•‣◦⁃]/g, '-')
    .replace(/·/g, '.')                              // middle dot
    // Section mark (§, looks like double-S) → removed; '§§ 4.2' → ' 4.2'
    .replace(/§+\s*/g, '')
    // Ellipsis character → three dots
    .replace(/…/g, '...')
    // Tilde → removed (rarely used, if ever intended as "approx" the sentence
    // usually re-reads fine without it)
    .replace(/~/g, '')
    // Semicolons → periods (sentence breaks)
    .replace(/;/g, '.')
    // Whitespace: NBSP → space, zero-width → remove, collapse runs
    .replace(/ /g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/ {2,}/g, ' ')
    // Tidy double-period artefacts from the semicolon pass
    .replace(/\.\s*\./g, '.')
    .trim();
}

function p(text: string, opts: any = {}): Paragraph {
  const { bold = false, italics = false, color = COLOR_TEXT, size = 22, spaceAfter = 80, align } = opts;
  return new Paragraph({
    alignment: align,
    spacing: { after: spaceAfter },
    children: [new TextRun({ text: clean(text), bold, italics, color, size, font: FONT })],
  });
}

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND_PURPLE, space: 8 } },
    children: [new TextRun({ text: clean(text), bold: true, size: 32, color: BRAND_PURPLE, font: FONT })],
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: clean(text), bold: true, size: 26, color: BRAND_PURPLE, font: FONT })],
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: clean(text), bold: true, size: 22, color: COLOR_MUTED, font: FONT })],
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
      children: [new TextRun({ text: clean(text), bold, color, size, font })],
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
        new TextRun({ text: '\t' + clean(title), size: 18, color: COLOR_MUTED, font: FONT }),
      ],
    })],
  });
}

function buildFooter(reportLabel: string, reportDate: string): Footer {
  return new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      children: [
        new TextRun({ text: `${clean(reportLabel)} FM Report | Issued ${clean(reportDate)} | Confidential`, size: 16, color: COLOR_MUTED, font: FONT }),
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

function bullet(rawText: string): Paragraph {
  const text = clean(rawText);
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
      children: [new TextRun({ text: clean(title), bold: true, size: 40, color: COLOR_TEXT, font: FONT })],
    }),

    // Month subtitle
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 240 },
      children: [new TextRun({ text: clean(subtitle), size: 28, color: COLOR_MUTED, font: FONT })],
    }),

    // Property label
    propLabel ? new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: [new TextRun({ text: clean(propLabel), italics: true, size: 22, color: COLOR_MUTED, font: FONT })],
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
      children: [new TextRun({ text: `Issued ${clean(reportDate)}`, italics: true, size: 18, color: COLOR_MUTED, font: FONT })],
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
          children: [new TextRun({ text: clean(it.label).toUpperCase(), size: 16, color: COLOR_MUTED, font: FONT, characterSpacing: 30 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: clean(it.value), bold: true, size: 40, color: toneColor(it.tone), font: FONT })],
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
    // Detect image type from URL extension so docx's discriminated union is
    // satisfied. Default to JPEG since Quick Add compresses everything to JPG.
    const ext = (url.split('.').pop() || 'jpg').toLowerCase();
    const type = ext === 'png' ? 'png'
               : ext === 'gif' ? 'gif'
               : ext === 'bmp' ? 'bmp'
               : 'jpg';
    const imageOptions: any = {
      data: buf,
      transformation: { width: 180, height: 135 },
      type,
    };
    return new Paragraph({
      children: [new ImageRun(imageOptions)],
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
      cell(score == null ? '-' : score.toFixed(2),     { width: cw[2], align: AlignmentType.CENTER, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell('',                                          { width: cw[3], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
    ],
  }));
  const overallRow = new TableRow({
    children: [
      cell('OVERALL',                                                       { bold: true, width: cw[0], fill: SHADE_HEADER, color: BRAND_PURPLE }),
      cell((fca.overall_rating || '').toUpperCase(),                        { bold: true, width: cw[1], align: AlignmentType.CENTER, color: ratingColor(fca.overall_rating), fill: SHADE_HEADER }),
      cell(fca.numeric_score == null ? '-' : Number(fca.numeric_score).toFixed(2), { bold: true, width: cw[2], align: AlignmentType.CENTER, fill: SHADE_HEADER }),
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
      cell('-', { width: cw[1], align: AlignmentType.CENTER }),
      cell('-', { width: cw[2], align: AlignmentType.CENTER }),
      cell('-', { width: cw[3], align: AlignmentType.CENTER }),
      cell('-', { width: cw[4], align: AlignmentType.CENTER }),
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
    const ageDisplay = d.days_open == null ? '-' : `${d.days_open}d`;
    const ageColor = (d.days_open ?? 0) > 90 ? BAD_RED
                   : (d.days_open ?? 0) > 30 ? WARN_AMBER
                   : COLOR_TEXT;
    const photoCell = photoParaByRef.has(d.defect_number)
      ? cell('', { width: cw[5], fill: i % 2 ? SHADE_ROW_ALT : undefined, children: [photoParaByRef.get(d.defect_number)!] })
      : cell(d.photo_urls.length > 0 ? `${d.photo_urls.length} on file` : '-',
          { width: cw[5], size: 16, align: AlignmentType.CENTER, color: COLOR_MUTED, fill: i % 2 ? SHADE_ROW_ALT : undefined });

    return new TableRow({
      children: [
        cell(d.defect_number, { width: cw[0], size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell((d.severity || '').toUpperCase(), { width: cw[1], align: AlignmentType.CENTER, color: severityColor(d.severity), bold: true, size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(ageDisplay, { width: cw[2], align: AlignmentType.CENTER, color: ageColor, bold: (d.days_open ?? 0) > 30, size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(d.space || '-', { width: cw[3], size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
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
        new TextRun({ text: `${clean(d.severity || '').toUpperCase()}   `, bold: true, color: severityColor(d.severity), size: 20, font: FONT }),
        new TextRun({ text: `${clean(d.defect_number)}   `, size: 20, color: COLOR_MUTED, font: FONT }),
        new TextRun({ text: `${clean(d.space)} - ${clean(d.title)}   `, size: 22, font: FONT, color: COLOR_TEXT }),
        new TextRun({ text: age ? `(${clean(age)})` : '', italics: true, size: 20, color: (d.days_open ?? 0) > 90 ? BAD_RED : COLOR_MUTED, font: FONT }),
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
      cell(sc.frequency || '-', { width: cw[1], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(sc.fee_amount == null ? 'TBC' : `${sc.fee_currency} ${Number(sc.fee_amount).toFixed(2)}`, { width: cw[2], align: AlignmentType.RIGHT, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(sc.next_service_date || 'TBC', { width: cw[3], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(sc.provider_name || '-', { width: cw[4], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
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

// ---------------------------------------------------------------------------
// Minimalist monthly property report.
// Five sections. No in-document photo embedding. Each open item has a tappable
// FMX URL for photos + full history. The whole document is driven by data that
// reflects the state AT month-end (not generation time).
// ---------------------------------------------------------------------------
async function propertyReport(prop: Property, snap: ReportSnapshot, reportMonth: string): Promise<Document> {
  const reportLabel = monthLabel(reportMonth);
  const asOf = snap.asOfDate;                         // 'YYYY-MM-DD' at month-end
  const fca = snap.fcas.find(f => f.short_code === prop.short_code);
  const dc  = snap.defectCounts.find(d => d.short_code === prop.short_code);
  const resolved = snap.resolvedThisMonth.find(r => r.short_code === prop.short_code)?.count ?? 0;
  const added    = snap.newThisMonth.find(r => r.short_code === prop.short_code)?.count ?? 0;
  const propOpenDefects = snap.openDefects
    .filter(d => d.short_code === prop.short_code)
    .sort(sortByPriority);

  const totalOpen = dc?.open || 0;
  const criticalCount = dc?.critical_open || 0;
  const majorCount = dc?.major_open || 0;
  const netChange = added - resolved;
  const netLabel = netChange > 0 ? `+${netChange}` : String(netChange);

  const propLabel = `${prop.name} (${prop.short_code}) | ${prop.tenant_name || '-'}`;

  const children: any[] = [
    ...coverPage({
      title: `${prop.name} - FM Report`,
      subtitle: reportLabel,
      propLabel,
      reportDate: asOf,
    }),

    // 1. SNAPSHOT ------------------------------------------------------------
    h1('Snapshot'),
    p(`State as at ${asOf}.`, { italics: true, color: COLOR_MUTED, size: 18, spaceAfter: 160 }),
    kpiBanner([
      { label: 'Open at month-end', value: String(totalOpen), tone: totalOpen === 0 ? 'good' : totalOpen > 20 ? 'bad' : 'warn' },
      { label: 'Critical',          value: String(criticalCount), tone: criticalCount === 0 ? 'good' : 'bad' },
      { label: 'Major',             value: String(majorCount),    tone: majorCount === 0 ? 'good' : 'warn' },
      { label: 'New this month',    value: String(added),   tone: 'neutral' },
      { label: 'Resolved this month', value: String(resolved), tone: 'good' },
    ]),
    new Paragraph({ spacing: { before: 240 }, children: [] }),
    p(`Net change this month: ${netLabel} ${netChange === 0 ? '(unchanged)' : netChange < 0 ? '(backlog shrinking)' : '(backlog growing)'}`,
      { italics: true, color: netChange > 0 ? WARN_AMBER : netChange < 0 ? OK_GREEN : COLOR_MUTED }),
    ...(fca ? [p(`FCA rating ${(fca.overall_rating || '').toUpperCase()}${fca.numeric_score != null ? ` (${Number(fca.numeric_score).toFixed(2)})` : ''} as at ${fca.assessed_at}.`, { italics: true, color: COLOR_MUTED, size: 18, spaceAfter: 120 })] : []),

    // 2. PRIORITY ------------------------------------------------------------
    h1('Priority'),
    ...priorityList(propOpenDefects, 5),

    // 3. COMPLETED THIS MONTH ------------------------------------------------
    h1('Completed this month'),
    ...completedThisMonthTable(
      snap.resolvedDefects.filter(d => d.short_code === prop.short_code),
      reportLabel,
    ),

    // 4. OPEN ITEMS REGISTER -------------------------------------------------
    h1('Open items'),
    p(`${propOpenDefects.length} item${propOpenDefects.length === 1 ? '' : 's'} open as at ${asOf}. Tap a reference to view the full record and photos in FMX.`, { italics: true, color: COLOR_MUTED, size: 18, spaceAfter: 120 }),
    ...minimalOpenItemsTable(propOpenDefects),

    // 5. COMPLIANCE ----------------------------------------------------------
    h1('Compliance - next 60 days'),
    p(`Items due between ${asOf} and ${plusDays(asOf, 60)}.`, { italics: true, color: COLOR_MUTED, size: 18, spaceAfter: 120 }),
    ...minimalComplianceTable(snap.complianceEvents.filter(e => !e.short_code || e.short_code === prop.short_code), asOf),
  ];

  return new Document({
    creator: COMPANY,
    title: `${prop.name} ${reportLabel} FM Report`,
    description: `Monthly facility management report - ${prop.name} (${prop.short_code})`,
    styles: baseStyles,
    numbering: numberingConfig,
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: { default: buildHeader(`${prop.name} (${prop.short_code}) - ${reportLabel}`) },
      footers: { default: buildFooter(reportLabel, asOf) },
      children,
    }],
  });
}

// ---------------------------------------------------------------------------
// Helper functions for the minimal report format.
// ---------------------------------------------------------------------------

// Severity priority order (critical first) + oldest-open as tie-break.
const SEVERITY_ORDER: Record<string, number> = { critical: 0, major: 1, moderate: 2, minor: 3 };
function sortByPriority(a: OpenDefect, b: OpenDefect): number {
  const sa = SEVERITY_ORDER[a.severity] ?? 9;
  const sb = SEVERITY_ORDER[b.severity] ?? 9;
  if (sa !== sb) return sa - sb;
  return (b.days_open ?? 0) - (a.days_open ?? 0);
}

function plusDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Short priority list — top N oldest critical/major open items as single-line
// bullets. If there are fewer than N critical/major, pads with moderates.
function priorityList(items: OpenDefect[], n: number): Paragraph[] {
  const priorityItems = items.filter(d => d.severity === 'critical' || d.severity === 'major').slice(0, n);
  if (priorityItems.length === 0) {
    return [p('No critical or major items open. Nothing urgent.', { color: OK_GREEN, italics: true })];
  }
  return priorityItems.map(d => bullet(
    `${d.severity.toUpperCase()} - ${d.defect_number} - ${d.space} - ${d.title} (${d.days_open ?? '?'}d open)`
  ));
}

// Minimal open items table — ref, severity, title, space, days open. No
// photos embedded, no description. Vendor + Carl look up full detail in FMX
// via the printed URL in the header or by typing the ref.
function minimalOpenItemsTable(items: OpenDefect[]): (Paragraph | Table)[] {
  if (items.length === 0) {
    return [p('No open items at month-end.', { color: OK_GREEN, italics: true })];
  }
  const cw = [1800, 1400, CONTENT_W - 6800, 2800, 800];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Ref',       { bold: true, fill: SHADE_HEADER, width: cw[0], color: BRAND_PURPLE }),
      cell('Severity',  { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Issue',     { bold: true, fill: SHADE_HEADER, width: cw[2], color: BRAND_PURPLE }),
      cell('Location',  { bold: true, fill: SHADE_HEADER, width: cw[3], color: BRAND_PURPLE }),
      cell('Age',       { bold: true, fill: SHADE_HEADER, width: cw[4], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
    ],
  });
  const rows = items.map((d, i) => {
    const fill = i % 2 ? SHADE_ROW_ALT : undefined;
    const ageColor = (d.days_open ?? 0) > 90 ? BAD_RED : (d.days_open ?? 0) > 30 ? WARN_AMBER : COLOR_MUTED;
    return new TableRow({
      children: [
        cell(d.defect_number, { width: cw[0], size: 18, fill }),
        cell(d.severity.toUpperCase(), { width: cw[1], align: AlignmentType.CENTER, color: severityColor(d.severity), bold: true, size: 18, fill }),
        cell(d.title, { width: cw[2], size: 18, fill }),
        cell(d.space, { width: cw[3], size: 18, fill }),
        cell(d.days_open == null ? '-' : `${d.days_open}d`, { width: cw[4], align: AlignmentType.CENTER, color: ageColor, bold: (d.days_open ?? 0) > 30, size: 18, fill }),
      ],
    });
  });
  return [table([header, ...rows], cw)];
}

// Completed-this-month table — ref / severity / issue / location / resolved date / notes.
// Includes a property column when includeProperty=true (portfolio reports only).
function completedThisMonthTable(
  items: ResolvedDefect[],
  reportLabel: string,
  opts: { includeProperty?: boolean } = {},
): (Paragraph | Table)[] {
  if (items.length === 0) {
    return [p(`Nothing resolved in ${reportLabel}.`, { italics: true, color: COLOR_MUTED })];
  }
  const summary = p(
    `${items.length} item${items.length === 1 ? '' : 's'} resolved during ${reportLabel}, most recent first.`,
    { italics: true, color: COLOR_MUTED, size: 18, spaceAfter: 120 },
  );
  const prop = opts.includeProperty;
  const cw = prop
    ? [1600, 900, 1200, CONTENT_W - 8900, 2200, 3000]        // Ref | Prop | Sev | Issue | Resolved | Notes
    : [1800, 1300, CONTENT_W - 8300, 2400, 2800];            // Ref | Sev | Issue | Resolved | Notes
  const headerCells = prop ? [
    cell('Ref',       { bold: true, fill: SHADE_HEADER, width: cw[0], color: BRAND_PURPLE }),
    cell('Prop',      { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
    cell('Severity',  { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
    cell('Issue',     { bold: true, fill: SHADE_HEADER, width: cw[3], color: BRAND_PURPLE }),
    cell('Resolved',  { bold: true, fill: SHADE_HEADER, width: cw[4], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
    cell('Notes',     { bold: true, fill: SHADE_HEADER, width: cw[5], color: BRAND_PURPLE }),
  ] : [
    cell('Ref',       { bold: true, fill: SHADE_HEADER, width: cw[0], color: BRAND_PURPLE }),
    cell('Severity',  { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
    cell('Issue',     { bold: true, fill: SHADE_HEADER, width: cw[2], color: BRAND_PURPLE }),
    cell('Resolved',  { bold: true, fill: SHADE_HEADER, width: cw[3], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
    cell('Notes',     { bold: true, fill: SHADE_HEADER, width: cw[4], color: BRAND_PURPLE }),
  ];
  const header = new TableRow({ tableHeader: true, children: headerCells });
  const rows = items.map((d, i) => {
    const fill = i % 2 ? SHADE_ROW_ALT : undefined;
    const notes = (d.resolution_notes || '-').slice(0, 160);
    const rowCells = prop ? [
      cell(d.defect_number, { width: cw[0], size: 18, fill }),
      cell(d.short_code, { width: cw[1], align: AlignmentType.CENTER, size: 18, fill }),
      cell(d.severity.toUpperCase(), { width: cw[2], align: AlignmentType.CENTER, color: severityColor(d.severity), bold: true, size: 18, fill }),
      cell(d.title, { width: cw[3], size: 18, fill }),
      cell(d.resolved_at, { width: cw[4], align: AlignmentType.CENTER, size: 18, color: OK_GREEN, fill }),
      cell(notes, { width: cw[5], size: 16, fill }),
    ] : [
      cell(d.defect_number, { width: cw[0], size: 18, fill }),
      cell(d.severity.toUpperCase(), { width: cw[1], align: AlignmentType.CENTER, color: severityColor(d.severity), bold: true, size: 18, fill }),
      cell(d.title, { width: cw[2], size: 18, fill }),
      cell(d.resolved_at, { width: cw[3], align: AlignmentType.CENTER, size: 18, color: OK_GREEN, fill }),
      cell(notes, { width: cw[4], size: 16, fill }),
    ];
    return new TableRow({ children: rowCells });
  });
  return [summary, table([header, ...rows], cw)];
}

// Minimal compliance table — label, detail, due date, days-until as-at month-end.
function minimalComplianceTable(events: ComplianceEvent[], asOf: string): (Paragraph | Table)[] {
  if (events.length === 0) {
    return [p('Nothing scheduled in the next 60 days.', { italics: true, color: COLOR_MUTED })];
  }
  const cw = [3200, CONTENT_W - 7000, 2400, 1400];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Item',      { bold: true, fill: SHADE_HEADER, width: cw[0], color: BRAND_PURPLE }),
      cell('Detail',    { bold: true, fill: SHADE_HEADER, width: cw[1], color: BRAND_PURPLE }),
      cell('Due date',  { bold: true, fill: SHADE_HEADER, width: cw[2], color: BRAND_PURPLE, align: AlignmentType.CENTER }),
      cell('Days out',  { bold: true, fill: SHADE_HEADER, width: cw[3], color: BRAND_PURPLE, align: AlignmentType.CENTER }),
    ],
  });
  const rows = events.map((e, i) => new TableRow({
    children: [
      cell(e.label,    { width: cw[0], size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(e.detail,   { width: cw[1], size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(e.due_date, { width: cw[2], size: 18, align: AlignmentType.CENTER, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(`${e.days_until}d`, { width: cw[3], size: 18, align: AlignmentType.CENTER, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
    ],
  }));
  return [table([header, ...rows], cw)];
}

function propertyNotes(shortCode: string): Paragraph[] {
  if (shortCode === 'GH') {
    return [
      bullet('Fire alarm panel inactive - IFS site visit before next monthly test would close that risk.'),
      bullet('Tenant-installed backup generator continues under CARPTRAC PM. Verify whether KGF inherits PM cost on tenancy expiry.'),
      bullet('AC register: 32 units, 8 flagged Poor and 1 (2F1) flagged for immediate replacement.'),
      bullet('Driveway pavement / WAF service compromise: notify FRA and WAF for external infrastructure remediation.'),
    ];
  }
  if (shortCode === 'KH') {
    return [
      bullet('Fire protection rated POOR - fire alarm panel inactive, no extinguishers visible. Fire reactivation is the highest priority.'),
      bullet('Plumbing: 26 items remediated (Feb 2026). 5 outstanding non-critical items remain - non-return valves on water tank flagged as major.'),
      bullet('Storage and clutter onsite is a critical OHS concern; tenant should be advised to seek alternative storage solutions.'),
      bullet('AC audit not yet captured for this property - schedule when next on site.'),
    ];
  }
  if (shortCode === 'NH') {
    return [
      bullet('CRITICAL: L2 server room GPOs likely overloaded - fire and operational continuity risk. Should be top of next dispatch list.'),
      bullet('Conveyance Poor (1) - elevator shaft and well requires follow-up inspection by qualified inspector.'),
      bullet('Backup generator and water supply have NOT been completed despite tenancy agreement - formal letter to tenant recommended.'),
      bullet('44 open electrical items (1 critical, 9 major, 5 moderate, 29 minor). Bulk troffer-tube and GPO checks can be batched into one electrical campaign.'),
      bullet('AC register: 22 placeholder records - fill make/model/serial from V3.1 Gatekeeper xlsm or via scheduled re-audit.'),
    ];
  }
  return [muted('-')];
}

// ----- portfolio report -----------------------------------------------------

// ---------------------------------------------------------------------------
// Minimalist monthly portfolio report. Same five-section pattern as the
// per-property report, aggregated across all client properties.
// ---------------------------------------------------------------------------
async function portfolioReport(snap: ReportSnapshot, reportMonth: string): Promise<Document> {
  const reportLabel = monthLabel(reportMonth);
  const asOf = snap.asOfDate;
  const client = snap.properties[0]?.client_name || 'Portfolio';
  const clientCode = snap.properties[0]?.client_short_code || 'KGF';

  const totals = snap.defectCounts.reduce((a, d) => ({
    open: a.open + d.open,
    critical: a.critical + d.critical_open,
    major: a.major + d.major_open,
  }), { open: 0, critical: 0, major: 0 });

  const totalResolvedThisMonth = snap.resolvedThisMonth.reduce((a, r) => a + r.count, 0);
  const totalNewThisMonth = snap.newThisMonth.reduce((a, r) => a + r.count, 0);
  const netChange = totalNewThisMonth - totalResolvedThisMonth;
  const netLabel = netChange > 0 ? `+${netChange}` : String(netChange);

  const priorityItems = snap.openDefects.slice().sort(sortByPriority);

  const children: any[] = [
    ...coverPage({
      title: `${client} Portfolio - FM Report`,
      subtitle: reportLabel,
      propLabel: `${snap.properties.length} propert${snap.properties.length === 1 ? 'y' : 'ies'}`,
      reportDate: asOf,
    }),

    // 1. SNAPSHOT ------------------------------------------------------------
    h1('Snapshot'),
    p(`State as at ${asOf}.`, { italics: true, color: COLOR_MUTED, size: 18, spaceAfter: 160 }),
    kpiBanner([
      { label: 'Open at month-end',   value: String(totals.open), tone: totals.open === 0 ? 'good' : 'warn' },
      { label: 'Critical',            value: String(totals.critical), tone: totals.critical === 0 ? 'good' : 'bad' },
      { label: 'Major',               value: String(totals.major),    tone: totals.major === 0 ? 'good' : 'warn' },
      { label: 'New this month',      value: String(totalNewThisMonth), tone: 'neutral' },
      { label: 'Resolved this month', value: String(totalResolvedThisMonth), tone: 'good' },
    ]),
    new Paragraph({ spacing: { before: 240 }, children: [] }),
    p(`Net change this month: ${netLabel} ${netChange === 0 ? '(unchanged)' : netChange < 0 ? '(backlog shrinking)' : '(backlog growing)'}`,
      { italics: true, color: netChange > 0 ? WARN_AMBER : netChange < 0 ? OK_GREEN : COLOR_MUTED, spaceAfter: 160 }),

    // Per-property one-liner summary
    ...perPropertySummary(snap),

    // 2. PRIORITY ------------------------------------------------------------
    h1('Priority'),
    ...priorityList(priorityItems, 8),

    // 3. COMPLETED THIS MONTH ------------------------------------------------
    h1('Completed this month - portfolio'),
    ...completedThisMonthTable(snap.resolvedDefects, reportLabel, { includeProperty: true }),

    // 4. OPEN ITEMS REGISTER -------------------------------------------------
    h1('Open items - portfolio'),
    p(`${priorityItems.length} item${priorityItems.length === 1 ? '' : 's'} open as at ${asOf}, ordered by severity then age.`, { italics: true, color: COLOR_MUTED, size: 18, spaceAfter: 120 }),
    ...minimalPortfolioItemsTable(priorityItems),

    // 5. COMPLIANCE ----------------------------------------------------------
    h1('Compliance - next 60 days'),
    p(`Items due between ${asOf} and ${plusDays(asOf, 60)}.`, { italics: true, color: COLOR_MUTED, size: 18, spaceAfter: 120 }),
    ...minimalComplianceTable(snap.complianceEvents, asOf),
  ];

  return new Document({
    creator: COMPANY,
    title: `${client} Portfolio FM Report - ${reportLabel}`,
    description: `Monthly facility management report - ${client} portfolio.`,
    styles: baseStyles,
    numbering: numberingConfig,
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: { default: buildHeader(`${clientCode} Portfolio - ${reportLabel}`) },
      footers: { default: buildFooter(reportLabel, asOf) },
      children,
    }],
  });
}

// Compact per-property one-liner: shows up right under the KPI banner so the
// landlord can see each building's state at a glance without a full table.
function perPropertySummary(snap: ReportSnapshot): Paragraph[] {
  if (snap.properties.length <= 1) return [];
  const dcBy = new Map(snap.defectCounts.map(d => [d.short_code, d]));
  const resBy = new Map(snap.resolvedThisMonth.map(r => [r.short_code, r.count]));
  const newBy = new Map(snap.newThisMonth.map(n => [n.short_code, n.count]));
  const out: Paragraph[] = [h3('Per-property')];
  for (const prop of snap.properties) {
    const dc = dcBy.get(prop.short_code);
    const resolved = resBy.get(prop.short_code) ?? 0;
    const added = newBy.get(prop.short_code) ?? 0;
    const open = dc?.open || 0;
    const crit = dc?.critical_open || 0;
    out.push(bullet(
      `${prop.name} (${prop.short_code}) - open ${open}${crit > 0 ? ` (${crit} critical)` : ''}, +${added} new, -${resolved} resolved`
    ));
  }
  return out;
}

// Portfolio open items table — adds property column vs the per-property version.
function minimalPortfolioItemsTable(items: OpenDefect[]): (Paragraph | Table)[] {
  if (items.length === 0) {
    return [p('No open items portfolio-wide at month-end.', { color: OK_GREEN, italics: true })];
  }
  const cw = [1600, 900, 1300, CONTENT_W - 7400, 2800, 800];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Ref',       { bold: true, fill: SHADE_HEADER, width: cw[0], color: BRAND_PURPLE }),
      cell('Prop',      { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Severity',  { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
      cell('Issue',     { bold: true, fill: SHADE_HEADER, width: cw[3], color: BRAND_PURPLE }),
      cell('Location',  { bold: true, fill: SHADE_HEADER, width: cw[4], color: BRAND_PURPLE }),
      cell('Age',       { bold: true, fill: SHADE_HEADER, width: cw[5], align: AlignmentType.CENTER, color: BRAND_PURPLE }),
    ],
  });
  const rows = items.map((d, i) => {
    const fill = i % 2 ? SHADE_ROW_ALT : undefined;
    const ageColor = (d.days_open ?? 0) > 90 ? BAD_RED : (d.days_open ?? 0) > 30 ? WARN_AMBER : COLOR_MUTED;
    return new TableRow({
      children: [
        cell(d.defect_number, { width: cw[0], size: 18, fill }),
        cell(d.short_code, { width: cw[1], align: AlignmentType.CENTER, size: 18, fill }),
        cell(d.severity.toUpperCase(), { width: cw[2], align: AlignmentType.CENTER, color: severityColor(d.severity), bold: true, size: 18, fill }),
        cell(d.title, { width: cw[3], size: 18, fill }),
        cell(d.space, { width: cw[4], size: 18, fill }),
        cell(d.days_open == null ? '-' : `${d.days_open}d`, { width: cw[5], align: AlignmentType.CENTER, color: ageColor, bold: (d.days_open ?? 0) > 30, size: 18, fill }),
      ],
    });
  });
  return [table([header, ...rows], cw)];
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
