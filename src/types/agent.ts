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
}

/**
 * A chat message in the agent session.
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: ToolCallItem[];
  toolCallId?: string;
  reasoningContent?: string;
  senderName?: string;
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
}

/**
 * Agent running state — mirrors StreamMsg variants.
 */
export type AgentRunState =
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'tool_call'
  | 'compacting'
  | 'retrying'
  | 'done'
  | 'error'
  | 'cancelled';

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
  /** Retry info (if state === 'retrying'). */
  retryInfo?: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: string;
  };
  /** Workspace path (used for grouping sessions). */
  workspace?: string;
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