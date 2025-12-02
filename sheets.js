/**
 * Google Sheets API 래퍼
 * 
 * Figma_Export 시트에서 제품 데이터를 읽어와
 * product_name을 키로 하는 맵 형태로 반환한다.
 */
import { google } from 'googleapis';
import { config } from './config.js';

/**
 * Google Sheets API 클라이언트 초기화
 * 
 * config.js에서 로드한 서비스 계정 정보를 사용하여
 * JWT 인증을 통해 Google Sheets API에 접근한다.
 * 
 * 지원하는 방식:
 * 1. GOOGLE_SERVICE_ACCOUNT_FILE 환경변수로 JSON 파일 경로 지정
 * 2. GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY 환경변수 사용
 */
function getSheetsClient() {
  try {
    const auth = new google.auth.JWT(
      config.googleServiceAccountEmail,
      null,
      config.googleServiceAccountKey,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    return google.sheets({ version: 'v4', auth });
  } catch (error) {
    console.error('Google Sheets 인증 초기화 오류:', error.message);
    throw new Error(`Google Sheets 인증 설정 실패: ${error.message}`);
  }
}

/**
 * Google Sheets에서 Figma_Export 시트의 데이터를 읽어와
 * product_name을 키로 하는 맵으로 변환
 * 
 * @returns {Promise<Object>} product_name을 키로 하는 제품 데이터 맵
 * 
 * @example
 * {
 *   "호이드 오브제 플렉스 무선청소기": {
 *     company: "에임즈피앤엘",
 *     productName: "호이드 오브제 플렉스 무선청소기",
 *     shippingFee: "4,000",
 *     supplyPriceVat: "90,000",
 *     groupPrice: "180,000",
 *     onlinePrice: "1,500,000",
 *   },
 *   ...
 * }
 */
export async function getSheetMap() {
  try {
    const sheets = getSheetsClient();

    // Figma_Export 시트의 A2:F 범위 읽기 (A1~F1은 헤더이므로 A2부터 시작)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheetsId,
      range: 'Figma_Export!A2:F',
    });

    const rows = response.data.values || [];
    const map = {};

    for (const row of rows) {
      // 행이 비어있거나 컬럼 수가 부족하면 스킵
      if (!row || row.length < 2) continue;

      const [company, productName, shipping, supplyVat, groupPrice, onlinePrice] = row;

      // product_name이 비어있으면 스킵
      if (!productName || !productName.trim()) continue;

      // 양쪽 공백 제거하여 키로 사용 (프레임 이름과 매칭을 위해)
      const key = productName.trim();

      map[key] = {
        company: company || '',
        productName: productName.trim(),
        shippingFee: shipping || '',
        supplyPriceVat: supplyVat || '',
        groupPrice: groupPrice || '',
        onlinePrice: onlinePrice || '',
      };
    }

    return map;
  } catch (error) {
    console.error('Google Sheets 읽기 오류:', error.message);
    if (error.response) {
      console.error('응답 상태:', error.response.status);
      console.error('응답 데이터:', error.response.data);
    }
    throw new Error(`시트 데이터를 읽는 중 오류가 발생했습니다: ${error.message}`);
  }
}

