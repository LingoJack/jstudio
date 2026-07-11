/**
 * Agent slice — manages agent session state in Zustand.
 * Follows the same pattern as terminalSlice.ts.
 *
 * 2024-07 Rewrite improvements:
 * - Tool results are visible (agent:tool-result event)
 * - Safe tools auto-execute, dangerous tools require confirmation
 * - Plan mode has dedicated review UI
 * - Auto-approve switch for bypassing all confirmations
 * - Compact event handling fixed
 */

import type {
  AgentSession,
  AgentSessionMeta,
  AgentPlanRequest,
  AgentAskRequest,
  AskQuestion,
  ChatMessage,
  ToolCallItem,
  ToolExecResult,
  ToolResultStatus,
} from '../types/agent';
import { storage } from '../lib/core/storage';
import type { StoreState } from './storeHelpers';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';

/**
 * Create the agent slice.
 */
export function createAgentSlice(
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): Partial<StoreState> {
  return {
    // — agent state —
    agentSessions: [],
    activeAgentSessionId: null,

    // — agent ops —
    initAgentSessions: async () => {
      try {
        const metas = await storage.agentListSessions();
        const sessions: AgentSession[] = metas.map((m) => ({
          id: m.id,
          title: m.title ?? '',
          runState: 'idle',
          messages: [],
          streamingContent: '',
          streamingReasoningContent: '',
          pendingToolCalls: [],
          pendingPlan: undefined,
          workspace: m.workspace,
          autoApprove: m.autoApprove ?? false,
          createdAt: m.updatedAt,
          updatedAt: m.updatedAt,
        }));
        set({ agentSessions: sessions });
      } catch (e) {
        console.error('Failed to init agent sessions:', e);
      }
    },

    createAgentSession: async (title?: string, workspace?: string) => {
      try {
        const id = await storage.agentCreateSession(title, workspace);
        const session: AgentSession = {
          id,
          title: title ?? '',
          runState: 'idle',
          messages: [],
          streamingContent: '',
          streamingReasoningContent: '',
          pendingToolCalls: [],
          pendingPlan: undefined,
          workspace,
          autoApprove: false,
          createdAt: Date.now() / 1000,
          updatedAt: Date.now() / 1000,
        };
        set((s) => ({
          agentSessions: [session, ...s.agentSessions],
          activeAgentSessionId: id,
          activeTabId: null, // will be set by workspace slice if needed
        }));
        return id;
      } catch (e) {
        console.error('Failed to create agent session:', e);
        throw e;
      }
    },

    openAgentSession: async (sessionId: string) => {
      try {
        // Check if already loaded
        const existing = get().agentSessions.find((s) => s.id === sessionId);
        if (existing && existing.messages.length > 0) {
          set({ activeAgentSessionId: sessionId });
          return;
        }

        // Load messages from backend
        const messages = await storage.agentLoadSession(sessionId);
        set((s) => ({
          agentSessions: s.agentSessions.map((session) =>
            session.id === sessionId
              ? { ...session, messages, updatedAt: Date.now() / 1000 }
              : session,
          ),
          activeAgentSessionId: sessionId,
        }));
      } catch (e) {
        console.error('Failed to open agent session:', e);
      }
    },

    deleteAgentSession: async (sessionId: string) => {
      try {
        await storage.agentDeleteSession(sessionId);
        set((s) => ({
          agentSessions: s.agentSessions.filter((session) => session.id !== sessionId),
          activeAgentSessionId:
            s.activeAgentSessionId === sessionId ? null : s.activeAgentSessionId,
        }));
      } catch (e) {
        console.error('Failed to delete agent session:', e);
      }
    },

    sendAgentMessage: async (sessionId: string, text: string, images?: { base64: string; mediaType: string }[]) => {
      try {
        // Add user message locally (always, regardless of runState)
        // Backend handles queuing - if agent is running, message will be processed in next round
        const userMsg: ChatMessage = {
          role: 'user',
          content: text,
          images,
        };

        set((s) => ({
          agentSessions: s.agentSessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: [...session.messages, userMsg],
                  // Don't reset streamingContent if already streaming - user may be adding context mid-stream
                }
              : session,
          ),
        }));

        // Ensure event listeners are set up (idempotent - will only set up once)
        await ensureAgentEventListeners(sessionId, set, get);

        // Send to backend - backend handles queuing if agent is busy
        await storage.agentSendMessage({
          sessionId,
          text,
          images,
        });
      } catch (e) {
        console.error('Failed to send agent message:', e);
        set((s) => ({
          agentSessions: s.agentSessions.map((session) =>
            session.id === sessionId
              ? { ...session, runState: 'error' as const }
              : session,
          ),
        }));
      }
    },

    submitAgentToolResult: async (
      sessionId: string,
      toolCallId: string,
      result: string,
      isError: boolean,
      images?: { base64: string; mediaType: string }[],
      planDecision?: 'approve' | 'reject' | 'approveAndClearContext',
    ) => {
      try {
        // Clear pending tool calls locally
        set((s) => ({
          agentSessions: s.agentSessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  pendingToolCalls: [],
                  pendingPlan: undefined,
                  runState: 'thinking' as const,
                }
              : session,
          ),
        }));

        // Send to backend (backend will emit tool-result event)
        await storage.agentToolResult({
          sessionId,
          toolCallId,
          result,
          isError,
          images,
          planDecision,
        });
      } catch (e) {
        console.error('Failed to submit tool result:', e);
      }
    },

    submitAgentPlanDecision: async (
      sessionId: string,
      decision: 'approve' | 'reject' | 'approveAndClearContext',
    ) => {
      try {
        const session = get().agentSessions.find((s) => s.id === sessionId);
        const pendingPlan = session?.pendingPlan;
        if (!pendingPlan) {
          console.error('No pending plan to submit decision for');
          return;
        }

        // Send to backend via tool_result with planDecision
        await storage.agentToolResult({
          sessionId,
          toolCallId: 'plan-request', // Special ID for plan
          result: decision,
          isError: false,
          planDecision: decision,
        });

        // Clear pending plan locally
        set((s) => ({
          agentSessions: s.agentSessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  pendingPlan: undefined,
                  runState: 'thinking' as const,
                }
              : session,
          ),
        }));
      } catch (e) {
        console.error('Failed to submit plan decision:', e);
      }
    },

    setAgentAutoApprove: async (sessionId: string, enabled: boolean) => {
      try {
        await storage.agentSetAutoApprove(sessionId, enabled);
        set((s) => ({
          agentSessions: s.agentSessions.map((session) =>
            session.id === sessionId
              ? { ...session, autoApprove: enabled }
              : session,
          ),
        }));
      } catch (e) {
        console.error('Failed to set auto-approve:', e);
      }
    },

    submitAgentAskAnswer: async (sessionId: string, answer: Record<string, string>) => {
      try {
        // Clear pending ask locally
        set((s) => ({
          agentSessions: s.agentSessions.map((session) =>
            session.id === sessionId
              ? { ...session, pendingAsk: undefined, runState: 'thinking' as const }
              : session,
          ),
        }));

        // Send answer to backend
        await storage.agentSubmitAskAnswer(sessionId, JSON.stringify(answer));
      } catch (e) {
        console.error('Failed to submit ask answer:', e);
      }
    },

    cancelAgent: async (sessionId: string) => {
      try {
        await storage.agentCancel(sessionId);
        set((s) => ({
          agentSessions: s.agentSessions.map((session) =>
            session.id === sessionId
              ? { ...session, runState: 'cancelled' as const, streamingContent: '', streamingReasoningContent: '' }
              : session,
          ),
        }));
      } catch (e) {
        console.error('Failed to cancel agent:', e);
      }
    },

    cleanupAgentListeners: () => {
      const unsubscribes = get().agentUnsubscribes;
      unsubscribes.forEach((unsub) => unsub());
      set({ agentUnsubscribes: [] });
      // Also clear module-level cache
      _currentUnsubs.forEach((unsub) => unsub());
      _currentUnsubs = [];
      _currentSessionId = null;
    },
  };
}

// ——————————————————————————————————————————————
// Persistent event listeners (aligned with remote pattern)
// ——————————————————————————————————————————————

let _currentSessionId: string | null = null;
let _currentUnsubs: UnlistenFn[] = [];

/**
 * Ensure event listeners are set up for the session.
 * This is idempotent - if already set up for this session, does nothing.
 * If switching sessions, cleans up old listeners first.
 */
async function ensureAgentEventListeners(
  sessionId: string,
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): Promise<void> {
  // Already set up for this session
  if (_currentSessionId === sessionId && _currentUnsubs.length > 0) {
    return;
  }

  // Clean up old listeners if switching sessions
  if (_currentSessionId !== sessionId) {
    _currentUnsubs.forEach((unsub) => unsub());
    _currentUnsubs = [];
    _currentSessionId = sessionId;
  }

  // Set up new listeners
  const unsubs = await setupAgentEventListeners(sessionId, set, get);
  _currentUnsubs = unsubs;
  
  // Also store in state for cleanup on app close
  set({ agentUnsubscribes: unsubs });
}

// ——————————————————————————————————————————————
// Event listeners
// ——————————————————————————————————————————————

/**
 * Set up Tauri event listeners for a given agent session.
 * Returns unsubscribe functions for cleanup.
 */
async function setupAgentEventListeners(
  sessionId: string,
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): Promise<UnlistenFn[]> {
  const unsubs: UnlistenFn[] = [];

  const updateSession = (
    updater: (session: AgentSession) => Partial<AgentSession>,
  ) => {
    set((s) => ({
      agentSessions: s.agentSessions.map((session) =>
        session.id === sessionId ? { ...session, ...updater(session) } : session,
      ),
    }));
  };

  // agent:chunk — streaming text
  unsubs.push(
    await listen<{ sessionId: string; content: string }>('agent:chunk', (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        streamingContent: event.payload.content,
        runState: 'streaming',
      }));
    }),
  );

  // agent:reasoning — streaming reasoning (o1)
  unsubs.push(
    await listen<{ sessionId: string; content: string }>('agent:reasoning', (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        streamingReasoningContent: event.payload.content,
      }));
    }),
  );

  // agent:tool-request — LLM wants to call tools (only dangerous tools reach here)
  unsubs.push(
    await listen<{ sessionId: string; toolCalls: ToolCallItem[] }>('agent:tool-request', (event) => {
      if (event.payload.sessionId !== sessionId) return;

      // Flush streaming content as assistant message
      updateSession((session) => {
        const newMessages = [...session.messages];
        // Add streaming content as assistant message if any
        if (session.streamingContent.trim()) {
          newMessages.push({
            role: 'assistant',
            content: session.streamingContent,
            reasoningContent: session.streamingReasoningContent || undefined,
          });
        }
        return {
          messages: newMessages,
          streamingContent: '',
          streamingReasoningContent: '',
          pendingToolCalls: event.payload.toolCalls,
          runState: 'tool_call',
        };
      });
    }),
  );

  // agent:tool-result — tool execution result (NEW: shows real output)
  unsubs.push(
    await listen<ToolExecResult>('agent:tool-result', (event) => {
      if (event.payload.sessionId !== sessionId) return;

      const { toolCallId, toolName, content, isError, status } = event.payload;

      // Add tool result message to chat
      updateSession((session) => {
        const toolMsg: ChatMessage = {
          role: 'tool',
          content,
          toolCallId,
          toolResult: {
            status: status as ToolResultStatus,
            isError,
          },
          images: event.payload.images,
        };
        return {
          messages: [...session.messages, toolMsg],
          // Remove from pending if it was there
          pendingToolCalls: session.pendingToolCalls.filter((tc) => tc.id !== toolCallId),
        };
      });
    }),
  );

  // agent:plan-request — plan review (NEW)
  unsubs.push(
    await listen<AgentPlanRequest>('agent:plan-request', (event) => {
      if (event.payload.sessionId !== sessionId) return;

      updateSession(() => ({
        pendingPlan: event.payload,
        runState: 'plan_review',
      }));
    }),
  );

  // agent:done — agent finished
  unsubs.push(
    await listen<{ sessionId: string }>('agent:done', (event) => {
      if (event.payload.sessionId !== sessionId) return;

      updateSession((session) => {
        const newMessages = [...session.messages];
        // Flush any remaining streaming content
        if (session.streamingContent.trim()) {
          newMessages.push({
            role: 'assistant',
            content: session.streamingContent,
            reasoningContent: session.streamingReasoningContent || undefined,
          });
        }
        return {
          messages: newMessages,
          streamingContent: '',
          streamingReasoningContent: '',
          pendingToolCalls: [],
          pendingPlan: undefined,
          runState: 'idle', // Reset to idle so next message can be sent
          updatedAt: Date.now() / 1000,
        };
      });
      // Don't cleanup listeners - keep them for next message (like remote)
    }),
  );

  // agent:error
  unsubs.push(
    await listen<{ sessionId: string; error: string }>('agent:error', (event) => {
      if (event.payload.sessionId !== sessionId) return;

      updateSession((session) => {
        const newMessages = [...session.messages];
        if (session.streamingContent.trim()) {
          newMessages.push({
            role: 'assistant',
            content: session.streamingContent,
            reasoningContent: session.streamingReasoningContent || undefined,
          });
        }
        // Add error message
        newMessages.push({
          role: 'system',
          content: `Error: ${event.payload.error}`,
        });
        return {
          messages: newMessages,
          streamingContent: '',
          streamingReasoningContent: '',
          pendingToolCalls: [],
          pendingPlan: undefined,
          runState: 'error',
          updatedAt: Date.now() / 1000,
        };
      });
      // Don't cleanup listeners - keep them for next message
    }),
  );

  // agent:cancelled
  unsubs.push(
    await listen<{ sessionId: string }>('agent:cancelled', (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        runState: 'cancelled',
        streamingContent: '',
        streamingReasoningContent: '',
      }));
      // Don't cleanup listeners - keep them for next message
    }),
  );

  // agent:retrying
  unsubs.push(
    await listen<{
      sessionId: string;
      attempt: number;
      maxAttempts: number;
      delayMs: number;
      error: string;
    }>('agent:retrying', (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        runState: 'retrying' as const,
        retryInfo: {
          attempt: event.payload.attempt,
          maxAttempts: event.payload.maxAttempts,
          delayMs: event.payload.delayMs,
          error: event.payload.error,
        },
      }));
    }),
  );

  // agent:compacting
  unsubs.push(
    await listen<{ sessionId: string }>('agent:compacting', (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({ runState: 'compacting' as const }));
    }),
  );

  // agent:compacted — context compression done (FIXED: was not listening)
  unsubs.push(
    await listen<{ sessionId: string; messagesBefore: number }>('agent:compacted', (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        runState: 'streaming', // Resume streaming after compacting
        // Optionally add a system message about compression
      }));
    }),
  );

  // agent:ask-request — Ask tool needs user input (NEW)
  unsubs.push(
    await listen<AgentAskRequest>('agent:ask-request', (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        pendingAsk: event.payload,
        runState: 'tool_call' as const, // Reuse tool_call state for Ask UI
      }));
    }),
  );

  return unsubs;
}

export type { AgentSession };
