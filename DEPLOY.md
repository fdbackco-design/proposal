# Synology NAS Docker 배포 가이드

## [1단계] 프로젝트 분석 요약

### 기술 스택
- **언어/런타임**: Node.js 20 (ESM 모듈)
- **프레임워크**: Express.js
- **패키지 매니저**: npm
- **진입점 파일**: `server.js` (HTTP API 서버)
- **기본 포트**: 4000 (환경변수 `PORT`로 변경 가능)

### 주요 기능
- Google Sheets에서 제품 데이터 읽기
- Figma REST API로 파일 읽기
- 패치 생성 및 HTTP API 제공 (`GET /figma-patches`, `GET /health`)

### 환경변수 요구사항
필수:
- `FIGMA_TOKEN`: Figma Personal Access Token
- `FIGMA_FILE_KEY`: Figma 파일 키
- `GOOGLE_SHEETS_ID`: Google Sheets ID
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_KEY` (또는 `GOOGLE_SERVICE_ACCOUNT_FILE`)

선택:
- `PORT`: 서버 포트 (기본값: 4000)
- `FIGMA_TARGET_PAGE`: 특정 페이지만 탐색

---

## [2단계] Dockerfile

```dockerfile
# Multi-stage build for Figma-Sheets Sync Data Engine
# Stage 1: Build dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (production only)
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=appuser:appuser . .

# Switch to non-root user
USER appuser

# Expose port (default: 4000, can be overridden via PORT env var)
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-4000}/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start the server
CMD ["node", "server.js"]
```

---

## [3단계] .dockerignore

```
# Dependencies
node_modules/
npm-debug.log
yarn-error.log
package-lock.json

# Environment files (will be mounted as volume or passed via env_file)
.env
.env.local
.env.*.local

# Git
.git/
.gitignore
.gitattributes

# IDE
.vscode/
.idea/
*.swp
*.swo
*.sublime-*

# OS
.DS_Store
Thumbs.db
*.log

# Documentation (optional - remove if you want docs in image)
*.md
!README.md

# Plugin files (not needed in container)
plugin/

# Sample files
*.sample.json
*.example

# Docker files
Dockerfile
.dockerignore
docker-compose.yml
docker-compose.*.yml

# CI/CD
.github/
.gitlab-ci.yml

# Temporary files
tmp/
temp/
*.tmp
```

---

## [4단계] docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: figma-sync-server
    restart: always
    ports:
      # TODO: 호스트 포트를 변경하려면 왼쪽 숫자 수정 (예: "5000:4000")
      - "4000:4000"
    env_file:
      - .env
    environment:
      # 포트는 환경변수로도 설정 가능 (기본값: 4000)
      - PORT=${PORT:-4000}
      - NODE_ENV=production
    volumes:
      # 로그 디렉토리 마운트 (선택사항)
      # TODO: NAS 경로를 실제 경로로 변경하세요
      # - /volume1/docker/figma-sync/logs:/app/logs
      
      # 서비스 계정 JSON 파일이 필요한 경우 (GOOGLE_SERVICE_ACCOUNT_FILE 사용 시)
      # TODO: service-account.json 파일이 있다면 주석 해제하고 경로 수정
      # - /volume1/docker/figma-sync/service-account.json:/app/service-account.json:ro
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:4000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"]
      interval: 30s
      timeout: 10s
      start_period: 40s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## [5단계] Synology Container Manager 배포 가이드

### 방법 A: SSH를 통한 docker-compose 사용 (권장)

#### 1. 프로젝트 코드를 NAS에 복사

**로컬 개발 환경에서:**
```bash
# Git 저장소가 있다면
git pull origin main  # 또는 master

# 프로젝트 디렉토리로 이동
cd /path/to/figmaAuto

# NAS에 복사 (rsync 사용, 또는 SMB/CIFS로 복사)
# 예시: rsync -avz --exclude 'node_modules' --exclude '.git' ./ admin@nas-ip:/volume1/docker/figma-sync/
```

**또는 SMB/CIFS를 통해:**
- Windows: `\\nas-ip\docker` 네트워크 드라이브에 `figma-sync` 폴더 생성 후 복사
- Mac: `smb://nas-ip/docker` 마운트 후 복사

**NAS 경로 예시:**
```
/volume1/docker/figma-sync/
├── Dockerfile
├── docker-compose.yml
├── .env                    # 환경변수 파일 (직접 생성)
├── package.json
├── server.js
├── config.js
├── figma.js
├── sheets.js
├── index.js
└── utils/
```

#### 2. .env 파일 생성

NAS의 프로젝트 디렉토리에서 `.env` 파일을 생성하고 다음 내용을 입력:

```env
# Figma 설정
FIGMA_TOKEN=your_figma_personal_access_token
FIGMA_FILE_KEY=your_figma_file_key

# Google Sheets 설정
GOOGLE_SHEETS_ID=your_google_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_sa@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n

# 서버 설정
PORT=4000

# 선택사항
# FIGMA_TARGET_PAGE=제안서 자동화
```

**중요**: `.env` 파일은 민감한 정보를 포함하므로 권한을 제한하세요:
```bash
chmod 600 .env
```

#### 3. SSH 접속 및 컨테이너 실행

**SSH 접속:**
```bash
ssh admin@nas-ip
# 또는
ssh your-username@nas-ip
```

**프로젝트 디렉토리로 이동:**
```bash
cd /volume1/docker/figma-sync
```

**권한 확인 및 수정 (필요시):**
```bash
# 디렉토리 소유권 확인
ls -la

# 필요시 소유권 변경 (UID/GID 1000:1000)
sudo chown -R 1000:1000 /volume1/docker/figma-sync
```

**Docker Compose로 빌드 및 실행:**
```bash
# 이미지 빌드 및 컨테이너 시작
docker compose up -d --build

# 실행 상태 확인
docker compose ps

# 로그 확인
docker compose logs -f app
```

#### 4. 컨테이너 상태 확인

```bash
# 컨테이너 상태
docker compose ps

# 헬스체크 상태
docker inspect figma-sync-server | grep -A 10 Health

# 로그 실시간 확인
docker compose logs -f app

# 서버 응답 테스트
curl http://localhost:4000/health
```

---

### 방법 B: Container Manager UI 사용

#### 1. 프로젝트 코드 복사
- 방법 A의 1단계와 동일

#### 2. Container Manager에서 이미지 빌드

1. **Container Manager** 앱 실행
2. **Container** 탭 → **프로젝트** → **생성** 클릭
3. **프로젝트 이름**: `figma-sync`
4. **경로**: `/volume1/docker/figma-sync` 선택
5. **소스**: `docker-compose.yml` 파일 선택
6. **생성** 클릭

#### 3. 환경변수 설정

Container Manager UI에서:
1. 프로젝트 선택 → **편집**
2. **환경** 탭에서 환경변수 추가:
   - `FIGMA_TOKEN`: (값 입력)
   - `FIGMA_FILE_KEY`: (값 입력)
   - `GOOGLE_SHEETS_ID`: (값 입력)
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: (값 입력)
   - `GOOGLE_SERVICE_ACCOUNT_KEY`: (값 입력)
   - `PORT`: `4000`

또는 `.env` 파일을 프로젝트 디렉토리에 두고 `env_file` 설정 사용

#### 4. 컨테이너 시작

1. 프로젝트 선택 → **시작** 클릭
2. 로그 탭에서 실행 상태 확인

---

## [6단계] 프로덕션 운영 팁

### 헬스체크

헬스체크는 `docker-compose.yml`에 이미 설정되어 있습니다:
- **엔드포인트**: `GET /health`
- **간격**: 30초
- **타임아웃**: 10초
- **재시도**: 3회

### 로그 확인

**Docker 로그:**
```bash
# 실시간 로그
docker compose logs -f app

# 최근 100줄
docker compose logs --tail=100 app

# 특정 시간 이후
docker compose logs --since 1h app
```

**NAS에서 로그 파일 직접 보기:**
- Container Manager UI: **로그** 탭
- 또는 SSH: `docker compose logs app > /volume1/docker/figma-sync/logs/app.log`

### 컨테이너 재배포 플로우

**코드 변경 후 재배포:**

1. **로컬에서 코드 수정 및 커밋**
   ```bash
   git add .
   git commit -m "Update code"
   git push
   ```

2. **NAS에서 최신 코드 가져오기**
   ```bash
   ssh admin@nas-ip
   cd /volume1/docker/figma-sync
   git pull  # 또는 수동으로 파일 복사
   ```

3. **이미지 재빌드 및 컨테이너 재시작**
   ```bash
   docker compose up -d --build
   ```

4. **상태 확인**
   ```bash
   docker compose ps
   docker compose logs -f app
   ```

**빠른 재시작 (코드 변경 없이):**
```bash
docker compose restart app
```

### 권한 문제 해결

**Synology NAS에서 자주 발생하는 권한 문제:**

1. **폴더 권한 오류**
   ```bash
   # 소유권을 1000:1000으로 변경 (Dockerfile의 appuser와 일치)
   sudo chown -R 1000:1000 /volume1/docker/figma-sync
   
   # 또는 현재 사용자로 변경
   sudo chown -R $USER:$USER /volume1/docker/figma-sync
   ```

2. **.env 파일 권한**
   ```bash
   chmod 600 .env
   ```

3. **서비스 계정 JSON 파일 권한 (필요시)**
   ```bash
   chmod 600 service-account.json
   ```

### 포트 충돌 해결

다른 서비스가 4000 포트를 사용 중이라면:

1. **docker-compose.yml 수정:**
   ```yaml
   ports:
     - "5000:4000"  # 호스트 포트를 5000으로 변경
   ```

2. **또는 환경변수로 포트 변경:**
   ```env
   PORT=5000
   ```
   그리고 docker-compose.yml:
   ```yaml
   ports:
     - "5000:5000"
   ```

### 네트워크 접근

**로컬 네트워크에서 접근:**
- `http://nas-ip:4000/health`
- `http://nas-ip:4000/figma-patches`

**Figma Plugin에서 접근:**
- Plugin의 `manifest.json`에서 `devAllowedDomains`에 `http://nas-ip:4000` 추가
- 또는 로컬 네트워크에서 `http://nas-ip:4000` 사용

---

## [7단계] TODO 체크리스트

배포 전에 다음 항목을 확인하고 수정하세요:

- [ ] **포트 설정**: `docker-compose.yml`의 `ports` 섹션에서 호스트 포트 확인 (기본: `4000:4000`)
- [ ] **NAS 경로**: `docker-compose.yml`의 `volumes` 섹션에서 실제 NAS 경로로 변경
  - 예: `/volume1/docker/figma-sync` → 실제 경로
- [ ] **.env 파일**: 모든 필수 환경변수 입력
  - `FIGMA_TOKEN`: TODO - Figma Personal Access Token 입력
  - `FIGMA_FILE_KEY`: TODO - Figma 파일 키 입력
  - `GOOGLE_SHEETS_ID`: TODO - Google Sheets ID 입력
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: TODO - 서비스 계정 이메일 입력
  - `GOOGLE_SERVICE_ACCOUNT_KEY`: TODO - 서비스 계정 프라이빗 키 입력
- [ ] **서비스 계정 파일**: `GOOGLE_SERVICE_ACCOUNT_FILE` 사용 시 `docker-compose.yml`의 volumes 주석 해제 및 경로 수정
- [ ] **권한 설정**: NAS 디렉토리 및 파일 권한 확인 (1000:1000 또는 현재 사용자)
- [ ] **네트워크**: Figma Plugin에서 접근 가능한지 확인 (방화벽, 네트워크 설정)

---

## 문제 해결

### 컨테이너가 시작되지 않을 때

```bash
# 로그 확인
docker compose logs app

# 컨테이너 상태 확인
docker compose ps -a

# 컨테이너 재생성
docker compose down
docker compose up -d --build
```

### 환경변수 오류

```bash
# .env 파일 확인
cat .env

# 환경변수 로드 테스트
docker compose config
```

### 포트 충돌

```bash
# 포트 사용 확인
netstat -tuln | grep 4000
# 또는
ss -tuln | grep 4000
```

---

배포 완료 후 `http://nas-ip:4000/health`로 서버 상태를 확인하세요!

