import { useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "../../lib/core/ipc";
import { useStore } from "../../store/useStore";
function usePtySessions() {
  const removeSessionState = useStore((s) => s.removeSessionState);
  const sessionsRef = useRef(/* @__PURE__ */ new Map());
  const unlistenRef = useRef(/* @__PURE__ */ new Map());
  const registerSession = useCallback(
    (sessionId, term) => {
      if (sessionsRef.current.has(sessionId)) return;
      sessionsRef.current.set(sessionId, {
        sessionId,
        onData: (data) => term.write(data),
        onExit: () => removeSessionState(sessionId)
      });
      const unlistenData = listen(
        `pty-data-${sessionId}`,
        (e) => {
          const session = sessionsRef.current.get(sessionId);
          if (session) session.onData(e.payload.data);
        }
      );
      const unlistenExit = listen(`pty-exit-${sessionId}`, () => {
        const session = sessionsRef.current.get(sessionId);
        if (session) session.onExit();
        const unlistens = unlistenRef.current.get(sessionId);
        if (unlistens) {
          unlistens.forEach((u) => u.then((fn) => fn()).catch(() => {
          }));
          unlistenRef.current.delete(sessionId);
        }
        sessionsRef.current.delete(sessionId);
      });
      unlistenRef.current.set(sessionId, [unlistenData, unlistenExit]);
    },
    [removeSessionState]
  );
  const unregisterSession = useCallback((sessionId) => {
    sessionsRef.current.delete(sessionId);
    const unlistens = unlistenRef.current.get(sessionId);
    if (unlistens) {
      unlistens.forEach((u) => u.then((fn) => fn()).catch(() => {
      }));
      unlistenRef.current.delete(sessionId);
    }
    ipc.ptyKill(sessionId).catch(() => {
    });
  }, []);
  const killAllSessions = useCallback(() => {
    unlistenRef.current.forEach((unlistens) => {
      unlistens.forEach((u) => u.then((fn) => fn()).catch(() => {
      }));
    });
    unlistenRef.current.clear();
    sessionsRef.current.clear();
    ipc.ptyKillAll().catch(() => {
    });
  }, []);
  const writeToPty = useCallback((sessionId, data) => {
    ipc.ptyWrite(sessionId, data).catch(console.error);
  }, []);
  const resizePty = useCallback(
    (sessionId, cols, rows) => {
      ipc.ptyResize(sessionId, cols, rows).catch(console.error);
    },
    []
  );
  const hasSession = useCallback((sessionId) => {
    return sessionsRef.current.has(sessionId);
  }, []);
  return {
    registerSession,
    unregisterSession,
    killAllSessions,
    writeToPty,
    resizePty,
    hasSession
  };
}
export {
  usePtySessions
};
