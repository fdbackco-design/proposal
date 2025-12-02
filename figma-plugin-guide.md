# Figma Plugin을 통한 텍스트 변경 가이드

## 현재 상황

Figma REST API v1은 **텍스트 노드 수정을 지원하지 않습니다**. 
따라서 실제로 Figma 파일의 텍스트를 변경하려면 **Figma Plugin API**를 사용해야 합니다.

## 해결 방법

### 방법 1: Figma Plugin 개발 (권장)

Figma Plugin을 개발하여 텍스트를 변경하는 방법입니다.

#### 1. Plugin 프로젝트 생성

```bash
# Figma Plugin 템플릿 생성
npx create-figma-plugin my-figma-plugin
```

#### 2. Plugin 코드 예시

`src/code.ts` 파일에 다음 코드를 추가:

```typescript
// 플러그인이 메시지를 받으면 텍스트를 업데이트
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'updateText') {
    const node = figma.getNodeById(msg.nodeId);
    
    if (node && node.type === 'TEXT') {
      await figma.loadFontAsync(node.fontName as FontName);
      node.characters = msg.newText;
      
      figma.ui.postMessage({ 
        success: true, 
        nodeId: msg.nodeId 
      });
    }
  }
  
  if (msg.type === 'applyPatches') {
    const results = [];
    
    for (const patch of msg.patches) {
      try {
        const node = figma.getNodeById(patch.nodeId);
        if (node && node.type === 'TEXT') {
          await figma.loadFontAsync(node.fontName as FontName);
          node.characters = patch.newText;
          results.push({ success: true, nodeId: patch.nodeId });
        } else {
          results.push({ success: false, nodeId: patch.nodeId, error: 'Node not found or not TEXT' });
        }
      } catch (error) {
        results.push({ success: false, nodeId: patch.nodeId, error: error.message });
      }
    }
    
    figma.ui.postMessage({ results });
  }
};
```

#### 3. Plugin과 CLI 통신

CLI에서 Plugin과 통신하려면:

1. **방법 A: Plugin을 열어두고 메시지 전송**
   - Plugin이 실행 중이어야 함
   - `figma.ui.postMessage()` 사용

2. **방법 B: Webhook 서버 구축** (더 실용적)
   - Plugin이 HTTP 요청을 받을 수 있는 서버 구축
   - CLI에서 서버로 패치 전송
   - 서버가 Plugin에 메시지 전달

### 방법 2: Webhook 서버 구축

#### 서버 구조 예시

```
figma-plugin-server/
 ├─ server.js          # Express 서버
 ├─ plugin/
 │   └─ code.ts        # Figma Plugin 코드
 └─ package.json
```

#### server.js 예시

```javascript
const express = require('express');
const app = express();

app.use(express.json());

// CLI에서 패치를 받아서 Plugin에 전달
app.post('/apply-patches', async (req, res) => {
  const { patches, fileKey } = req.body;
  
  // Plugin에 메시지 전송 (실제 구현은 Plugin API 사용)
  // 이 부분은 Plugin이 실행 중일 때만 작동
  try {
    // Plugin과 통신하는 로직
    const results = await sendToPlugin(patches);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Figma Plugin 서버 실행 중...');
});
```

#### CLI 수정

`figma.js`의 `applyPatches` 함수를 수정하여 webhook 서버로 전송:

```javascript
// 환경변수에 추가: FIGMA_PLUGIN_WEBHOOK_URL=http://localhost:3000/apply-patches

if (config.figmaPluginWebhookUrl) {
  const response = await axios.post(
    config.figmaPluginWebhookUrl,
    {
      patches,
      fileKey: config.figmaFileKey,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}
```

## 현재 구현 상태

현재 `figma.js`의 `applyPatches` 함수는:

1. ✅ **REST API 호출 시도**: PATCH/PUT 요청을 시도하지만 실패할 가능성이 높음
2. ⚠️ **에러 처리**: 실패 시 명확한 에러 메시지 출력
3. 📝 **결과 요약**: 성공/실패 개수와 상세 정보 제공

## 권장 워크플로우

1. **개발 단계**: `FIGMA_WRITE_ENABLED=false`로 설정하여 패치 계획만 확인
2. **테스트 단계**: `FIGMA_WRITE_ENABLED=true`로 설정하여 API 호출 시도 (실패 예상)
3. **운영 단계**: Figma Plugin + Webhook 서버 구축 후 실제 텍스트 변경

## 참고 자료

- [Figma Plugin API 문서](https://www.figma.com/plugin-docs/)
- [Figma Plugin 개발 가이드](https://www.figma.com/plugin-docs/plugin-quickstart-guide/)
- [Figma REST API 문서](https://www.figma.com/developers/api)


