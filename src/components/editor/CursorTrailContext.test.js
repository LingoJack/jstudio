import assert from "node:assert/strict";
import test from "node:test";
import {
  CursorTrailRegistry
} from "./CursorTrailContext";
function createFakeTrail() {
  const nativeRegistered = [];
  const contentRegistered = [];
  let nativeDisposed = 0;
  let contentDisposed = 0;
  let dirtyCount = 0;
  const trail = {
    registerNativeCaretHost(host) {
      nativeRegistered.push(host);
      return () => {
        nativeDisposed++;
      };
    },
    registerContentCaretHost(host) {
      contentRegistered.push(host);
      return () => {
        contentDisposed++;
      };
    },
    markDirty() {
      dirtyCount++;
    }
  };
  return {
    trail,
    nativeRegistered,
    contentRegistered,
    get nativeDisposed() {
      return nativeDisposed;
    },
    get contentDisposed() {
      return contentDisposed;
    },
    get dirtyCount() {
      return dirtyCount;
    }
  };
}
const nativeHost = () => ({});
const contentHost = () => ({});
test("replays hosts registered before trail attachment", () => {
  const registry = new CursorTrailRegistry();
  const native = nativeHost();
  const content = contentHost();
  registry.registerNativeHost(native);
  registry.registerContentHost(content, () => null);
  const fake = createFakeTrail();
  registry.attachTrail(fake.trail);
  assert.deepEqual(fake.nativeRegistered, [native]);
  assert.deepEqual(fake.contentRegistered, [content]);
  assert.equal(fake.dirtyCount, 1);
});
test("releases old bindings and replays them when trail changes", () => {
  const registry = new CursorTrailRegistry();
  const native = nativeHost();
  registry.registerNativeHost(native);
  const first = createFakeTrail();
  const second = createFakeTrail();
  registry.attachTrail(first.trail);
  registry.attachTrail(second.trail);
  assert.equal(first.nativeDisposed, 1);
  assert.deepEqual(second.nativeRegistered, [native]);
  registry.attachTrail(null);
  assert.equal(second.nativeDisposed, 1);
});
test("reference-counts duplicate host registrations", () => {
  const registry = new CursorTrailRegistry();
  const fake = createFakeTrail();
  const native = nativeHost();
  registry.attachTrail(fake.trail);
  const unregisterA = registry.registerNativeHost(native);
  const unregisterB = registry.registerNativeHost(native);
  assert.equal(fake.nativeRegistered.length, 1);
  unregisterA();
  assert.equal(fake.nativeDisposed, 0);
  unregisterB();
  unregisterB();
  assert.equal(fake.nativeDisposed, 1);
});
test("dispose is idempotent and forgets registered hosts", () => {
  const registry = new CursorTrailRegistry();
  const fake = createFakeTrail();
  registry.registerNativeHost(nativeHost());
  registry.registerContentHost(contentHost(), () => null);
  registry.attachTrail(fake.trail);
  registry.dispose();
  registry.dispose();
  assert.equal(fake.nativeDisposed, 1);
  assert.equal(fake.contentDisposed, 1);
  const next = createFakeTrail();
  registry.attachTrail(next.trail);
  assert.equal(next.nativeRegistered.length, 0);
  assert.equal(next.contentRegistered.length, 0);
});
