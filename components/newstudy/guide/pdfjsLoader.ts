/**
 * pdfjsLoader.ts — open a PDF with pdfjs, loaded only when a guide is picked · 按需加载 pdfjs
 *
 * Both imports are dynamic, so pdfjs and its worker live in their own lazy
 * chunks and the main bundle does not grow (ADR-0019 §1). The CMap files
 * (Chinese PDFs with predefined CJK encodings) are served under
 * PDFJS_CMAPS_DIR by scripts/vitePdfjsCmaps.ts, in dev and in the build.
 */
import type { PdfDocLike } from './guidePdf';
import { PDFJS_CMAPS_DIR } from '../../../scripts/pdfjsCmapsDir';

export async function openWithPdfjs(data: Uint8Array): Promise<PdfDocLike> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs.getDocument({
    data,
    cMapUrl: `${import.meta.env.BASE_URL}${PDFJS_CMAPS_DIR}/`,
    cMapPacked: true,
  }).promise;
}
