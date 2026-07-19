// FMX Monthly FM Report Generator (in-app port).
// Ported from fmx-monthly-report/src/generate.js. Takes an in-memory data
// snapshot and returns array of { filename, buffer } for upload to storage.
//
// Original CLI used execSync to strip an unreferenced fontTable.xml. That step
// is skipped here — Word/LibreOffice open the docs fine as-is, and Vercel
// serverless can't spawn zip.

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  TabStopType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak,
} from 'docx';

import type {
  ReportSnapshot, Property, Fca, DefectCount, OpenDefect, ServiceContractRow, AssetSummaryRow,
} from './data';

const COMPANY = 'Commercial Management Solutions Pte Limited';
const COMPANY_SHORT = 'CMS Fiji';

// ----- styles ---------------------------------------------------------------

const FONT = 'Arial';
const COLOR_PRIMARY = '1F4E79';
const COLOR_MUTED   = '595959';
const COLOR_BORDER  = 'CCCCCC';
const SHADE_HEADER  = 'D5E8F0';
const SHADE_ROW_ALT = 'F2F2F2';

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
  const { bold = false, italics = false, color, size = 22, spaceAfter = 80 } = opts;
  return new Paragraph({
    spacing: { after: spaceAfter },
    children: [new TextRun({ text, bold, italics, color, size, font: FONT })],
  });
}

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: COLOR_PRIMARY, font: FONT })],
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: COLOR_PRIMARY, font: FONT })],
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
    bold = false, color, fill, width, align = AlignmentType.LEFT,
    size = 20, font = FONT,
  } = opts;
  return new TableCell({
    borders: cellBorders,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: fill ? { fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
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
    case 'good':       return '2E7D32';
    case 'adequate':   return '0D47A1';
    case 'marginal':   return 'E65100';
    case 'poor':
    case 'failed':     return 'B71C1C';
    default:           return COLOR_MUTED;
  }
}

function severityColor(s: string | null | undefined): string {
  switch ((s || '').toLowerCase()) {
    case 'critical': return 'B71C1C';
    case 'major':    return 'C62828';
    case 'moderate': return 'E65100';
    case 'minor':    return '6A6A6A';
    default:         return COLOR_MUTED;
  }
}

// ----- page furniture -------------------------------------------------------

function buildHeader(title: string): Header {
  return new Header({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      children: [
        new TextRun({ text: title, bold: true, size: 18, color: COLOR_PRIMARY, font: FONT }),
        new TextRun({ text: '\t' + COMPANY_SHORT, size: 18, color: COLOR_MUTED, font: FONT }),
      ],
    })],
  });
}

function buildFooter(reportLabel: string, reportDate: string): Footer {
  return new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      children: [
        new TextRun({ text: `${reportLabel} FM Report  •  Issued ${reportDate}`, size: 16, color: COLOR_MUTED, font: FONT }),
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
      run: { size: 32, bold: true, font: FONT, color: COLOR_PRIMARY },
      paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 26, bold: true, font: FONT, color: COLOR_PRIMARY },
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
    children: [new TextRun({ text, size: 22, font: FONT })],
  });
}

// ----- section builders -----------------------------------------------------

function coverPage({ title, subtitle, propLabel, reportDate }: {
  title: string; subtitle: string; propLabel?: string; reportDate: string;
}): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 240 },
      children: [new TextRun({ text: 'Kinetic Growth Fund', bold: true, size: 44, color: COLOR_PRIMARY, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: [new TextRun({ text: title, bold: true, size: 36, color: '000000', font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 360 },
      children: [new TextRun({ text: subtitle, size: 26, color: COLOR_MUTED, font: FONT })],
    }),
    propLabel ? new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: [new TextRun({ text: propLabel, size: 22, color: COLOR_MUTED, font: FONT })],
    }) : new Paragraph({ children: [] }),
    new Paragraph({ spacing: { before: 1600 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 80 },
      children: [new TextRun({ text: 'Prepared by', size: 18, color: COLOR_MUTED, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 40 },
      children: [new TextRun({ text: COMPANY, bold: true, size: 22, color: COLOR_PRIMARY, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 240 },
      children: [new TextRun({ text: `Issued ${reportDate}`, size: 18, color: COLOR_MUTED, font: FONT })],
    }),
    pageBreak(),
  ];
}

function fcaTable(fca: Fca | undefined): (Paragraph | Table)[] {
  if (!fca) return [muted('No condition assessment on record.')];
  const cw = [3120, 1500, 1200, CONTENT_W - 3120 - 1500 - 1200];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Component',   { bold: true, fill: SHADE_HEADER, width: cw[0] }),
      cell('Rating',      { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER }),
      cell('Score',       { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.CENTER }),
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
      cell('OVERALL',                                                       { bold: true, width: cw[0], fill: SHADE_HEADER }),
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
      cell('Status',     { bold: true, fill: SHADE_HEADER, width: cw[0] }),
      cell('Critical',   { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER }),
      cell('Major',      { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.CENTER }),
      cell('Moderate',   { bold: true, fill: SHADE_HEADER, width: cw[3], align: AlignmentType.CENTER }),
      cell('Minor',      { bold: true, fill: SHADE_HEADER, width: cw[4], align: AlignmentType.CENTER }),
      cell('Total',      { bold: true, fill: SHADE_HEADER, width: cw[5], align: AlignmentType.CENTER }),
    ],
  });
  const openRow = new TableRow({
    children: [
      cell('Open',                  { width: cw[0], bold: true }),
      cell(c.critical_open,         { width: cw[1], align: AlignmentType.CENTER, color: c.critical_open ? severityColor('critical') : COLOR_MUTED, bold: !!c.critical_open }),
      cell(c.major_open,            { width: cw[2], align: AlignmentType.CENTER, color: c.major_open ? severityColor('major') : COLOR_MUTED, bold: !!c.major_open }),
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
      cell(c.resolved, { width: cw[5], align: AlignmentType.CENTER, color: '2E7D32', bold: true }),
    ],
  });
  return [table([header, openRow, resolvedRow], cw)];
}

function openDefectsTable(list: OpenDefect[]): (Paragraph | Table)[] {
  if (list.length === 0) return [muted('No open defects.')];
  const cw = [1400, 1100, 1500, CONTENT_W - 4000];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Ref',       { bold: true, fill: SHADE_HEADER, width: cw[0] }),
      cell('Severity',  { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER }),
      cell('Location',  { bold: true, fill: SHADE_HEADER, width: cw[2] }),
      cell('Defect',    { bold: true, fill: SHADE_HEADER, width: cw[3] }),
    ],
  });
  const rows = list.map((d, i) => new TableRow({
    children: [
      cell(d.defect_number, { width: cw[0], size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell((d.severity || '').toUpperCase(), { width: cw[1], align: AlignmentType.CENTER, color: severityColor(d.severity), bold: true, size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(d.space || '—', { width: cw[2], size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(`${d.title}\n${d.description || ''}`.trim(), { width: cw[3], size: 18, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
    ],
  }));
  return [table([header, ...rows], cw)];
}

function serviceContractsTable(list: ServiceContractRow[]): (Paragraph | Table)[] {
  if (list.length === 0) return [muted('No active service contracts on record.')];
  const cw = [3600, 1800, 1500, 1500, CONTENT_W - 8400];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Contract',          { bold: true, fill: SHADE_HEADER, width: cw[0] }),
      cell('Frequency',         { bold: true, fill: SHADE_HEADER, width: cw[1] }),
      cell('Fee',               { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.RIGHT }),
      cell('Next Service',      { bold: true, fill: SHADE_HEADER, width: cw[3] }),
      cell('Provider',          { bold: true, fill: SHADE_HEADER, width: cw[4] }),
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
      cell('Asset class',  { bold: true, fill: SHADE_HEADER, width: cw[0] }),
      cell('Count',        { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER }),
      cell('Good',         { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.CENTER }),
      cell('Poor',         { bold: true, fill: SHADE_HEADER, width: cw[3], align: AlignmentType.CENTER }),
      cell('Failed',       { bold: true, fill: SHADE_HEADER, width: cw[4], align: AlignmentType.CENTER }),
    ],
  });
  const rows = list.map((a, i) => new TableRow({
    children: [
      cell(a.asset_type, { width: cw[0], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(a.count, { width: cw[1], align: AlignmentType.CENTER, bold: true, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(a.good, { width: cw[2], align: AlignmentType.CENTER, color: '2E7D32', fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(a.poor, { width: cw[3], align: AlignmentType.CENTER, color: a.poor ? severityColor('moderate') : COLOR_MUTED, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      cell(a.failed, { width: cw[4], align: AlignmentType.CENTER, color: a.failed ? severityColor('critical') : COLOR_MUTED, bold: !!a.failed, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
    ],
  }));
  return [table([header, ...rows], cw)];
}

// ----- per-property report --------------------------------------------------

function propertyReport(prop: Property, snap: ReportSnapshot, reportMonth: string): Document {
  const reportLabel = monthLabel(reportMonth);
  const reportDate = new Date().toISOString().slice(0, 10);
  const fca = snap.fcas.find(f => f.short_code === prop.short_code);
  const dc  = snap.defectCounts.find(d => d.short_code === prop.short_code);
  const propLabel = `${prop.name} (${prop.short_code})  •  ${prop.tenant_name || '—'}`;

  const children: any[] = [
    ...coverPage({
      title: `${prop.name} — FM Report`,
      subtitle: reportLabel,
      propLabel,
      reportDate,
    }),

    h1('1. Property Snapshot'),
    table([
      new TableRow({ children: [
        cell('Property', { bold: true, fill: SHADE_HEADER, width: 2800 }),
        cell(`${prop.name} (${prop.short_code})`, { width: CONTENT_W - 2800 }),
      ]}),
      new TableRow({ children: [
        cell('Address', { bold: true, fill: SHADE_HEADER, width: 2800 }),
        cell(prop.address || '—', { width: CONTENT_W - 2800 }),
      ]}),
      new TableRow({ children: [
        cell('Facility type', { bold: true, fill: SHADE_HEADER, width: 2800 }),
        cell(`${prop.facility_type || '—'}${prop.storeys ? ` • ${prop.storeys} storeys` : ''}`, { width: CONTENT_W - 2800 }),
      ]}),
      new TableRow({ children: [
        cell('Tenant', { bold: true, fill: SHADE_HEADER, width: 2800 }),
        cell(`${prop.tenant_name || '—'}${prop.tenant_short_code ? ` (${prop.tenant_short_code})` : ''}`, { width: CONTENT_W - 2800 }),
      ]}),
      new TableRow({ children: [
        cell('Last FCA', { bold: true, fill: SHADE_HEADER, width: 2800 }),
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
    h3('Open defects'),
    ...openDefectsTable(snap.openDefects.filter(d => d.short_code === prop.short_code)),

    h1('4. Asset Register'),
    ...assetSummaryTable(snap.assetSummary.filter(a => a.short_code === prop.short_code)),

    h1('5. Service Contracts'),
    ...serviceContractsTable(snap.serviceContracts.filter(sc => sc.short_code === prop.short_code)),

    h1('6. Notes & Recommendations'),
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
      headers: { default: buildHeader(`${prop.name} (${prop.short_code})`) },
      footers: { default: buildFooter(reportLabel, reportDate) },
      children,
    }],
  });
}

// Per-property editorial notes. These are static — refresh them from a
// PropertyNotes table when we have one, or leave as living recommendations.
function propertyNotes(shortCode: string): Paragraph[] {
  if (shortCode === 'GH') {
    return [
      bullet('Fire alarm panel inactive — IFS site visit before May monthly test would close that risk.'),
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

function portfolioReport(snap: ReportSnapshot, reportMonth: string): Document {
  const reportLabel = monthLabel(reportMonth);
  const reportDate = new Date().toISOString().slice(0, 10);

  const totals = snap.defectCounts.reduce((a, d) => ({
    open: a.open + d.open,
    resolved: a.resolved + d.resolved,
    critical_open: a.critical_open + d.critical_open,
    major_open: a.major_open + d.major_open,
  }), { open: 0, resolved: 0, critical_open: 0, major_open: 0 });

  const portfolioFcaAvg = (() => {
    const scored = snap.fcas.filter(f => f.numeric_score != null);
    if (scored.length === 0) return null;
    return scored.reduce((a, f) => a + Number(f.numeric_score), 0) / scored.length;
  })();

  const fcaBy = new Map(snap.fcas.map(f => [f.short_code, f]));
  const dcBy = new Map(snap.defectCounts.map(d => [d.short_code, d]));

  const cw = [2400, 1600, 1500, 1500, CONTENT_W - 7000];
  const portfolioHeader = new TableRow({
    tableHeader: true,
    children: [
      cell('Property',        { bold: true, fill: SHADE_HEADER, width: cw[0] }),
      cell('FCA Rating',      { bold: true, fill: SHADE_HEADER, width: cw[1], align: AlignmentType.CENTER }),
      cell('Score',           { bold: true, fill: SHADE_HEADER, width: cw[2], align: AlignmentType.CENTER }),
      cell('Open defects',    { bold: true, fill: SHADE_HEADER, width: cw[3], align: AlignmentType.CENTER }),
      cell('Tenant',          { bold: true, fill: SHADE_HEADER, width: cw[4] }),
    ],
  });
  const portfolioRows = snap.properties.map((prop, i) => {
    const fca = fcaBy.get(prop.short_code);
    const dc  = dcBy.get(prop.short_code);
    return new TableRow({
      children: [
        cell(`${prop.name} (${prop.short_code})`, { width: cw[0], bold: true, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell((fca?.overall_rating || '—').toUpperCase(), { width: cw[1], align: AlignmentType.CENTER, color: ratingColor(fca?.overall_rating), bold: true, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(fca?.numeric_score == null ? '—' : Number(fca.numeric_score).toFixed(2), { width: cw[2], align: AlignmentType.CENTER, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell((dc?.open || 0) + (dc?.work_ordered || 0), { width: cw[3], align: AlignmentType.CENTER, bold: !!(dc?.open), color: dc?.open ? severityColor('major') : COLOR_MUTED, fill: i % 2 ? SHADE_ROW_ALT : undefined }),
        cell(prop.tenant_name || '—', { width: cw[4], fill: i % 2 ? SHADE_ROW_ALT : undefined }),
      ],
    });
  });

  const children: any[] = [
    ...coverPage({
      title: 'KGF Portfolio FM Report',
      subtitle: reportLabel,
      propLabel: '3 properties  •  Suva',
      reportDate,
    }),

    h1('1. Executive Summary'),
    p(`This report covers the KGF portfolio of three Suva office buildings as at ${reportDate}. It consolidates the latest Facility Condition Assessments and the live defect tracker maintained by CMS.`, { spaceAfter: 160 }),
    p(`Portfolio average FCA score: ${portfolioFcaAvg == null ? '—' : portfolioFcaAvg.toFixed(2)} on the CMS 1–5 scale (5=Excellent, 1=Poor).`, { bold: true, spaceAfter: 80 }),
    p(`Open defects across the portfolio: ${totals.open} (${totals.critical_open} critical, ${totals.major_open} major). Resolved cumulative: ${totals.resolved}.`, { spaceAfter: 200 }),

    h2('Critical items requiring immediate attention'),
    bullet('Naibati House — L2 server room GPOs likely overloaded (operational continuity + fire risk)'),
    bullet('Naibati House — elevator shaft and well requires qualified inspection (Conveyance rated Poor)'),
    bullet('Korobasaga House and Gunu House — fire alarm panels inactive; reactivation before next monthly IFS test'),
    bullet('Naibati House — backup generator and water supply not completed despite tenancy obligations'),

    h1('2. Portfolio Snapshot'),
    table([portfolioHeader, ...portfolioRows], cw),

    h1('3. Per-Property Highlights'),
    ...snap.properties.flatMap((prop) => {
      const fca = fcaBy.get(prop.short_code);
      const dc  = dcBy.get(prop.short_code);
      return [
        h2(`${prop.name} (${prop.short_code})`),
        p(fca?.summary || '—'),
        p(`Open defects: ${dc?.open || 0}  •  Resolved: ${dc?.resolved || 0}  •  Critical open: ${dc?.critical_open || 0}  •  Major open: ${dc?.major_open || 0}`, { italics: true, color: COLOR_MUTED, size: 20 }),
      ];
    }),

    h1('4. Service Contracts — Portfolio View'),
    ...((() => {
      const cw2 = [3600, 1800, 1500, 1500, CONTENT_W - 8400];
      const headerRow = new TableRow({
        tableHeader: true,
        children: [
          cell('Contract',          { bold: true, fill: SHADE_HEADER, width: cw2[0] }),
          cell('Property',          { bold: true, fill: SHADE_HEADER, width: cw2[1] }),
          cell('Frequency',         { bold: true, fill: SHADE_HEADER, width: cw2[2] }),
          cell('Fee',               { bold: true, fill: SHADE_HEADER, width: cw2[3], align: AlignmentType.RIGHT }),
          cell('Next service',      { bold: true, fill: SHADE_HEADER, width: cw2[4] }),
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

    h1('5. Open Follow-ups'),
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
      headers: { default: buildHeader('KGF Portfolio') },
      footers: { default: buildFooter(reportLabel, reportDate) },
      children,
    }],
  });
}

// ----- entry point ----------------------------------------------------------

export type GeneratedReport = {
  filename: string;
  buffer: Buffer;
  scope: 'property' | 'portfolio';
  short_code: string;
};

// Build all four docx files for a given month from the snapshot.
export async function buildReportsForMonth(
  snap: ReportSnapshot,
  reportMonth: string,
): Promise<GeneratedReport[]> {
  const out: GeneratedReport[] = [];
  const clientCode = snap.properties[0]?.client_short_code || 'KGF';

  for (const prop of snap.properties) {
    const filename = `${clientCode}-${prop.short_code}-${reportMonth}-Report.docx`;
    const doc = propertyReport(prop, snap, reportMonth);
    const buf = await Packer.toBuffer(doc);
    out.push({
      filename,
      buffer: buf,
      scope: 'property',
      short_code: prop.short_code,
    });
  }

  const portfolioFilename = `${clientCode}-${reportMonth}-Portfolio-Report.docx`;
  const portfolioDoc = portfolioReport(snap, reportMonth);
  const portfolioBuf = await Packer.toBuffer(portfolioDoc);
  out.push({
    filename: portfolioFilename,
    buffer: portfolioBuf,
    scope: 'portfolio',
    short_code: clientCode,
  });

  return out;
}

export async function buildPropertyReport(
  snap: ReportSnapshot,
  shortCode: string,
  reportMonth: string,
): Promise<GeneratedReport | null> {
  const prop = snap.properties.find(p => p.short_code === shortCode);
  if (!prop) return null;
  const clientCode = prop.client_short_code;
  const doc = propertyReport(prop, snap, reportMonth);
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
  const doc = portfolioReport(snap, reportMonth);
  const buf = await Packer.toBuffer(doc);
  return {
    filename: `${clientCode}-${reportMonth}-Portfolio-Report.docx`,
    buffer: buf,
    scope: 'portfolio',
    short_code: clientCode,
  };
}
