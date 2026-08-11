import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
function useDialogTransition(open, exitDuration = 180) {
  const [state, setState] = useState(
    open ? "enter" : "closed"
  );
  const prevOpen = useRef(open);
  const exitTimer = useRef(void 0);
  useLayoutEffect(() => {
    if (open && !prevOpen.current) {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = void 0;
      }
      setState("enter");
    } else if (!open && prevOpen.current) {
      setState("exit");
      exitTimer.current = setTimeout(() => {
        setState("closed");
        exitTimer.current = void 0;
      }, exitDuration);
    }
    prevOpen.current = open;
  }, [open, exitDuration]);
  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    []
  );
  return state;
}
function useAnimatedExit(onClose, exitDuration = 180) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(void 0);
  const close = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    timerRef.current = setTimeout(() => {
      onClose();
    }, exitDuration);
  }, [exiting, onClose, exitDuration]);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );
  return { exiting, close };
}
export {
  useAnimatedExit,
  useDialogTransition
};
