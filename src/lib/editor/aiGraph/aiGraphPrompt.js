import { AI_GRAPH_SCHEMA, AI_GRAPH_EXAMPLE, AI_GRAPH_EXAMPLE_SEQUENCE } from "./aiGraphSchema";
function schemaAndExampleBlock() {
  return [
    "## Output Schema (JSON)",
    "```json",
    JSON.stringify(AI_GRAPH_SCHEMA, null, 2),
    "```",
    "",
    "## Diagram Type Guide",
    "Choose the most appropriate diagram type based on the user description:",
    "",
    "### Flowchart (default)",
    "- Use for: processes, algorithms, decision flows, workflows.",
    "- Shapes: rounded=start/end, rectangle=process step, diamond=decision, text=plain annotation.",
    '- Edges: orthogonal routing. Label decision branches (e.g. "yes"/"no").',
    "",
    "### Sequence Diagram",
    "- Use for: interactions between participants over time, API call flows, request/response cycles, protocol exchanges.",
    "- Participants: one `lifeline` node per participant (User, Service, Database, etc.). Set w=100, h=300. Set x/y to 0 (auto-layouted horizontally).",
    '- Messages: edges with `routing: "straight"`. Use `style.dashed: true` for return/response messages.',
    '- **Activations (REQUIRED for realism)**: for each participant that RECEIVES a request and does processing before responding, add an `activation` node (w=16, h=40, empty label). Connect the receiving lifeline to its activation with an edge (source=lifeline, target=activation, no label, straight routing). This renders as a small vertical rectangle on the lifeline showing the "busy processing" period.',
    "- Self-messages: edge where source===target (a participant calling itself).",
    '- Label each message with the action (e.g. "POST /login", "query DB").',
    "",
    "### Use Case Diagram",
    "- Use for: system requirements, actor-system interactions, feature scoping.",
    "- Shapes: actor=human/external system role, ellipse=use case.",
    "- Connect actors to their use cases with straight edges.",
    "- Group related use cases spatially.",
    "",
    "## Example: Flowchart",
    "A simple flowchart with a decision branch:",
    "```json",
    JSON.stringify(AI_GRAPH_EXAMPLE, null, 2),
    "```",
    "",
    "## Example: Sequence Diagram",
    "A user login flow with 3 participants and 4 messages (2 returns):",
    "```json",
    JSON.stringify(AI_GRAPH_EXAMPLE_SEQUENCE, null, 2),
    "```"
  ].join("\n");
}
const OUTPUT_RULES = [
  "Output ONLY a single JSON object matching the schema above.",
  "Do NOT wrap it in markdown fences (```).",
  "Do NOT include any explanation before or after the JSON.",
  "Every edge.source and edge.target MUST reference an existing node id.",
  "If unsure about coordinates, set x/y to 0 - the importer will auto-layout.",
  "Choose the diagram type that best fits the user description. When the user explicitly asks for a sequence/timing diagram, use lifeline nodes. When they describe a process or flow, use a flowchart.",
  "Use concise but meaningful labels.",
  "For sequence diagrams: use straight routing for all edges, dashed style for return/response messages."
].join("\n");
function buildSystemPrompt() {
  return [
    "You are a diagram generator for JStudio. Given a user's natural language description,",
    "generate a jgraph diagram JSON object.",
    "",
    schemaAndExampleBlock(),
    "",
    "## Rules",
    OUTPUT_RULES
  ].join("\n");
}
function buildExamplePromptForClipboard() {
  return [
    "You are a diagram generator for JStudio. Given a description, generate a jgraph diagram JSON object.",
    "",
    schemaAndExampleBlock(),
    "",
    "## Rules",
    OUTPUT_RULES,
    "",
    "## User Request",
    "{PROMPT}",
    "",
    "Generate the jgraph JSON now:"
  ].join("\n");
}
export {
  buildExamplePromptForClipboard,
  buildSystemPrompt
};
