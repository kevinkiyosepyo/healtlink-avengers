import { computed, ref, watch } from "vue";
import { recordStorage } from "../lib/recordStorage.js";
import { readJson, writeJson } from "../lib/storage.js";
import { STORAGE_KEY as WORKSPACE_KEY } from "../lib/simulationWorkspace.js";

const SYNC_SETTINGS_KEY = "microfish:cloud-backup";
const PUSH_DELAY_MS = 2500;

async function request(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `cloud backup failed (${response.status})`);
  return body;
}
const put = (id, data) => request(`/api/sync/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });

/**
 * Opt-in cloud backup of research records and the workspace snapshot.
 * Off by default and per device; requires sign-in and a server with sync
 * configured. Only changed records (by fingerprint) are uploaded.
 */
export function useCloudSync({ research, account, sessions }) {
  const enabled = ref(readJson(SYNC_SETTINGS_KEY, {}).enabled === true);
  const state = ref("idle"); // idle | syncing | synced | error
  const error = ref("");
  const lastSyncedAt = ref(null);
  const pushed = new Map(); // item id -> fingerprint (or workspace JSON) last uploaded
  const available = computed(() => Boolean(account.account.user && account.account.cloudSync));
  const active = computed(() => enabled.value && available.value);

  watch(enabled, (value) => writeJson(SYNC_SETTINGS_KEY, { enabled: value }));

  async function push() {
    if (!active.value) return;
    state.value = "syncing";
    error.value = "";
    try {
      for (const record of Object.values(research.records)) {
        const id = `record:${record.runId}`;
        if (pushed.get(id) === record.fingerprint) continue;
        await put(id, record);
        pushed.set(id, record.fingerprint);
      }
      const snapshot = window.localStorage.getItem(WORKSPACE_KEY);
      if (snapshot && pushed.get("workspace") !== snapshot) {
        await put("workspace", JSON.parse(snapshot));
        pushed.set("workspace", snapshot);
      }
      state.value = "synced";
      lastSyncedAt.value = new Date();
    } catch (cause) {
      state.value = "error";
      error.value = cause.message;
    }
  }

  let timer;
  watch(
    [active, () => Object.values(research.records).map((r) => r.fingerprint).join(","), () => sessions.value.map((s) => `${s.id}:${s.updatedAt}`).join(",")],
    () => {
      clearTimeout(timer);
      if (active.value) timer = setTimeout(push, PUSH_DELAY_MS);
    },
    { immediate: true },
  );

  /** Replace this browser's workspace and records with the cloud copy, then reload. */
  async function restore() {
    state.value = "syncing";
    try {
      const { items } = await request("/api/sync");
      const workspace = items.find((item) => item.kind === "workspace");
      if (!workspace) throw new Error("there's no workspace backup in the cloud yet.");
      window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace.data));
      await recordStorage.clear();
      for (const item of items.filter((i) => i.kind === "record")) await recordStorage.save(item.data);
      window.location.reload();
    } catch (cause) {
      state.value = "error";
      error.value = cause.message;
    }
  }

  async function deleteCloudData() {
    try {
      await request("/api/sync", { method: "DELETE" });
      pushed.clear();
      enabled.value = false;
      state.value = "idle";
    } catch (cause) {
      state.value = "error";
      error.value = cause.message;
    }
  }

  return { enabled, available, active, state, error, lastSyncedAt, push, restore, deleteCloudData };
}
