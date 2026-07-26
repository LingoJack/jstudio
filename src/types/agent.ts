/**
 * Agent types — mirrors j-agent's Rust types for the JStudio GUI.
 */

/**
 * A tool call request from the agent (LLM wants to invoke a tool).
 */
export interface ToolCallItem {
  id: string;
  name: string;
  arguments: string;
  /** Whether this tool requires user confirmation (dangerous operations). */
  requiresConfirmation?: boolean;
  /** Whether this tool is considered dangerous (write/delete/shell). */
  isDangerous?: boolean;
}

/**
 * Tool execution status.
 */
export type ToolResultStatus = 'executed' | 'failed' | 'rejected' | 'auto_approved';

/**
 * Tool execution result for rendering.
 */
export interface ToolExecResult {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
  status: ToolResultStatus;
  images?: ImageData[];
}

/**
 * A chat message in the agent session.
 */
export interface ChatMessage {
  /** Unique message id (for React key and stable tracking). */
  id?: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: ToolCallItem[];
  toolCallId?: string;
  reasoningContent?: string;
  senderName?: string;
  /** Tool execution result (for tool role messages). */
  toolResult?: {
    status: ToolResultStatus;
    isError: boolean;
    toolName?: string;
  };
  /** Images attached to this message. */
  images?: ImageData[];
}

/**
 * Image data (base64 + MIME type).
 */
export interface ImageData {
  base64: string;
  mediaType: string;
}

/**
 * Agent session metadata — returned by `agent_list_sessions`.
 */
export interface AgentSessionMeta {
  id: string;
  title?: string;
  messageCount: number;
  updatedAt: number;
  workspace?: string;
  /** Auto-approve mode (bypass all tool confirmations). */
  autoApprove?: boolean;
}

/**
 * Agent running state — mirrors StreamMsg variants.
 */
export type AgentRunState =
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'tool_call'      // Waiting for dangerous tool confirmation
  | 'plan_review'    // NEW: Waiting for plan approval
  | 'compacting'
  | 'retrying'
  | 'error'
  | 'cancelled';
  // Removed 'done' (semantically unclear, use idle after done event)

/**
 * Plan request for user review.
 */
export interface AgentPlanRequest {
  sessionId: string;
  plan: string;
}

/**
 * Ask question option.
 */
export interface AskOption {
  label: string;
  description: string;
}

/**
 * Ask question for user input.
 */
export interface AskQuestion {
  question: string;
  header: string;
  options: AskOption[];
  multiSelect: boolean;
}

/**
 * Ask request from agent (Ask tool).
 */
export interface AgentAskRequest {
  sessionId: string;
  questions: AskQuestion[];
}

/**
 * Agent session state in the frontend store.
 */
export interface AgentSession {
  /** Session id (timestamp-based). */
  id: string;
  /** Display title (first user message or user-set). */
  title: string;
  /** Current running state. */
  runState: AgentRunState;
  /** All messages in this session. */
  messages: ChatMessage[];
  /** Streaming content buffer (assistant text being generated). */
  streamingContent: string;
  /** Streaming reasoning content buffer (o1-style reasoning). */
  streamingReasoningContent: string;
  /** Pending tool calls waiting for user confirmation. */
  pendingToolCalls: ToolCallItem[];
  /** Pending plan request waiting for user approval. */
  pendingPlan?: AgentPlanRequest;
  /** Pending Ask request waiting for user answer. */
  pendingAsk?: AgentAskRequest;
  /** Retry info (if state === 'retrying'). */
  retryInfo?: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: string;
  };
  /** Workspace path (optional, used for file operations). */
  workspace?: string;
  /** Auto-approve mode (bypass all tool confirmations). */
  autoApprove: boolean;
  /** Created at timestamp (epoch seconds). */
  createdAt: number;
  /** Last updated timestamp (epoch seconds). */
  updatedAt: number;
}

/**
 * Model provider configuration.
 */
export interface ModelProvider {
  /** Display name (e.g., "GPT-4o"). */
  name: string;
  /** OpenAI-compatible API base URL. */
  apiBase: string;
  /** API key (stored in plaintext). */
  apiKey: string;
  /** Model identifier. */
  model: string;
  /** Whether the model supports vision/images. */
  supportsVision?: boolean;
}

/**
 * Agent configuration file schema.
 * Matches `j-agent::storage::config::AgentConfig`.
 */
export interface AgentConfig {
  providers: ModelProvider[];
  activeIndex: number;
  toolsEnabled: boolean;
  maxToolRounds: number;
  disabledTools: string[];
  deferredTools: string[];
}