/**
 * Figma-Sheets 동기화 데이터 엔진 HTTP API 서버
 * 
 * Figma Plugin이 패치 데이터를 가져올 수 있도록 HTTP API를 제공합니다.
 * 실제 텍스트 변경은 Figma Plugin에서 수행됩니다.
 */
import express from 'express';
import { fetchFigmaFile, getFrames, buildNodePatches } from './figma.js';
import { getSheetMap } from './sheets.js';
import { fetchPdfUrlsFromFigma, downloadPdfBuffer, mergePdfBuffers } from './utils/pdf.js';
import { config } from './config.js';

// 표지 / 목차 / 뒷표지 프레임 이름 (Figma 프레임의 name 값)
const COVER_FRAME_NAME = '0-0';   // 표지
const TOC_FRAME_NAME   = '0-1';   // 목차

const app = express();
const PORT = process.env.PORT || 4000;

// 🔹 Figma에서만 credential 허용할 Origin 목록
const ALLOWED_ORIGINS = [
  'https://www.figma.com',
  // 데스크톱/샌드박스 환경 대비 여유로 추가 (필요 없으면 빼도 됨)
  'https://www.figma.com/plugin-sandbox'
];

// CORS 설정: Figma Plugin UI가 이 서버에서 데이터를 가져올 수 있도록
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    // Figma에서 올 때만 명시 Origin + Credentials 허용
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // 그 외 환경(테스트용 등)은 그냥 전체 오픈 (Credentials 없음)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  // Origin에 따라 응답이 달라지므로 캐시 분리
  res.setHeader('Vary', 'Origin');

  // OPTIONS preflight 처리
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
});

// JSON 파싱 미들웨어
app.use(express.json());

/**
 * GET /figma-patches
 * 
 * Google Sheets와 Figma 파일을 읽어서 패치 목록을 생성하여 반환합니다.
 * 
 * 응답 형식:
 * {
 *   status: 'ok',
 *   count: <number>,
 *   patches: [
 *     {
 *       nodeId: string,
 *       frameName: string,
 *       layerName: string,
 *       newText: string
 *     },
 *     ...
 *   ],
 *   matchedFrameIds: string[],
 *   totalFrames: number,
 *   matchedCount: number
 * }
 */
app.get('/figma-patches', async (req, res) => {
  try {
    console.log('[GET /figma-patches] 요청 받음');

    // 1) Google Sheets에서 제품 데이터 로드
    console.log('  → 시트 데이터 읽는 중...');
    const sheetMap = await getSheetMap();
    console.log(`  ✓ 시트에서 ${Object.keys(sheetMap).length}개의 제품을 로드했습니다.`);

    // 2) Figma 파일 JSON 로드
    console.log('  → Figma 파일 가져오는 중...');
    const fileJson = await fetchFigmaFile();
    console.log(`  ✓ Figma 파일 로드 완료: ${fileJson.name || 'N/A'}`);

    // 3) 프레임 추출
    console.log('  → 프레임 추출 중...');
    const frames = getFrames(fileJson);
    console.log(`  ✓ ${frames.length}개의 프레임을 찾았습니다.`);

    // 🔹 3-1. 시트 순서 맵 만들기 (productName → index)
    const sheetOrderMap = new Map();
    let order = 0;
    for (const key of Object.keys(sheetMap)) {
      sheetOrderMap.set(key.trim(), order++);
    }

    // 🔹 3-2. 시트와 매칭되는 프레임만 골라서, 시트 순서 인덱스 부여
    const matchedMeta = []; // { id, name, sheetIndex }
    for (const frame of frames) {
      const frameName = frame.name.trim();
      const row = sheetMap[frameName];

      if (!row) continue; // 시트에 없는 프레임은 패스

      const sheetIndex =
        sheetOrderMap.has(frameName)
          ? sheetOrderMap.get(frameName)
          : Number.MAX_SAFE_INTEGER;

      matchedMeta.push({
        id: frame.id,
        name: frameName,
        sheetIndex,
      });
    }

    // 🔹 3-3. 시트 순서대로 정렬
    matchedMeta.sort((a, b) => a.sheetIndex - b.sheetIndex);

    // 🔹 3-4. 최종 matchedFrameIds = 시트 순서대로 정렬된 프레임 ID
    const matchedFrameIds = matchedMeta.map((m) => m.id);
    console.log(`  ✓ 시트와 매칭된 프레임: ${matchedFrameIds.length}개`);

    // 4) 패치 생성 (기존 로직 그대로 사용, matchedFrameIds는 여기 계산한 것을 사용)
    console.log('  → 패치 생성 중...');
    const { patches } = buildNodePatches(frames, sheetMap);
    console.log(`  ✓ ${patches.length}개의 텍스트 패치를 생성했습니다.`);

    // 5) 응답 반환
    res.json({
      status: 'ok',
      count: patches.length,
      patches,
      matchedFrameIds,           // 🔹 여기! 우리가 직접 계산한 값
      totalFrames: frames.length,
      matchedCount: matchedFrameIds.length,
      fileKey: config.figmaFileKey,
    });

    console.log(
      `[GET /figma-patches] 성공: ${patches.length}개 패치, ${matchedFrameIds.length}개 매칭 프레임 반환`
    );
  } catch (err) {
    console.error('[GET /figma-patches] 오류:', err);
    res.status(500).json({
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

/**
 * POST /figma-export-pdf
 * 
 * 매칭된 프레임들을 PDF로 추출하여 하나의 PDF로 병합하여 반환합니다.
 * 
 * 요청 바디:
 * {
 *   fileKey: string,
 *   frameIds: string[]
 * }
 * 
 * 응답:
 * - 성공: application/pdf (병합된 PDF 파일)
 * - 실패: JSON { error: string }
 */
app.post('/figma-export-pdf', async (req, res) => {
  try {
    console.log('[POST /figma-export-pdf] 요청 받음');
    console.log('  → body:', req.body);

    const { fileKey, frameIds, backFrameName } = req.body;
    const finalFileKey = fileKey || config.figmaFileKey;

    // 입력 검증
    if (!finalFileKey || !Array.isArray(frameIds) || frameIds.length === 0) {
      return res.status(400).json({
        error: 'fileKey와 frameIds 배열이 필요합니다.',
      });
    }

    console.log(`  → (상품) ${frameIds.length}개의 프레임을 PDF로 변환할 예정입니다.`);
    console.log('  → 선택된 뒷표지 프레임 이름:', backFrameName);

    // ----------------------------------------------------
    // 1) Figma 파일에서 표지/목차/뒷표지 프레임 ID 찾기
    // ----------------------------------------------------
    console.log('  → Figma 파일에서 표지/목차/뒷표지 프레임 검색 중...');
    const fileJson = await fetchFigmaFile();
    const frames = getFrames(fileJson);

    function findFrameIdByName(name) {
      if (!name) return null;
      const f = frames.find((fr) => fr.name.trim() === name);
      return f ? f.id : null;
    }

    const coverId = findFrameIdByName(COVER_FRAME_NAME);
    const tocId   = findFrameIdByName(TOC_FRAME_NAME);

    // backFrameName이 없으면 기본값 '0-11' 사용
    const backName = backFrameName || '0-11';
    const backId   = findFrameIdByName(backName);

    if (!coverId) {
      console.warn(`  ⚠ 표지 프레임("${COVER_FRAME_NAME}")을 찾지 못했습니다.`);
    }
    if (!tocId) {
      console.warn(`  ⚠ 목차 프레임("${TOC_FRAME_NAME}")을 찾지 못했습니다.`);
    }
    if (!backId) {
      console.warn(`  ⚠ 뒷표지 프레임("${backName}")을 찾지 못했습니다.`);
    }

    // ----------------------------------------------------
    // 2) 최종 frameIds 순서 구성
    //    [표지, 목차, ...상품..., 뒷표지] + 중복 제거
    // ----------------------------------------------------
    const orderedIds = [];

    if (coverId) orderedIds.push(coverId);
    if (tocId)   orderedIds.push(tocId);

    for (const id of frameIds) {
      orderedIds.push(id);
    }

    if (backId) orderedIds.push(backId);

    // 중복 제거
    const finalFrameIds = Array.from(new Set(orderedIds));

    console.log('  → 최종 PDF 병합 순서:', finalFrameIds);

    // ----------------------------------------------------
    // 3) Figma Images API를 통해 PDF URL 가져오기
    // ----------------------------------------------------
    console.log('  → Figma PDF URL 요청 중...');
    const pdfUrls = await fetchPdfUrlsFromFigma(finalFileKey, finalFrameIds);
    console.log(`  ✓ ${pdfUrls.length}개의 PDF URL을 가져왔습니다.`);

    // ----------------------------------------------------
    // 4) 각 PDF URL을 다운로드하여 Buffer 배열로 변환
    // ----------------------------------------------------
    console.log('  → PDF 파일 다운로드 중...');
    const pdfBuffers = await Promise.all(pdfUrls.map(downloadPdfBuffer));
    console.log(`  ✓ ${pdfBuffers.length}개의 PDF 파일을 다운로드했습니다.`);

    // ----------------------------------------------------
    // 5) pdf-lib을 사용하여 여러 PDF를 하나로 병합
    // ----------------------------------------------------
    console.log('  → PDF 병합 중...');
    const mergedPdfBytes = await mergePdfBuffers(pdfBuffers);
    console.log(`  ✓ PDF 병합 완료 (${mergedPdfBytes.length} bytes)`);

    // ----------------------------------------------------
    // 6) 단일 PDF 파일로 반환
    // ----------------------------------------------------
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="proposal.pdf"');
    res.send(Buffer.from(mergedPdfBytes));

    console.log('[POST /figma-export-pdf] 성공: 병합된 PDF 반환');
  } catch (err) {
    console.error('[POST /figma-export-pdf] 오류:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'internal server error',
    });
  }
});

/**
 * GET /health
 * 
 * 서버 상태 확인용 엔드포인트
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 서버 시작
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`Figma 데이터 엔진 서버 실행 중...`);
  console.log(`포트: ${PORT}`);
  console.log(`패치 API: http://localhost:${PORT}/figma-patches`);
  console.log(`PDF 내보내기 API: http://localhost:${PORT}/figma-export-pdf`);
  console.log(`상태 확인: http://localhost:${PORT}/health`);
  console.log('='.repeat(50));
});

