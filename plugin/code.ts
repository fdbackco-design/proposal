/**
 * Figma Sheets Sync Plugin - Main Code
 * 
 * 데이터 엔진에서 받은 패치를 Figma 문서에 적용합니다.
 */

// 플러그인 UI로부터 메시지 수신
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'apply-patches') {
    const patches: Array<{
      nodeId: string;
      frameName: string;
      layerName: string;
      newText: string;
    }> = msg.patches || [];

    if (patches.length === 0) {
      figma.ui.postMessage({
        type: 'log-error',
        text: '적용할 패치가 없습니다.',
      });
      return;
    }

    log(`총 ${patches.length}개의 패치를 처리합니다...`);

    let successCount = 0;
    let failedCount = 0;
    const failedPatches: Array<{ patch: any; error: string }> = [];

    // 각 패치를 순차적으로 처리
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      log(`[${i + 1}/${patches.length}] 처리 중: ${patch.frameName} > ${patch.layerName} -> "${patch.newText}"`);

      try {
        // 노드 ID로 노드 찾기
        const node = figma.getNodeById(patch.nodeId);

        if (!node) {
          throw new Error(`노드를 찾을 수 없습니다: ${patch.nodeId}`);
        }

        // TEXT 노드인지 확인
        if (node.type !== 'TEXT') {
          throw new Error(`노드가 TEXT 타입이 아닙니다: ${node.type}`);
        }

        const textNode = node as TextNode;

        // 폰트 로드 (필요한 경우)
        // TextNode는 fontName이 FontName | { family: string, style: string } 형태일 수 있음
        if (textNode.fontName !== figma.mixed) {
          try {
            await figma.loadFontAsync(textNode.fontName as FontName);
          } catch (fontError) {
            log(`경고: 폰트 로드 실패 (${textNode.fontName}), 기본 폰트로 계속 진행...`);
          }
        } else {
          // mixed fonts인 경우 - 각 텍스트 범위의 폰트를 로드해야 함
          // 간단한 구현: 첫 번째 문자 범위의 폰트만 로드
          const fills = textNode.getRangeFontName(0, 1);
          if (fills && fills !== figma.mixed) {
            try {
              await figma.loadFontAsync(fills as FontName);
            } catch (fontError) {
              log(`경고: 폰트 로드 실패, 기본 폰트로 계속 진행...`);
            }
          }
        }

        // 텍스트 업데이트
        textNode.characters = String(patch.newText ?? '');

        successCount++;
        log(`  ✓ 성공: ${patch.frameName} > ${patch.layerName}`, 'success');
      } catch (error) {
        failedCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        failedPatches.push({ patch, error: errorMessage });
        log(`  ✗ 실패: ${errorMessage}`, 'error');
      }
    }

    // 결과 요약
    log('');
    log(`=== 처리 완료 ===`, 'info');
    log(`성공: ${successCount}개`, 'success');
    if (failedCount > 0) {
      log(`실패: ${failedCount}개`, 'error');
      log('');
      log('실패한 패치:', 'error');
      failedPatches.forEach((fp, idx) => {
        log(`  ${idx + 1}. ${fp.patch.frameName} > ${fp.patch.layerName}: ${fp.error}`, 'error');
      });
    }

    // UI에 완료 메시지 전송
    figma.ui.postMessage({
      type: 'done',
      success: successCount,
      failed: failedCount,
    });

    if (successCount > 0) {
      figma.notify(`✓ ${successCount}개의 텍스트가 업데이트되었습니다.`);
    }
  }
};

/**
 * UI에 로그 메시지 전송
 */
function log(text: string, type: 'info' | 'success' | 'error' = 'info') {
  figma.ui.postMessage({
    type: type === 'info' ? 'log' : `log-${type}`,
    text,
  });
}

// 플러그인 UI 표시
figma.showUI(__html__, {
  width: 400,
  height: 500,
  title: 'Figma Sheets Sync',
});

log('플러그인이 준비되었습니다.');
log('데이터 엔진 URL을 입력하고 "패치 불러와서 적용" 버튼을 클릭하세요.');

