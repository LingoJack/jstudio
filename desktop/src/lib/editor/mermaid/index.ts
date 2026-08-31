/**
 * mermaid 导出入口
 *
 * 提供 Mermaid 代码解析和转换的统一 API。
 */

import { parseMermaidCode, type MermaidDiagramType, type MermaidParseResult } from './mermaidParser';
import { convertFlowchartToSnapshot } from './flowchartConverter';
import { convertSequenceToSnapshot } from './sequenceConverter';
import { serializeGraphSnapshot, type GraphSnapshot } from '../../../components/editor/nodes/graph/graphSnapshot';

export { parseMermaidCode };
export type { MermaidDiagramType, MermaidParseResult };

/**
 * 将 Mermaid 代码转换为 GraphSnapshot JSON 字符串
 *
 * @param code Mermaid 代码
 * @returns 转换结果：成功返回 snapshot JSON，失败返回 error 信息
 */
export async function convertMermaidToSnapshot(
  code: string,
): Promise<{ success: boolean; snapshot?: string; error?: string }> {
  const result = await parseMermaidCode(code);

  if (result.error) {
    return { success: false, error: result.error };
  }

  let snapshot: GraphSnapshot;

  switch (result.type) {
    case 'flowchart':
      snapshot = convertFlowchartToSnapshot(result.data as Parameters<typeof convertFlowchartToSnapshot>[0]);
      break;
    case 'sequence':
      snapshot = convertSequenceToSnapshot(result.data as Parameters<typeof convertSequenceToSnapshot>[0]);
      break;
    case 'unsupported':
      return {
        success: false,
        error: '不支持的图表类型，仅支持流程图（flowchart）和时序图（sequenceDiagram）',
      };
    default:
      return { success: false, error: '未知的图表类型' };
  }

  const json = serializeGraphSnapshot(snapshot.nodes, snapshot.edges, snapshot.viewport);

  return { success: true, snapshot: json };
}