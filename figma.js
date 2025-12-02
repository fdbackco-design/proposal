/**
 * Figma API 관련 함수
 * 
 * - Figma 파일 읽기 (REST API)
 * - 프레임 및 텍스트 노드 추출
 * - 시트 데이터와 매칭하여 패치 생성
 * 
 * 참고: 실제 텍스트 변경은 Figma Plugin을 통해 수행됩니다.
 * 이 모듈은 읽기 전용 데이터 엔진 역할만 합니다.
 */
import axios from 'axios';
import { config } from './config.js';
import { walkNodes } from './utils/traverse.js';

/**
 * Figma REST API를 통해 파일 데이터를 가져온다
 * 
 * @returns {Promise<Object>} Figma 파일의 전체 JSON 구조
 * 
 * @throws {Error} API 요청 실패 시
 */
export async function fetchFigmaFile() {
  try {
    const response = await axios.get(
      `https://api.figma.com/v1/files/${config.figmaFileKey}`,
      {
        headers: {
          'X-Figma-Token': config.figmaToken,
        },
      }
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.err || error.message;
      console.error(`Figma API 오류 [${status}]:`, message);
      throw new Error(`Figma 파일을 가져오는 중 오류가 발생했습니다: ${message}`);
    }
    throw new Error(`Figma API 요청 실패: ${error.message}`);
  }
}

/**
 * Figma 파일 JSON에서 프레임 노드를 모두 추출
 * 
 * FIGMA_TARGET_PAGE가 설정되어 있으면 해당 페이지 내에서만 탐색하고,
 * 설정되지 않았으면 전체 문서를 탐색한다.
 * 
 * @param {Object} fileJson - fetchFigmaFile()의 반환값
 * @returns {Array<{id: string, name: string, node: Object}>} 프레임 배열
 */
export function getFrames(fileJson) {
  const frames = [];
  const targetPageName = config.figmaTargetPage;

  /**
   * 특정 페이지 내에서만 프레임을 찾는 함수
   */
  function findFramesInPage(pageNode) {
    walkNodes(pageNode, (node) => {
      if (node.type === 'FRAME') {
        frames.push({
          id: node.id,
          name: node.name,
          node: node,
        });
      }
    });
  }

  // FIGMA_TARGET_PAGE가 지정되어 있으면 해당 페이지만 탐색
  if (targetPageName) {
    let targetPageFound = false;

    walkNodes(fileJson.document, (node) => {
      // CANVAS 타입이 페이지이고, 이름이 일치하면
      if (node.type === 'CANVAS' && node.name === targetPageName) {
        targetPageFound = true;
        findFramesInPage(node);
      }
    });

    if (!targetPageFound) {
      console.warn(`경고: 페이지 "${targetPageName}"을 찾을 수 없습니다. 전체 문서를 탐색합니다.`);
      // 페이지를 찾지 못했으면 전체 탐색으로 폴백
      walkNodes(fileJson.document, (node) => {
        if (node.type === 'FRAME') {
          frames.push({
            id: node.id,
            name: node.name,
            node: node,
          });
        }
      });
    }
  } else {
    // 전체 문서 탐색
    walkNodes(fileJson.document, (node) => {
      if (node.type === 'FRAME') {
        frames.push({
          id: node.id,
            name: node.name,
            node: node,
        });
      }
    });
  }

  return frames;
}

/**
 * 프레임 배열과 시트 데이터를 매칭하여 텍스트 업데이트 패치를 생성
 * 
 * 각 프레임의 이름이 시트의 product_name과 일치하면,
 * 프레임 내부의 특정 텍스트 노드(#product_name, #shipping_fee 등)를
 * 시트 데이터로 업데이트하는 패치를 만든다.
 * 
 * @param {Array<{id: string, name: string, node: Object}>} frames - getFrames()의 반환값
 * @param {Object} sheetMap - getSheetMap()의 반환값 (product_name을 키로 하는 맵)
 * @returns {Array<{nodeId: string, frameName: string, layerName: string, newText: string}>} 패치 배열
 */
export function buildNodePatches(frames, sheetMap) {
  const patches = [];

  // 텍스트 노드 이름 → 시트 필드명 매핑
  const FIELD_MAP = {
    '#product_name': 'productName',
    '#shipping_fee': 'shippingFee',
    '#supply_price_vat': 'supplyPriceVat',
    '#group_price': 'groupPrice',
    '#online_price': 'onlinePrice',
  };

  for (const frame of frames) {
    const frameName = frame.name.trim();
    const row = sheetMap[frameName];

    // 시트에 해당 제품명이 없으면 경고하고 건너뛰기
    if (!row) {
      console.warn(`[SKIP] 프레임 "${frameName}"에 해당하는 시트 데이터를 찾을 수 없습니다.`);
      continue;
    }

    // 매칭 성공 로그
    console.log(`[MATCH] 프레임 "${frameName}" ↔ 시트 행 (${row.company})`);

    // 프레임 내부를 DFS로 순회하며 텍스트 노드 찾기
    walkNodes(frame.node, (node) => {
      // TEXT 타입 노드만 확인
      if (node.type !== 'TEXT') return;

      // 노드 이름이 매핑에 있는지 확인
      const layerName = node.name;
      const fieldName = FIELD_MAP[layerName];

      if (fieldName && row[fieldName] !== undefined) {
        // 패치 추가
        patches.push({
          nodeId: node.id,
          frameName: frameName,
          layerName: layerName,
          newText: row[fieldName],
        });
      }
    });
  }

  return patches;
}

/**
 * @deprecated 이 함수는 더 이상 사용되지 않습니다.
 * 
 * Figma REST API는 텍스트 노드 수정을 지원하지 않으므로,
 * 실제 텍스트 변경은 Figma Plugin을 통해 수행해야 합니다.
 * 
 * 패치 데이터는 HTTP API 서버(`server.js`)를 통해 제공되며,
 * Figma Plugin이 이를 가져와서 적용합니다.
 * 
 * @param {Array<{nodeId: string, frameName: string, layerName: string, newText: string}>} patches - buildNodePatches()의 반환값
 * @returns {Promise<{success: Array, failed: Array}>} 빈 결과 객체
 */
export async function applyPatches(patches) {
  console.warn('\n⚠️  applyPatches()는 더 이상 사용되지 않습니다.');
  console.warn('   Figma REST API는 텍스트 노드 수정을 지원하지 않습니다.');
  console.warn('   실제 텍스트 변경은 Figma Plugin을 통해 수행해야 합니다.');
  console.warn('   HTTP API 서버를 실행하려면: npm run server');
  console.warn('   또는: node server.js\n');
  
  return { success: [], failed: [] };
}

