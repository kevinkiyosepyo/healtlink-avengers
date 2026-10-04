import { validateProject } from "./readiness.js";

export const WORKSPACE_VERSION = 1;
export const STORAGE_KEY = "trial-readiness.workspace.v1";
export const DATA_LIMITS = Object.freeze({
  maxDepth: 24,
  maxNodes: 100000,
  maxString: 1000000,
  maxProjectBytes: 8000000,
  maxWorkspaceChars: 4000000,
  maxProjects: 20,
});

// Check the complete tree before passing imports to the engine. This also
// rejects cycles, prototype-bearing objects, and keys unsafe to merge later.
export function assertBoundedData(value) {
  let nodes = 0;
  const seen = new WeakSet();
  function visit(item, depth) {
    if (++nodes > DATA_LIMITS.maxNodes || depth > DATA_LIMITS.maxDepth)
      throw new Error("This file contains too much nested data.");
    if (typeof item === "string") {
      if (item.length > DATA_LIMITS.maxString)
        throw new Error(
          "A text field exceeds the import limit of 1,000,000 characters.",
        );
      return;
    }
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object")
      throw new Error("Project data must contain only JSON values.");
    if (seen.has(item))
      throw new Error(
        "Project data contains circular or repeated object references.",
      );
    seen.add(item);
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      throw new Error("Project data contains an unsupported object.");
    for (const key of Object.keys(item)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new Error("Project data contains an unsafe property name.");
      visit(item[key], depth + 1);
    }
    seen.delete(item);
  }
  visit(value, 0);
}

export function assertValidProject(project, options = {}) {
  assertBoundedData(project);
  if (!project || typeof project !== "object" || Array.isArray(project))
    throw new Error("A project must be a JSON object.");
  const result = validateProject(project, options);
  if (!result.valid)
    throw new Error(`Invalid project: ${result.errors.slice(0, 5).join(" ")}`);
  return project;
}

function validWorkspace(workspace) {
  assertBoundedData(workspace);
  if (
    !workspace ||
    typeof workspace !== "object" ||
    Array.isArray(workspace) ||
    workspace.version !== WORKSPACE_VERSION
  )
    throw new Error("Unsupported saved workspace version.");
  if (
    !Array.isArray(workspace.projects) ||
    workspace.projects.length > DATA_LIMITS.maxProjects
  )
    throw new Error(
      `A workspace can contain at most ${DATA_LIMITS.maxProjects} projects.`,
    );
  const ids = new Set();
  for (const project of workspace.projects) {
    assertValidProject(project, { structuralOnly: true });
    if (ids.has(project.id))
      throw new Error("The workspace contains duplicate project IDs.");
    ids.add(project.id);
  }
  if (
    workspace.activeProjectId !== null &&
    workspace.activeProjectId !== undefined &&
    !ids.has(workspace.activeProjectId)
  )
    throw new Error("The active project is missing from this workspace.");
  if (workspace.profile !== undefined) {
    if (
      !workspace.profile ||
      typeof workspace.profile !== "object" ||
      Array.isArray(workspace.profile)
    )
      throw new Error("Invalid saved profile.");
    for (const field of ["name", "role", "organization"]) {
      if (
        workspace.profile[field] !== undefined &&
        (typeof workspace.profile[field] !== "string" ||
          workspace.profile[field].length > 500)
      )
        throw new Error("Invalid saved profile.");
    }
  }
  return {
    ...workspace,
    profile: { name: "", role: "", organization: "", ...workspace.profile },
  };
}

// Storage is best effort: blocked site data and quota exhaustion must not
// prevent work in the current tab. The UI uses the returned error as a warning.
export function loadWorkspace() {
  try {
    if (!globalThis.localStorage)
      throw new Error(
        "Browser storage is unavailable. Your work can still be exported as JSON.",
      );
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    if (raw.length > DATA_LIMITS.maxWorkspaceChars)
      throw new Error(
        "The saved workspace exceeds the browser storage limit and could not be loaded.",
      );
    return validWorkspace(JSON.parse(raw));
  } catch (error) {
    throw new Error(
      `Saved workspace could not be loaded: ${error?.message || "browser storage is unavailable"}`,
    );
  }
}

export function saveWorkspace(workspace) {
  try {
    const serialized = JSON.stringify(validWorkspace(workspace));
    if (serialized.length > DATA_LIMITS.maxWorkspaceChars)
      throw new Error(
        "This workspace is too large to save in this browser. Export a JSON backup to keep your work.",
      );
    if (!globalThis.localStorage)
      throw new Error(
        "Browser storage is unavailable. Export a JSON backup to keep your work.",
      );
    globalThis.localStorage.setItem(STORAGE_KEY, serialized);
    return { ok: true, error: null };
  } catch (error) {
    const quota =
      error?.name === "QuotaExceededError" ||
      error?.name === "NS_ERROR_DOM_QUOTA_REACHED";
    return {
      ok: false,
      error: quota
        ? "Browser storage is full. Export a JSON backup to keep your work."
        : String(
            error?.message ||
              "Browser storage is unavailable. Export a JSON backup to keep your work.",
          ),
    };
  }
}
