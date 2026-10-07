/**
 * pdfWriter.ts — a tiny dependency-free PDF writer for test fixtures · 测试用 PDF 生成
 *
 * Writes pages of plain text lines in one Type0 font (Identity-H) with a
 * ToUnicode map, so pdfjs extracts real Unicode — Chinese included — the
 * way it does from a Word/WPS export. The font is not embedded (only text
 * extraction is tested, never rendering), which keeps a fixture a few KB.
 * A page with no lines draws one rectangle: a "scan" with no text layer.
 * Deterministic: the same pages give the same bytes.
 */

/** Each page is its text lines, top to bottom; [] = an image-only page. */
export type PdfPages = ReadonlyArray<ReadonlyArray<string>>;

const PAGE_W = 595;
const PAGE_H = 842;
const FONT_SIZE = 14;
const LINE_GAP = 24;
const MARGIN = 50;

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');

/** Distinct characters in first-seen order → CIDs 1..n. */
function cidTable(pages: PdfPages): Map<string, number> {
  const table = new Map<string, number>();
  for (const line of pages.flat()) for (const ch of Array.from(line)) if (!table.has(ch)) table.set(ch, table.size + 1);
  return table;
}

function toUnicodeCMap(table: Map<string, number>): string {
  const entries = [...table].map(([ch, cid]) => `<${hex4(cid)}> <${Array.from(ch).map(c => hex4(c.codePointAt(0)!)).join('')}>`);
  const chunks: string[] = [];
  for (let i = 0; i < entries.length; i += 100) {
    const part = entries.slice(i, i + 100);
    chunks.push(`${part.length} beginbfchar\n${part.join('\n')}\nendbfchar`);
  }
  return [
    '/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Guide-UCS def', '/CMapType 2 def',
    '1 begincodespacerange', '<0000> <FFFF>', 'endcodespacerange',
    ...chunks, 'endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end',
  ].join('\n');
}

function pageContent(lines: ReadonlyArray<string>, table: Map<string, number>): string {
  if (lines.length === 0) return `0.5 g ${MARGIN} ${MARGIN} 300 400 re f`;
  const shown = lines.map((line, i) => {
    const glyphs = Array.from(line).map(ch => hex4(table.get(ch)!)).join('');
    return `${i === 0 ? `${MARGIN} ${PAGE_H - MARGIN} Td` : `0 -${LINE_GAP} Td`} <${glyphs}> Tj`;
  });
  return `BT /F1 ${FONT_SIZE} Tf\n${shown.join('\n')}\nET`;
}

/** The PDF bytes for `pages`. */
export function writePdf(pages: PdfPages): Uint8Array {
  const table = cidTable(pages);
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const stream = (data: string) => `<< /Length ${new TextEncoder().encode(data).length} >>\nstream\n${data}\nendstream`;

  const catalog = add('');
  const pagesObj = add('');
  const toUnicode = add(stream(toUnicodeCMap(table)));
  const descriptor = add('<< /Type /FontDescriptor /FontName /GuideSans /Flags 4 /FontBBox [0 -200 1000 900] ' +
    '/ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>');
  const cidFont = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /GuideSans ' +
    `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW 1000 >>`);
  const font = add(`<< /Type /Font /Subtype /Type0 /BaseFont /GuideSans /Encoding /Identity-H ` +
    `/DescendantFonts [${cidFont} 0 R] /ToUnicode ${toUnicode} 0 R >>`);
  const pageIds = pages.map(lines => {
    const content = add(stream(pageContent(lines, table)));
    return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const encoder = new TextEncoder();
  let out = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(encoder.encode(out).length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = encoder.encode(out).length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return encoder.encode(out);
}
