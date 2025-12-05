// utils/pdf.js
import { PDFDocument } from 'pdf-lib';
import { config } from '../config.js';

/**
 * Figma Images API에서 각 frameId에 대한 PDF URL 목록을 가져온다.
 */
export async function fetchPdfUrlsFromFigma(fileKey, frameIds, token = config.figmaToken) {
  if (!token) {
    throw new Error('FIGMA_TOKEN이 설정되어 있지 않습니다.');
  }

  const idsParam = frameIds.join(',');
  const params = new URLSearchParams({
    ids: idsParam,
    format: 'pdf',
  });

  const url = `https://api.figma.com/v1/images/${fileKey}?${params.toString()}`;
  console.log('[fetchPdfUrlsFromFigma] 요청 URL:', url);

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Figma-Token': token,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error('[fetchPdfUrlsFromFigma] Figma 응답 에러:', resp.status, text);
    throw new Error(`Figma images API 실패: ${resp.status} ${text}`);
  }

  const data = await resp.json(); // { images: { [id]: url } }
  console.log('[fetchPdfUrlsFromFigma] 응답 images keys:', Object.keys(data.images || {}));

  return frameIds.map((id) => {
    const pdfUrl = data.images[id];
    if (!pdfUrl) {
      throw new Error(`프레임 ${id}에 대한 PDF URL을 찾을 수 없습니다.`);
    }
    return pdfUrl;
  });
}

/**
 * 주어진 URL에서 PDF 파일을 다운로드하여 Buffer로 반환
 */
export async function downloadPdfBuffer(url) {
  console.log('[downloadPdfBuffer] 다운로드:', url);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PDF 다운로드 실패: ${res.status} ${text}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * 여러 개의 PDF Buffer를 하나의 PDF로 병합하여 Uint8Array로 반환
 */
export async function mergePdfBuffers(buffers) {
  const mergedPdf = await PDFDocument.create();

  for (const buf of buffers) {
    const pdf = await PDFDocument.load(buf);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedBytes = await mergedPdf.save();
  return mergedBytes;
}