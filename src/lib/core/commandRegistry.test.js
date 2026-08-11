import assert from "node:assert/strict";
import test from "node:test";
import { executeShortcutAction } from "./commandRegistry";
test("executeShortcutAction dispatches app.find through the registry", () => {
  let open = false;
  const store = {
    setFindBarOpen: (next) => {
      open = next;
    }
  };
  assert.equal(executeShortcutAction("app.find", store), true);
  assert.equal(open, true);
});
test("executeShortcutAction rejects unknown commands", () => {
  const warn = console.warn;
  console.warn = () => void 0;
  try {
    assert.equal(executeShortcutAction("unknown.command", {}), false);
  } finally {
    console.warn = warn;
  }
});
