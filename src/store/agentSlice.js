import { ipc } from "../lib/core/ipc";
import { listen } from "@tauri-apps/api/event";
function createAgentSlice(set, get) {
  return {
    // — agent state —
    agentSessions: [],
    activeAgentSessionId: null,
    activeAgentWorkspace: null,
    // — agent ops —
    initAgentSessions: async () => {
      try {
        const metas = await ipc.agentListSessions();
        const sessions = metas.map((m) => ({
          id: m.id,
          title: m.title ?? "",
          runState: "idle",
          messages: [],
          streamingContent: "",
          streamingReasoningContent: "",
          pendingToolCalls: [],
          pendingPlan: void 0,
          workspace: m.workspace,
          autoApprove: m.autoApprove ?? false,
          createdAt: m.updatedAt,
          updatedAt: m.updatedAt
        }));
        set({ agentSessions: sessions });
        try {
          const settings = await ipc.loadSettings();
          if (settings.agentActiveWorkspace) {
            set({ activeAgentWorkspace: settings.agentActiveWorkspace });
          }
        } catch {
        }
      } catch (e) {
        console.error("Failed to init agent sessions:", e);
      }
    },
    setActiveAgentWorkspace: (workspace) => {
      set({ activeAgentWorkspace: workspace });
      ipc.saveSettings({ agentActiveWorkspace: workspace }).catch((e) => {
        console.error("Failed to save active workspace:", e);
      });
    },
    createAgentSession: async (workspace) => {
      try {
        const id = await ipc.agentCreateSession("", workspace);
        const session = {
          id,
          title: "",
          // 空 title，等待第一条消息填充
          runState: "idle",
          messages: [],
          streamingContent: "",
          streamingReasoningContent: "",
          pendingToolCalls: [],
          pendingPlan: void 0,
          workspace,
          // Required in GUI
          autoApprove: false,
          createdAt: Date.now() / 1e3,
          updatedAt: Date.now() / 1e3
        };
        set((s) => ({
          agentSessions: [session, ...s.agentSessions],
          activeAgentSessionId: id,
          activeTabId: null
          // will be set by workspace slice if needed
        }));
        return id;
      } catch (e) {
        console.error("Failed to create agent session:", e);
        throw e;
      }
    },
    openAgentSession: async (sessionId) => {
      try {
        const existing = get().agentSessions.find((s) => s.id === sessionId);
        if (existing && existing.messages.length > 0) {
          set({ activeAgentSessionId: sessionId });
          return;
        }
        const messages = await ipc.agentLoadSession(sessionId);
        set((s) => ({
          agentSessions: s.agentSessions.map(
            (session) => session.id === sessionId ? { ...session, messages, updatedAt: Date.now() / 1e3 } : session
          ),
          activeAgentSessionId: sessionId
        }));
      } catch (e) {
        console.error("Failed to open agent session:", e);
      }
    },
    deleteAgentSession: async (sessionId) => {
      try {
        await ipc.agentDeleteSession(sessionId);
        set((s) => ({
          agentSessions: s.agentSessions.filter((session) => session.id !== sessionId),
          activeAgentSessionId: s.activeAgentSessionId === sessionId ? null : s.activeAgentSessionId
        }));
      } catch (e) {
        console.error("Failed to delete agent session:", e);
      }
    },
    sendAgentMessage: async (sessionId, text, images) => {
      try {
        const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const userMsg = {
          id: msgId,
          role: "user",
          content: text,
          images
        };
        set((s) => {
          const session = s.agentSessions.find((s2) => s2.id === sessionId);
          const isFirstMessage = session && session.messages.length === 0;
          const newTitle = isFirstMessage && !session.title ? text.slice(0, 50) + (text.length > 50 ? "..." : "") : session?.title;
          return {
            agentSessions: s.agentSessions.map(
              (session2) => session2.id === sessionId ? {
                ...session2,
                messages: [...session2.messages, userMsg],
                title: newTitle || session2.title
                // Don't reset streamingContent if already streaming - user may be adding context mid-stream
              } : session2
            )
          };
        });
        await ensureAgentEventListeners(sessionId, set, get);
        await ipc.agentSendMessage({
          sessionId,
          text,
          images
        });
      } catch (e) {
        console.error("Failed to send agent message:", e);
        set((s) => ({
          agentSessions: s.agentSessions.map(
            (session) => session.id === sessionId ? { ...session, runState: "error" } : session
          )
        }));
      }
    },
    submitAgentToolResult: async (sessionId, toolCallId, result, isError, images, planDecision) => {
      try {
        set((s) => ({
          agentSessions: s.agentSessions.map(
            (session) => session.id === sessionId ? {
              ...session,
              pendingToolCalls: [],
              pendingPlan: void 0,
              runState: "thinking"
            } : session
          )
        }));
        await ipc.agentToolResult({
          sessionId,
          toolCallId,
          result,
          isError,
          images,
          planDecision
        });
      } catch (e) {
        console.error("Failed to submit tool result:", e);
      }
    },
    submitAgentPlanDecision: async (sessionId, decision) => {
      try {
        const session = get().agentSessions.find((s) => s.id === sessionId);
        const pendingPlan = session?.pendingPlan;
        if (!pendingPlan) {
          console.error("No pending plan to submit decision for");
          return;
        }
        await ipc.agentToolResult({
          sessionId,
          toolCallId: "plan-request",
          // Special ID for plan
          result: decision,
          isError: false,
          planDecision: decision
        });
        set((s) => ({
          agentSessions: s.agentSessions.map(
            (session2) => session2.id === sessionId ? {
              ...session2,
              pendingPlan: void 0,
              runState: "thinking"
            } : session2
          )
        }));
      } catch (e) {
        console.error("Failed to submit plan decision:", e);
      }
    },
    setAgentAutoApprove: async (sessionId, enabled) => {
      try {
        await ipc.agentSetAutoApprove(sessionId, enabled);
        set((s) => ({
          agentSessions: s.agentSessions.map(
            (session) => session.id === sessionId ? { ...session, autoApprove: enabled } : session
          )
        }));
      } catch (e) {
        console.error("Failed to set auto-approve:", e);
      }
    },
    submitAgentAskAnswer: async (sessionId, answer) => {
      try {
        set((s) => ({
          agentSessions: s.agentSessions.map(
            (session) => session.id === sessionId ? { ...session, pendingAsk: void 0, runState: "thinking" } : session
          )
        }));
        await ipc.agentSubmitAskAnswer(sessionId, JSON.stringify(answer));
      } catch (e) {
        console.error("Failed to submit ask answer:", e);
      }
    },
    cancelAgent: async (sessionId) => {
      try {
        await ipc.agentCancel(sessionId);
        set((s) => ({
          agentSessions: s.agentSessions.map(
            (session) => session.id === sessionId ? { ...session, runState: "cancelled", streamingContent: "", streamingReasoningContent: "" } : session
          )
        }));
      } catch (e) {
        console.error("Failed to cancel agent:", e);
      }
    },
    cleanupAgentListeners: () => {
      const unsubscribes = get().agentUnsubscribes;
      unsubscribes.forEach((unsub) => unsub());
      set({ agentUnsubscribes: [] });
      _currentUnsubs.forEach((unsub) => unsub());
      _currentUnsubs = [];
      _currentSessionId = null;
    }
  };
}
let _currentSessionId = null;
let _currentUnsubs = [];
async function ensureAgentEventListeners(sessionId, set, get) {
  if (_currentSessionId === sessionId && _currentUnsubs.length > 0) {
    return;
  }
  if (_currentSessionId !== sessionId) {
    _currentUnsubs.forEach((unsub) => unsub());
    _currentUnsubs = [];
    _currentSessionId = sessionId;
  }
  const unsubs = await setupAgentEventListeners(sessionId, set, get);
  _currentUnsubs = unsubs;
  set({ agentUnsubscribes: unsubs });
}
async function setupAgentEventListeners(sessionId, set, get) {
  const unsubs = [];
  const updateSession = (updater) => {
    const currentState = get();
    const currentSession = currentState.agentSessions.find((s) => s.id === sessionId);
    if (!currentSession) return;
    const updates = updater(currentSession);
    set((s) => ({
      agentSessions: s.agentSessions.map(
        (session) => session.id === sessionId ? { ...session, ...updates } : session
      )
    }));
  };
  unsubs.push(
    await listen("agent:chunk", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        streamingContent: event.payload.content,
        runState: "streaming"
      }));
    })
  );
  unsubs.push(
    await listen("agent:reasoning", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        streamingReasoningContent: event.payload.content
      }));
    })
  );
  unsubs.push(
    await listen("agent:tool-request", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession((session) => {
        const newMessages = [...session.messages];
        if (session.streamingContent.trim()) {
          const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          newMessages.push({
            id: msgId,
            role: "assistant",
            content: session.streamingContent,
            reasoningContent: session.streamingReasoningContent || void 0
          });
        }
        return {
          messages: newMessages,
          streamingContent: "",
          streamingReasoningContent: "",
          pendingToolCalls: event.payload.toolCalls,
          runState: "tool_call"
        };
      });
    })
  );
  unsubs.push(
    await listen("agent:tool-result", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      const { toolCallId, toolName, content, isError, status } = event.payload;
      updateSession((session) => {
        const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const toolMsg = {
          id: msgId,
          role: "tool",
          content,
          toolCallId,
          toolResult: {
            status,
            isError,
            toolName
          },
          images: event.payload.images
        };
        return {
          messages: [...session.messages, toolMsg],
          // Remove from pending if it was there
          pendingToolCalls: session.pendingToolCalls.filter((tc) => tc.id !== toolCallId)
        };
      });
    })
  );
  unsubs.push(
    await listen("agent:plan-request", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        pendingPlan: event.payload,
        runState: "plan_review"
      }));
    })
  );
  unsubs.push(
    await listen("agent:done", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession((session) => {
        const newMessages = [...session.messages];
        if (session.streamingContent.trim()) {
          const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          newMessages.push({
            id: msgId,
            role: "assistant",
            content: session.streamingContent,
            reasoningContent: session.streamingReasoningContent || void 0
          });
        }
        return {
          messages: newMessages,
          streamingContent: "",
          streamingReasoningContent: "",
          pendingToolCalls: [],
          pendingPlan: void 0,
          runState: "idle",
          // Reset to idle so next message can be sent
          updatedAt: Date.now() / 1e3
        };
      });
    })
  );
  unsubs.push(
    await listen("agent:error", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession((session) => {
        const newMessages = [...session.messages];
        if (session.streamingContent.trim()) {
          newMessages.push({
            role: "assistant",
            content: session.streamingContent,
            reasoningContent: session.streamingReasoningContent || void 0
          });
        }
        newMessages.push({
          role: "system",
          content: `Error: ${event.payload.error}`
        });
        return {
          messages: newMessages,
          streamingContent: "",
          streamingReasoningContent: "",
          pendingToolCalls: [],
          pendingPlan: void 0,
          runState: "error",
          updatedAt: Date.now() / 1e3
        };
      });
    })
  );
  unsubs.push(
    await listen("agent:cancelled", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        runState: "cancelled",
        streamingContent: "",
        streamingReasoningContent: ""
      }));
    })
  );
  unsubs.push(
    await listen("agent:retrying", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        runState: "retrying",
        retryInfo: {
          attempt: event.payload.attempt,
          maxAttempts: event.payload.maxAttempts,
          delayMs: event.payload.delayMs,
          error: event.payload.error
        }
      }));
    })
  );
  unsubs.push(
    await listen("agent:compacting", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({ runState: "compacting" }));
    })
  );
  unsubs.push(
    await listen("agent:compacted", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        runState: "streaming"
        // Resume streaming after compacting
        // Optionally add a system message about compression
      }));
    })
  );
  unsubs.push(
    await listen("agent:ask-request", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      updateSession(() => ({
        pendingAsk: event.payload,
        runState: "tool_call"
        // Reuse tool_call state for Ask UI
      }));
    })
  );
  return unsubs;
}
export {
  createAgentSlice
};
