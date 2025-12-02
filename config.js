/**
 * 환경변수 로딩 및 공통 설정 관리
 * dotenv를 통해 .env 파일에서 설정값을 읽어온다.
 */
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

/**
 * 환경변수 검증 및 기본값 설정
 */
function getEnv(key, defaultValue = null) {
  const value = process.env[key];
  if (!value && defaultValue === null) {
    throw new Error(`필수 환경변수 ${key}가 설정되지 않았습니다.`);
  }
  return value || defaultValue;
}

/**
 * 선택적 환경변수 가져오기 (없어도 오류를 던지지 않음)
 */
function getOptionalEnv(key) {
  return process.env[key] || null;
}

/**
 * Google 서비스 계정 키 처리
 * 
 * 방식 1: service-account.json 파일에서 읽기 (GOOGLE_SERVICE_ACCOUNT_FILE)
 * 방식 2: 환경변수에서 직접 읽기 (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY)
 * 
 * 환경변수 방식 사용 시: .env 파일에서 키를 설정할 때
 * - 여러 줄로 나누어 작성하거나
 * - \n을 실제 개행으로 변환해야 함
 */
function loadGoogleServiceAccount() {
  // 방식 1: JSON 파일 경로가 지정된 경우
  const serviceAccountFile = getOptionalEnv('GOOGLE_SERVICE_ACCOUNT_FILE');
  if (serviceAccountFile) {
    try {
      const filePath = join(__dirname, serviceAccountFile);
      const serviceAccount = JSON.parse(readFileSync(filePath, 'utf8'));
      return {
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
      };
    } catch (error) {
      throw new Error(`서비스 계정 파일을 읽는 중 오류: ${error.message}`);
    }
  }

  // 방식 2: 환경변수에서 직접 읽기
  const email = getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  let key = getEnv('GOOGLE_SERVICE_ACCOUNT_KEY');

  // 개행 문자 처리: 여러 형태의 이스케이프 시퀀스를 실제 개행으로 변환
  if (key) {
    // \n (백슬래시 + n)을 실제 개행으로 변환
    key = key.replace(/\\n/g, '\n');
    // 이미 개행이 포함되어 있을 수도 있으므로 그대로 유지
  }

  // 키 유효성 검사
  if (key && !key.includes('BEGIN PRIVATE KEY')) {
    throw new Error('서비스 계정 키 형식이 올바르지 않습니다. "-----BEGIN PRIVATE KEY-----"로 시작해야 합니다.');
  }

  return { email, key };
}

const googleAccount = loadGoogleServiceAccount();

export const config = {
  // Figma 설정
  figmaToken: getEnv('FIGMA_TOKEN'),
  figmaFileKey: getEnv('FIGMA_FILE_KEY'),
  figmaWriteEnabled: getEnv('FIGMA_WRITE_ENABLED', 'false') === 'true',
  figmaTargetPage: getEnv('FIGMA_TARGET_PAGE', null), // 옵션: 특정 페이지만 탐색
  figmaDryRunLimit: getOptionalEnv('FIGMA_DRY_RUN_LIMIT') ? parseInt(getOptionalEnv('FIGMA_DRY_RUN_LIMIT'), 10) : null, // 테스트용: N개만 처리

  // Google Sheets 설정
  googleSheetsId: getEnv('GOOGLE_SHEETS_ID'),
  googleServiceAccountEmail: googleAccount.email,
  googleServiceAccountKey: googleAccount.key,
};

