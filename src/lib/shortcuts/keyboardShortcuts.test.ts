import assert from 'node:assert/strict';
import test from 'node:test';

import {
  conflictingDefs,
  detectConflicts,
  resolveBinding,
  SHORTCUTS,
  toTauriAccelerator,
  type ShortcutOverrides,
} from './keyboardShortcuts';
import { isEditorReservedBinding } from './ShortcutManager';

const defById = (id: string) => {
  const def = SHORTCUTS.find((s) => s.id === id);
  assert.ok(def, `missing shortcut def: ${id}`);
  return def;
};

test('resolveBinding respects defaults, overrides, and explicit unbinds', () => {
  assert.equal(resolveBinding('app.find', undefined), 'mod+f');
  assert.equal(resolveBinding('app.find', { 'app.find': 'mod+g' }), 'mod+g');
  assert.equal(resolveBinding('app.find', { 'app.find': '' }), '');
});

test('toTauriAccelerator converts supported bindings', () => {
  assert.equal(toTauriAccelerator('mod+f'), 'CmdOrCtrl+F');
  assert.equal(toTauriAccelerator('mod+shift+f'), 'CmdOrCtrl+Shift+F');
  assert.equal(
    toTauriAccelerator('mod+alt+arrowleft'),
    'CmdOrCtrl+Alt+ArrowLeft',
  );
  assert.equal(toTauriAccelerator(''), null);
});

test('editor reserved bindings follow current overrides', () => {
  const overrides: ShortcutOverrides = {
    'editor.insertBlockBelow': 'mod+k',
  };

  assert.equal(isEditorReservedBinding('mod+k', overrides), true);
  assert.equal(isEditorReservedBinding('mod+enter', overrides), false);
  assert.equal(isEditorReservedBinding('mod+shift+enter', overrides), true);
  assert.equal(isEditorReservedBinding('mod+b', overrides), true);
  assert.equal(
    isEditorReservedBinding('mod+k', { 'editor.insertBlockBelow': '' }),
    false,
  );
});

test('detectConflicts finds nothing for the default bindings', () => {
  assert.equal(detectConflicts(undefined).size, 0);
});

test('conflictingDefs is symmetric and scoped', () => {
  // Steal app.find's binding (mod+f) for app.newDocument — same scope.
  const overrides: ShortcutOverrides = { 'app.newDocument': 'mod+f' };
  const conflicts = detectConflicts(overrides);

  const newDocument = defById('app.newDocument');
  const find = defById('app.find');

  // Both sides must see each other: the UI highlights both rows.
  assert.deepEqual(
    conflictingDefs(newDocument, 'mod+f', conflicts).map((d) => d.id),
    ['app.find'],
  );
  assert.deepEqual(
    conflictingDefs(find, 'mod+f', conflicts).map((d) => d.id),
    ['app.newDocument'],
  );

  // A shortcut never conflicts with itself.
  assert.equal(conflicts.get('mod+f')?.length, 2);
});

test('conflictingDefs ignores unbound and cross-scope bindings', () => {
  // terminal.newTab shares mod+f with the global pair but lives in
  // another scope, so it must not be reported as conflicting.
  const overrides: ShortcutOverrides = {
    'app.newDocument': 'mod+f',
    'terminal.newTab': 'mod+f',
  };
  const conflicts = detectConflicts(overrides);

  const terminalNewTab = defById('terminal.newTab');
  assert.deepEqual(conflictingDefs(terminalNewTab, 'mod+f', conflicts), []);

  // Unbinding short-circuits: no binding means no conflict.
  assert.deepEqual(conflictingDefs(defById('app.find'), '', conflicts), []);
});
