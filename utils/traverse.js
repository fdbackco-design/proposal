/**
 * Figma JSON 트리를 DFS(깊이 우선 탐색)로 순회하는 유틸리티
 * 
 * Figma 파일 구조는 중첩된 노드 트리로 구성되어 있으며,
 * 각 노드는 children 배열을 가질 수 있다.
 * 이 함수는 모든 노드를 재귀적으로 탐색한다.
 */

/**
 * DFS로 노드 트리를 순회하며 각 노드에 대해 callback을 실행
 * 
 * @param {Object} node - Figma 노드 객체 (document, page, frame, text 등)
 * @param {Function} callback - 각 노드에 대해 실행할 함수 (node) => void
 * 
 * @example
 * walkNodes(fileJson.document, (node) => {
 *   if (node.type === 'FRAME') {
 *     console.log('Found frame:', node.name);
 *   }
 * });
 */
export function walkNodes(node, callback) {
  if (!node) return;

  // 현재 노드에 대해 callback 실행
  callback(node);

  // children이 있으면 재귀적으로 모두 순회
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      walkNodes(child, callback);
    }
  }
}

