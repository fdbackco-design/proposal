# Figma-Sheets 동기화 도구

Google Sheets의 제품 데이터를 Figma 파일의 프레임에 자동으로 채우는 도구입니다.

## 아키텍처

이 프로젝트는 두 부분으로 구성됩니다:

1. **Node.js 데이터 엔진** (이 프로젝트)
   - Google Sheets에서 데이터 읽기
   - Figma REST API로 파일 읽기
   - 패치 생성 및 HTTP API 제공

2. **Figma Plugin** (`plugin/` 디렉토리)
   - 데이터 엔진에서 패치 가져오기
   - Figma Plugin API로 실제 텍스트 변경

## 설치

```bash
npm install
```

## 설정

1. `.env.example`을 복사하여 `.env` 파일을 생성합니다:

```bash
cp .env.example .env
```

2. `.env` 파일을 열어 다음 정보를 입력합니다:

**필수 설정:**
- **FIGMA_TOKEN**: Figma Personal Access Token
- **FIGMA_FILE_KEY**: Figma 파일 키 (URL에서 확인 가능)
- **GOOGLE_SHEETS_ID**: Google Sheets ID (URL에서 확인 가능)

**Google 서비스 계정 설정 (두 가지 방식 중 하나 선택):**

**방식 1: JSON 파일 사용 (권장)**
- `service-account.json` 파일을 프로젝트 루트에 배치
- `.env`에 다음 추가:
  ```
  GOOGLE_SERVICE_ACCOUNT_FILE=service-account.json
  ```

**방식 2: 환경변수 직접 사용**
- `.env`에 다음 추가:
  ```
  GOOGLE_SERVICE_ACCOUNT_EMAIL=your_sa@project.iam.gserviceaccount.com
  GOOGLE_SERVICE_ACCOUNT_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
  ```
  ⚠️ 주의: 프라이빗 키의 `\n`은 실제 개행 문자로 변환됩니다. 여러 줄로 작성하거나 `\n`을 포함하여 한 줄로 작성할 수 있습니다.

3. Google Sheets에서 서비스 계정 이메일에 읽기 권한을 부여합니다.

## 사용법

### 1. 패치 계획 확인 (CLI)

```bash
npm start
```

또는

```bash
node index.js
```

이 명령은 패치 계획을 JSON으로 출력합니다. 실제 텍스트 변경은 수행하지 않습니다.

### 2. HTTP API 서버 실행

```bash
npm run server
```

또는

```bash
node server.js
```

서버가 `http://localhost:4000`에서 실행됩니다.

**API 엔드포인트:**
- `GET /figma-patches` - 패치 목록 가져오기
- `GET /health` - 서버 상태 확인

### 3. Figma Plugin으로 패치 적용

1. Figma에서 플러그인을 실행합니다 (`Plugins` > `Development` > `Figma Sheets Sync`)
2. 데이터 엔진 URL을 입력합니다 (기본값: `http://localhost:4000/figma-patches`)
3. "패치 불러와서 적용" 버튼을 클릭합니다.

자세한 내용은 `plugin/README.md`를 참고하세요.

## 동작 방식

### 데이터 엔진 (Node.js)

1. Google Sheets의 `Figma_Export` 시트에서 제품 데이터를 읽습니다.
2. Figma REST API로 파일 JSON을 가져옵니다.
3. 프레임을 추출하고 시트의 `product_name` 컬럼과 매칭합니다.
4. 매칭된 프레임 내부의 텍스트 노드(`#product_name`, `#shipping_fee` 등)를 찾아 업데이트 패치를 생성합니다.
5. HTTP API를 통해 패치 목록을 제공합니다.

### Figma Plugin

1. 데이터 엔진 서버에서 패치 목록을 가져옵니다.
2. 각 패치의 `nodeId`로 노드를 찾습니다.
3. 노드가 TEXT 타입인지 확인하고 필요한 폰트를 로드합니다.
4. `textNode.characters`를 새로운 텍스트로 업데이트합니다.

## 환경 변수

**필수:**
- `FIGMA_TOKEN`: Figma Personal Access Token
- `FIGMA_FILE_KEY`: Figma 파일 키
- `GOOGLE_SHEETS_ID`: Google Sheets ID
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` 또는 `GOOGLE_SERVICE_ACCOUNT_FILE`

**선택:**
- `PORT`: HTTP API 서버 포트 (기본값: `4000`)
- `FIGMA_TARGET_PAGE`: 특정 페이지만 탐색 (예: `제안서 자동화`)

## 프로젝트 구조

```
figma-sync/
 ├─ index.js          # CLI 엔트리 (패치 계획 출력)
 ├─ server.js          # HTTP API 서버
 ├─ figma.js          # Figma API 관련 함수 (읽기 전용)
 ├─ sheets.js          # Google Sheets API 래퍼
 ├─ config.js          # 환경변수 로딩
 ├─ utils/
 │   └─ traverse.js   # DFS 탐색 유틸
 └─ plugin/            # Figma Plugin
    ├─ manifest.json   # 플러그인 매니페스트
    ├─ code.js        # 플러그인 메인 코드
    ├─ ui.html        # 플러그인 UI
    └─ README.md       # 플러그인 사용 가이드
```

## 주의사항

1. **Figma REST API 제한**: Figma REST API v1은 텍스트 수정을 지원하지 않습니다. 따라서 실제 텍스트 변경은 Figma Plugin을 통해 수행해야 합니다.

2. **플러그인 설치**: Figma Plugin을 사용하려면 먼저 플러그인을 Figma에 설치해야 합니다. (`plugin/README.md` 참고)

3. **서버 실행**: HTTP API 서버가 실행 중이어야 플러그인이 패치를 가져올 수 있습니다.

## 프로젝트 구조

```
figma-sync/
 ├─ index.js          # 엔트리 포인트
 ├─ figma.js          # Figma API 관련 함수
 ├─ sheets.js         # Google Sheets API 래퍼
 ├─ config.js         # 환경변수 로딩
 ├─ utils/
 │   └─ traverse.js   # DFS 탐색 유틸
 ├─ .env.example      # 환경변수 예시
 └─ package.json
```

