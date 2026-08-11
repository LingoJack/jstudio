import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveBinding,
  toTauriAccelerator
} from "./keyboardShortcuts";
import { isEditorReservedBinding } from "./ShortcutManager";
test("resolveBinding respects defaults, overrides, and explicit unbinds", () => {
  assert.equal(resolveBinding("app.find", void 0), "mod+f");
  assert.equal(resolveBinding("app.find", { "app.find": "mod+g" }), "mod+g");
  assert.equal(resolveBinding("app.find", { "app.find": "" }), "");
});
test("toTauriAccelerator converts supported bindings", () => {
  assert.equal(toTauriAccelerator("mod+f"), "CmdOrCtrl+F");
  assert.equal(toTauriAccelerator("mod+shift+f"), "CmdOrCtrl+Shift+F");
  assert.equal(
    toTauriAccelerator("mod+alt+arrowleft"),
    "CmdOrCtrl+Alt+ArrowLeft"
  );
  assert.equal(toTauriAccelerator(""), null);
});
test("editor reserved bindings follow current overrides", () => {
  const overrides = {
    "editor.insertBlockBelow": "mod+k"
  };
  assert.equal(isEditorReservedBinding("mod+k", overrides), true);
  assert.equal(isEditorReservedBinding("mod+enter", overrides), false);
  assert.equal(isEditorReservedBinding("mod+shift+enter", overrides), true);
  assert.equal(isEditorReservedBinding("mod+b", overrides), true);
  assert.equal(
    isEditorReservedBinding("mod+k", { "editor.insertBlockBelow": "" }),
    false
  );
});
