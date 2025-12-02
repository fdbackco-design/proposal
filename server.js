/**
 * Figma-Sheets 동기화 데이터 엔진 HTTP API 서버
 * 
 * Figma Plugin이 패치 데이터를 가져올 수 있도록 HTTP API를 제공합니다.
 * 실제 텍스트 변경은 Figma Plugin에서 수행됩니다.
 */
import express from 'express';
import { fetchFigmaFile, getFrames, buildNodePatches } from './figma.js';
import { getSheetMap } from './sheets.js';

const app = express();
const PORT = process.env.PORT || 4000;

// CORS 설정: Figma Plugin UI가 이 서버에서 데이터를 가져올 수 있도록
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  
  // OPTIONS 요청 처리
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
 *   ]
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

    // 4) 패치 생성
    console.log('  → 패치 생성 중...');
    const patches = buildNodePatches(frames, sheetMap);
    console.log(`  ✓ ${patches.length}개의 텍스트 패치를 생성했습니다.`);

    // 5) 응답 반환
    res.json({
      status: 'ok',
      count: patches.length,
      patches,
    });

    console.log(`[GET /figma-patches] 성공: ${patches.length}개 패치 반환`);
  } catch (err) {
    console.error('[GET /figma-patches] 오류:', err);
    res.status(500).json({
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
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
  console.log(`상태 확인: http://localhost:${PORT}/health`);
  console.log('='.repeat(50));
});

