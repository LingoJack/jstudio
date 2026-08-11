import { parseMermaidCode } from "./mermaidParser";
import { convertFlowchartToSnapshot } from "./flowchartConverter";
import { convertSequenceToSnapshot } from "./sequenceConverter";
import { serializeGraphSnapshot } from "../../../components/editor/nodes/graph/graphSnapshot";
async function convertMermaidToSnapshot(code) {
  const result = await parseMermaidCode(code);
  if (result.error) {
    return { success: false, error: result.error };
  }
  let snapshot;
  switch (result.type) {
    case "flowchart":
      snapshot = convertFlowchartToSnapshot(result.data);
      break;
    case "sequence":
      snapshot = convertSequenceToSnapshot(result.data);
      break;
    case "unsupported":
      return {
        success: false,
        error: "\u4E0D\u652F\u6301\u7684\u56FE\u8868\u7C7B\u578B\uFF0C\u4EC5\u652F\u6301\u6D41\u7A0B\u56FE\uFF08flowchart\uFF09\u548C\u65F6\u5E8F\u56FE\uFF08sequenceDiagram\uFF09"
      };
    default:
      return { success: false, error: "\u672A\u77E5\u7684\u56FE\u8868\u7C7B\u578B" };
  }
  const json = serializeGraphSnapshot(snapshot.nodes, snapshot.edges, snapshot.viewport);
  return { success: true, snapshot: json };
}
export {
  convertMermaidToSnapshot,
  parseMermaidCode
};
