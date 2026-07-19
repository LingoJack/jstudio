import assert from 'node:assert/strict';
import test from 'node:test';

import type { StoreState } from '../../store/storeHelpers';
import { executeShortcutAction } from './commandRegistry';

test('executeShortcutAction dispatches app.find through the registry', () => {
  let open = false;
  const store = {
    setFindBarOpen: (next: boolean) => {
      open = next;
    },
  } as StoreState;

  assert.equal(executeShortcutAction('app.find', store), true);
  assert.equal(open, true);
});

test('executeShortcutAction rejects unknown commands', () => {
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal(executeShortcutAction('unknown.command', {} as StoreState), false);
  } finally {
    console.warn = warn;
  }
});
