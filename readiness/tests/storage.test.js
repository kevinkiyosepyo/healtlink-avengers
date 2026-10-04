import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkspace,
  saveWorkspace,
  STORAGE_KEY,
  DATA_LIMITS,
} from "../src/lib/storage.js";
import { createProject } from "../src/lib/sampleCases.js";

const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
afterEach(() => {
  if (originalStorage)
    Object.defineProperty(globalThis, "localStorage", originalStorage);
  else delete globalThis.localStorage;
});
function storage(value = null) {
  const values = new Map(value === null ? [] : [[STORAGE_KEY, value]]);
  const instance = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: instance,
    configurable: true,
  });
  return instance;
}
function workspace() {
  const project = createProject("rest");
  return {
    version: 1,
    projects: [project],
    activeProjectId: project.id,
    profile: {
      name: "Alex",
      role: "Coordinator",
      organization: "Research team",
    },
  };
}

test("workspace saves and restores full project data", () => {
  storage();
  const data = workspace();
  assert.deepEqual(saveWorkspace(data), { ok: true, error: null });
  assert.deepEqual(loadWorkspace(), data);
});

test("missing workspace is null; corrupted and unsupported data produce a visible error", () => {
  storage();
  assert.equal(loadWorkspace(), null);
  for (const raw of [
    "{broken",
    "{}",
    '{"version":99,"projects":[]}',
    JSON.stringify({ ...workspace(), activeProjectId: "missing" }),
  ]) {
    storage(raw);
    assert.throws(loadWorkspace, /could not be loaded/);
  }
});

test("profile defaults keep older/incomplete local profiles usable", () => {
  const data = { ...workspace(), profile: {} };
  storage(JSON.stringify(data));
  assert.deepEqual(loadWorkspace().profile, {
    name: "",
    role: "",
    organization: "",
  });
});

test("blocked and full browser storage return actionable save failures without throwing", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Site data blocked");
    },
  });
  assert.equal(saveWorkspace(workspace()).ok, false);
  assert.throws(loadWorkspace, /Site data blocked/);
  const instance = storage();
  instance.setItem = () => {
    const error = new Error("Quota exceeded");
    error.name = "QuotaExceededError";
    throw error;
  };
  assert.match(
    saveWorkspace(workspace()).error,
    /storage is full.*JSON backup/,
  );
});

test("invalid workspace does not overwrite an existing saved project", () => {
  storage();
  const data = workspace();
  saveWorkspace(data);
  assert.equal(
    saveWorkspace({ ...data, projects: [data.projects[0], data.projects[0]] })
      .ok,
    false,
  );
  assert.equal(saveWorkspace({ ...data, profile: { name: 42 } }).ok, false);
  assert.deepEqual(loadWorkspace(), data);
});

test("oversized and prototype-polluting local payloads are rejected", () => {
  storage(" ".repeat(DATA_LIMITS.maxWorkspaceChars + 1));
  assert.throws(loadWorkspace, /exceeds/);
  storage('{"version":1,"projects":[],"__proto__":{"polluted":true}}');
  assert.throws(loadWorkspace, /unsafe property/);
  assert.equal({}.polluted, undefined);
});

test("schedule-invalid draft projects remain recoverable in browser storage", () => {
  storage();
  const data = workspace();
  data.projects[0].tasks[0].dependsOn = ["not-yet-defined"];
  assert.deepEqual(saveWorkspace(data), { ok: true, error: null });
  assert.deepEqual(loadWorkspace().projects[0].tasks[0].dependsOn, [
    "not-yet-defined",
  ]);
});
