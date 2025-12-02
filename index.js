/**
 * Figma-Sheets 동기화 CLI 엔트리 포인트
 * 
 * 전체 플로우:
 * 1. Google Sheets에서 제품 데이터 읽기
 * 2. Figma 파일에서 프레임 추출
 * 3. 프레임 이름과 시트 product_name 매칭
 * 4. 텍스트 노드 업데이트 패치 생성
 * 5. 패치 출력 (또는 적용)
 */
import { getSheetMap } from './sheets.js';
import { fetchFigmaFile, getFrames, buildNodePatches } from './figma.js';

async function main() {
  try {
    console.log('=== Figma-Sheets 동기화 시작 ===\n');

    console.log('1) 시트 데이터 읽는 중...');
    const sheetMap = await getSheetMap();
    console.log(`✓ 시트에서 ${Object.keys(sheetMap).length}개의 제품을 로드했습니다.\n`);

    console.log('2) Figma 파일 가져오는 중...');
    const fileJson = await fetchFigmaFile();
    console.log(`✓ Figma 파일을 성공적으로 가져왔습니다. (파일명: ${fileJson.name || 'N/A'})\n`);

    console.log('3) 프레임 추출 중...');
    const frames = getFrames(fileJson);
    console.log(`✓ Figma 파일에서 ${frames.length}개의 프레임을 찾았습니다.\n`);

    console.log('4) 패치 생성 중...');
    const patches = buildNodePatches(frames, sheetMap);
    console.log(`✓ ${patches.length}개의 텍스트 패치를 생성했습니다.\n`);

    console.log('5) 패치 계획 출력...');
    console.log('\n=== 생성된 패치 계획 ===');
    console.log(JSON.stringify(patches, null, 2));
    console.log('========================\n');
    console.log(`총 ${patches.length}개의 패치가 생성되었습니다.`);
    console.log('\n💡 실제 텍스트 변경을 적용하려면:');
    console.log('   1. HTTP API 서버 실행: npm run server');
    console.log('   2. Figma Plugin을 실행하여 패치를 적용하세요.');
    console.log('   (자세한 내용은 plugin/README.md 참고)');

    console.log('\n=== 완료 ===');
  } catch (err) {
    console.error('\n❌ 동기화 중 오류 발생:', err.message);
    if (err.stack) {
      console.error('스택 트레이스:', err.stack);
    }
    process.exit(1);
  }
}

main();

