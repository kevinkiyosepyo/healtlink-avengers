<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  FileText,
  GitBranch,
  Info,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Menu,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-vue-next";
import AppModal from "./components/AppModal.vue";
import { createProject } from "./lib/sampleCases.js";
import {
  calculateReadiness,
  reconcileProject,
  confirmRequirement,
  formatDate,
} from "./lib/readiness.js";
import { loadWorkspace, saveWorkspace } from "./lib/storage.js";
import { readDocuments, exportPacket, parseProjectFile } from "./lib/fileIO.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let loaded = null;
let initialError = "";
try {
  loaded = loadWorkspace();
} catch (error) {
  initialError = error.message || "Your saved workspace could not be loaded.";
}
function normalizeBaseline(p) {
  const base =
    p.scenarios?.find((s) => s.id === "baseline" || s.isBaseline) ||
    p.scenarios?.[0];
  if (!base) return p;
  if (
    Object.values(base.taskDelays || {}).some((v) => v > 0) ||
    base.assumedRequirementIds?.length ||
    Object.keys(base.dependencyOverrides || {}).length
  ) {
    const fork = {
      ...clone(base),
      id: uid(),
      name: `${base.name} — imported assumptions`,
      isBaseline: false,
    };
    p.scenarios.push(fork);
    if (p.activeScenarioId === base.id) p.activeScenarioId = fork.id;
    base.taskDelays = {};
    base.assumedRequirementIds = [];
    base.dependencyOverrides = {};
  }
  return p;
}
if (loaded?.projects) loaded.projects.forEach(normalizeBaseline);
const starter = loaded?.projects?.length ? null : createProject("rest");
const workspace = ref(
  loaded?.projects?.length
    ? loaded
    : {
        version: 1,
        projects: [starter],
        activeProjectId: starter.id,
        profile: {
          name: "Alex",
          role: "Research coordinator",
          organization: "Research team",
        },
      },
);
if (!workspace.value.profile)
  workspace.value.profile = {
    name: "Alex",
    role: "Research coordinator",
    organization: "Research team",
  };
if (
  !workspace.value.projects.some(
    (p) => p.id === workspace.value.activeProjectId,
  )
)
  workspace.value.activeProjectId = workspace.value.projects[0].id;
const project = computed(
  () =>
    workspace.value.projects.find(
      (p) => p.id === workspace.value.activeProjectId,
    ) || workspace.value.projects[0],
);
const scenarios = computed(() => project.value.scenarios || []);
const baseline = computed(
  () =>
    scenarios.value.find((s) => s.id === "baseline" || s.isBaseline) ||
    scenarios.value[0] || {
      id: "baseline",
      name: "Baseline",
      taskDelays: {},
      assumedRequirementIds: [],
      dependencyOverrides: {},
    },
);
const selectedScenario = computed(
  () =>
    scenarios.value.find((s) => s.id === project.value.activeScenarioId) ||
    baseline.value,
);
const current = computed(() =>
  calculateReadiness(project.value, {
    ...baseline.value,
    taskDelays: {},
    assumedRequirementIds: [],
    dependencyOverrides: {},
  }),
);
const result = computed(() =>
  calculateReadiness(project.value, selectedScenario.value),
);
const scenarioMode = computed(
  () => selectedScenario.value.id !== baseline.value.id,
);
const requirements = computed(() => current.value.requirements || []);
const available = computed(() =>
  (result.value.actions || []).filter((a) => a.state === "available"),
);
const blocked = computed(() =>
  (result.value.actions || []).filter((a) => a.state === "blocked"),
);
const verified = computed(
  () => requirements.value.filter((r) => r.satisfied).length,
);
const percentage = computed(() =>
  requirements.value.length
    ? Math.round((verified.value / requirements.value.length) * 100)
    : 0,
);
const projectTitle = computed(
  () => project.value.title || project.value.name || "Untitled study",
);
const researcherName = computed(
  () => project.value.person?.name || workspace.value.profile.name,
);
const studyCode = computed(() => project.value.studyId || "Study workspace");
const shortName = computed(() => String(researcherName.value).split(" ")[0]);
const profileInitials = computed(
  () =>
    workspace.value.profile.name
      .split(" ")
      .map((v) => v[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "RD",
);
const tab = ref("overview");
const tabs = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },
  { id: "evidence", name: "Evidence", icon: FileCheck2 },
  { id: "timeline", name: "Timeline", icon: CalendarDays },
  { id: "scenarios", name: "Scenarios", icon: GitBranch },
  { id: "packet", name: "Prep packet", icon: ClipboardCheck },
];
const navOpen = ref(false);
const exportOpen = ref(false);
const savedState = ref(initialError ? "error" : "saved");
const storageError = ref(initialError);
const toast = ref("");
const undoSnapshot = ref(null);
let toastTimer, saveTimer;
watch(
  workspace,
  () => {
    savedState.value = "saving";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const saved = saveWorkspace(workspace.value);
        if (saved?.ok === false)
          throw new Error(saved.error || "Could not save in this browser.");
        savedState.value = "saved";
        storageError.value = "";
      } catch (error) {
        savedState.value = "error";
        storageError.value = error.message;
      }
    }, 350);
  },
  { deep: true },
);
function notify(message, persistent = false) {
  toast.value = message;
  clearTimeout(toastTimer);
  if (!persistent)
    toastTimer = setTimeout(() => {
      toast.value = "";
      undoSnapshot.value = null;
    }, 7000);
}
function replaceProject(next) {
  workspace.value.projects[
    workspace.value.projects.findIndex((p) => p.id === project.value.id)
  ] = next;
}
function withUndo(message, action) {
  undoSnapshot.value = clone(workspace.value);
  action();
  notify(message, true);
}
function undo() {
  if (!undoSnapshot.value) return;
  workspace.value = clone(undoSnapshot.value);
  undoSnapshot.value = null;
  notify("Change undone.");
}
function scrollToActions() {
  document
    .getElementById("action-queue")
    ?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
}
function navigate(next) {
  tab.value = next;
  navOpen.value = false;
  exportOpen.value = false;
}
function switchProject(event) {
  workspace.value.activeProjectId = event.target.value;
  navigate("overview");
}
function prettyDate(date) {
  if (!date) return "Not yet available";
  try {
    return formatDate(date);
  } catch {
    return date;
  }
}
const statuses = ["missing", "received", "verified", "approved", "active"];
const stateLabels = {
  missing: "Missing",
  received: "Received",
  verified: "Verified",
  approved: "Approved",
  active: "Active",
};
const statusClass = (value) =>
  ["verified", "approved", "active"].includes(value)
    ? "good"
    : value === "received"
      ? "pending"
      : "neutral";
const sourceName = (source) =>
  project.value.documents?.find((d) => d.id === source.documentId)?.name ||
  "Source unavailable";
const requirementName = (id) =>
  requirements.value.find((r) => r.id === id)?.title || id;
const taskName = (id) =>
  (result.value.tasks || []).find((t) => t.id === id)?.title ||
  requirementName(id);
const taskMax = computed(() =>
  Math.max(1, ...(result.value.tasks || []).map((t) => t.finishOffset || 0)),
);
const allReady = computed(
  () =>
    current.value.valid &&
    current.value.tasks?.length > 0 &&
    requirements.value.length > 0 &&
    verified.value === requirements.value.length,
);
const evidenceQuery = ref("");
const evidenceFilter = ref("all");
const filteredRequirements = computed(() =>
  requirements.value.filter(
    (r) =>
      (evidenceFilter.value === "all" ||
        (evidenceFilter.value === "open" ? !r.satisfied : r.satisfied)) &&
      `${r.title} ${r.owner} ${r.code}`
        .toLowerCase()
        .includes(evidenceQuery.value.toLowerCase()),
  ),
);
const modal = ref(null);
const form = ref({});
const formError = ref("");
const editingId = ref(null);
function openModal(type, data = {}) {
  modal.value = type;
  form.value = clone(data);
  formError.value = "";
  editingId.value = data.id || null;
  exportOpen.value = false;
}
function closeModal() {
  modal.value = null;
  formError.value = "";
}
function editRequirement(requirement) {
  openModal("requirement", {
    ...requirement,
    status: requirement.effectiveStatus || requirement.status,
    reviewerNote: requirement.reviewerNote || "",
  });
}
function saveRequirement() {
  if (!form.value.owner?.trim()) {
    formError.value = "Add an owner so the next step has someone responsible.";
    return;
  }
  if (
    ["verified", "approved", "active"].includes(form.value.status) &&
    !form.value.reviewerNote?.trim()
  ) {
    formError.value =
      "A human reviewer note is required to confirm this state. Record what you checked and who checked it.";
    return;
  }
  try {
    const next = clone(project.value);
    const requirement = next.requirements.find((r) => r.id === editingId.value);
    requirement.owner = form.value.owner.trim();
    requirement.notes = form.value.notes || "";
    const confirmed = confirmRequirement(
      next,
      editingId.value,
      form.value.status,
      form.value.reviewerNote || "",
    );
    replaceProject(confirmed);
    closeModal();
    notify("Evidence decision saved. Readiness has been recalculated.");
  } catch (error) {
    formError.value = error.message;
  }
}
function newProject() {
  openModal("new", { kind: "rest", name: "" });
}
function createNewProject() {
  const next = createProject(form.value.kind);
  next.id = uid();
  if (form.value.name.trim()) next.title = form.value.name.trim();
  workspace.value.projects.push(next);
  workspace.value.activeProjectId = next.id;
  closeModal();
  navigate("overview");
  notify("Workspace created.");
}
function editProfile() {
  openModal("profile", workspace.value.profile);
}
function saveProfile() {
  if (!form.value.name?.trim()) {
    formError.value = "Enter a display name.";
    return;
  }
  workspace.value.profile = { ...form.value, name: form.value.name.trim() };
  closeModal();
  notify("Profile saved on this device.");
}
function editProject() {
  openModal("project", {
    name: projectTitle.value,
    researcher: researcherName.value,
    startDate: project.value.startDate,
    targetDate: project.value.targetDate || "",
  });
}
function saveProject() {
  if (
    !form.value.name?.trim() ||
    !form.value.researcher?.trim() ||
    !form.value.startDate
  ) {
    formError.value =
      "Add a project name, researcher, and planning start date.";
    return;
  }
  if (form.value.targetDate && form.value.targetDate < form.value.startDate) {
    formError.value =
      "The target date must be on or after the planning start date.";
    return;
  }
  project.value.title = form.value.name.trim();
  project.value.person = {
    ...(project.value.person || {}),
    name: form.value.researcher.trim(),
  };
  project.value.startDate = form.value.startDate;
  project.value.targetDate = form.value.targetDate;
  closeModal();
  notify("Workspace details updated.");
}
function deleteProject() {
  withUndo("Workspace removed. You can undo this change.", () => {
    const id = project.value.id;
    workspace.value.projects = workspace.value.projects.filter(
      (p) => p.id !== id,
    );
    if (!workspace.value.projects.length)
      workspace.value.projects.push(createProject("empty"));
    workspace.value.activeProjectId = workspace.value.projects[0].id;
  });
  closeModal();
  navigate("overview");
}
function forkScenario() {
  openModal("fork", {
    name: scenarioMode.value
      ? `${selectedScenario.value.name} — copy`
      : "Parallel preparation",
    description: "",
  });
}
function saveFork() {
  if (!form.value.name?.trim()) {
    formError.value = "Give this scenario a name.";
    return;
  }
  const scenario = {
    ...clone(selectedScenario.value),
    id: uid(),
    name: form.value.name.trim(),
    description: form.value.description || "",
    isBaseline: false,
  };
  project.value.scenarios ||= [clone(baseline.value)];
  project.value.scenarios.push(scenario);
  project.value.activeScenarioId = scenario.id;
  closeModal();
  navigate("scenarios");
  notify("Scenario fork created. Current evidence is unchanged.");
}
function selectScenario(id) {
  project.value.activeScenarioId = id;
}
function renameScenario() {
  openModal("rename", {
    name: selectedScenario.value.name,
    description: selectedScenario.value.description || "",
  });
}
function saveRename() {
  if (!form.value.name?.trim()) {
    formError.value = "Give this scenario a name.";
    return;
  }
  Object.assign(selectedScenario.value, form.value);
  closeModal();
}
function deleteScenario() {
  withUndo("Scenario deleted. You can undo this change.", () => {
    project.value.scenarios = project.value.scenarios.filter(
      (s) => s.id !== selectedScenario.value.id,
    );
    project.value.activeScenarioId = baseline.value.id;
  });
}
function resetScenario() {
  withUndo("Scenario adjustments reset.", () => {
    selectedScenario.value.taskDelays = {};
    selectedScenario.value.assumedRequirementIds = [];
    selectedScenario.value.dependencyOverrides = {};
  });
}
function setDelay(id, value) {
  selectedScenario.value.taskDelays ||= {};
  selectedScenario.value.taskDelays[id] = Math.min(
    60,
    Math.max(0, Number(value) || 0),
  );
}
function toggleAssumption(id, enabled) {
  const ids = new Set(selectedScenario.value.assumedRequirementIds || []);
  enabled ? ids.add(id) : ids.delete(id);
  selectedScenario.value.assumedRequirementIds = [...ids];
}
function policyEnabled(policy) {
  return Object.entries(policy.allowedOverrides || {}).every(
    ([id, dependencies]) =>
      JSON.stringify(selectedScenario.value.dependencyOverrides?.[id]) ===
      JSON.stringify(dependencies),
  );
}
function togglePolicy(policy, enabled) {
  selectedScenario.value.dependencyOverrides ||= {};
  for (const [id, dependencies] of Object.entries(
    policy.allowedOverrides || {},
  )) {
    if (enabled)
      selectedScenario.value.dependencyOverrides[id] = clone(dependencies);
    else delete selectedScenario.value.dependencyOverrides[id];
  }
}
const originalUrls = new Map();
const sourceRefs = ref([]);
const sourceDocumentId = ref(null);
const sourceDoc = computed(() =>
  project.value.documents?.find((d) => d.id === sourceDocumentId.value),
);
const sourceLines = computed(() =>
  (sourceDoc.value?.text || "")
    .split("\n")
    .map((text, index) => ({ number: index + 1, text })),
);
function isHighlighted(number) {
  return sourceRefs.value.some(
    (r) => r.documentId === sourceDocumentId.value && r.line === number,
  );
}
async function inspectSources(refs, documentId) {
  sourceRefs.value = refs || [];
  sourceDocumentId.value =
    documentId || refs?.[0]?.documentId || project.value.documents?.[0]?.id;
  openModal("source");
  await nextTick();
  document
    .querySelector(".source-line.highlighted")
    ?.scrollIntoView({ block: "center" });
}
function openOriginal() {
  if (!sourceDoc.value) return;
  let url = originalUrls.get(sourceDoc.value.id);
  if (!url)
    url = URL.createObjectURL(
      new Blob([sourceDoc.value.text], { type: "text/plain;charset=utf-8" }),
    );
  window.open(url, "_blank", "noopener,noreferrer");
}
function downloadSource() {
  if (!sourceDoc.value) return;
  const url = URL.createObjectURL(
    new Blob([sourceDoc.value.text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sourceDoc.value.name.replace(/\.[^.]+$/, "")}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function editDocument(doc) {
  openModal("document", doc || { id: "", name: "", kind: "source", text: "" });
}
function saveDocument() {
  if (!form.value.name?.trim() || !form.value.text?.trim()) {
    formError.value = "Add a document name and source text.";
    return;
  }
  const next = clone(project.value);
  const doc = {
    ...form.value,
    id: form.value.id || uid(),
    name: form.value.name.trim(),
  };
  const index = next.documents.findIndex((d) => d.id === doc.id);
  if (index === -1) next.documents.push(doc);
  else next.documents[index] = doc;
  try {
    replaceProject(reconcileProject(next));
    closeModal();
    notify("Source saved. Affected confirmations require a new review.");
  } catch (error) {
    formError.value = error.message;
  }
}
function removeDocument(doc) {
  withUndo(
    `“${doc.name}” removed. Affected evidence has been recalculated.`,
    () => {
      const next = clone(project.value);
      next.documents = next.documents.filter((d) => d.id !== doc.id);
      replaceProject(reconcileProject(next));
    },
  );
  closeModal();
}
const fileInput = ref(null);
const projectInput = ref(null);
const importing = ref(false);
const importErrors = ref([]);
async function importDocuments(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const targetId = project.value.id;
  importing.value = true;
  importErrors.value = [];
  try {
    const parsed = await readDocuments(files);
    importErrors.value = (parsed.errors || []).map(
      (e) => `${e.name}: ${e.message}`,
    );
    const target = workspace.value.projects.find((p) => p.id === targetId);
    if (!target) {
      importErrors.value.push(
        "The target workspace was removed while files were being read. Import the files into another workspace.",
      );
      return;
    }
    if (parsed.documents.length) {
      for (const doc of parsed.documents) {
        const file = files.find((f) => f.name === doc.name);
        if (file) originalUrls.set(doc.id, URL.createObjectURL(file));
      }
      const next = clone(target);
      next.documents.push(...parsed.documents);
      const targetIndex = workspace.value.projects.findIndex(
        (p) => p.id === targetId,
      );
      workspace.value.projects[targetIndex] = reconcileProject(next);
      workspace.value.activeProjectId = targetId;
      navigate("evidence");
      notify(
        `${parsed.documents.length} document${parsed.documents.length === 1 ? "" : "s"} imported. Review the extracted requirements and evidence.`,
      );
    }
  } catch (error) {
    importErrors.value = [error.message];
  } finally {
    importing.value = false;
    event.target.value = "";
  }
}
async function importProject(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const next = normalizeBaseline(await parseProjectFile(file));
    next.id = uid();
    workspace.value.projects.push(next);
    workspace.value.activeProjectId = next.id;
    navigate("overview");
    calculateReadiness(next).valid
      ? notify("Saved project imported.")
      : notify(
          "Project imported. The saved draft needs correction before readiness can be calculated.",
          true,
        );
  } catch (error) {
    notify(`Import failed: ${error.message}`, true);
  } finally {
    event.target.value = "";
  }
}
function insertTemplate() {
  form.value.text = `${form.value.text || ""}${form.value.text ? "\n\n" : ""}Requirement | id=training | code=TRAINING | title=Complete study training | owner=Study coordinator | state=verified\nTask | id=review-training | title=Review study training | owner=Study coordinator | days=2 | after= | requires=training | completes=training | state=verified\nEVIDENCE | code=TRAINING | state=received | title=Training certificate received\n`;
}
async function copyRequest() {
  const text = `Subject: Readiness evidence request — ${studyCode.value}\n\nHello team,\n\nPlease provide the following source records for ${researcherName.value}:\n${requirements.value
    .filter((r) => !r.satisfied)
    .map(
      (r) =>
        `• ${r.title} — owner: ${r.owner}; required: ${r.requiredState}; currently: ${r.effectiveStatus}`,
    )
    .join(
      "\n",
    )}\n\nInclude document title, version/date, and the responsible reviewer. A received document will be reviewed separately before verification, approval, or access activation is recorded.\n\nThank you,\n${workspace.value.profile.name}`;
  openModal("request", { text });
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    notify("Copied to clipboard.");
  } catch {
    formError.value =
      "Clipboard access is unavailable. Select and copy the text manually.";
  }
}
function download(format) {
  try {
    exportPacket(project.value, result.value, format);
    exportOpen.value = false;
    notify(
      `${format === "markdown" ? "Markdown" : format.toUpperCase()} prep packet downloaded.`,
    );
  } catch (error) {
    notify(`Export failed: ${error.message}`, true);
  }
}
function printPacket() {
  exportOpen.value = false;
  tab.value = "packet";
  nextTick(() => {
    const closed = [
      ...document.querySelectorAll(".packet-source-document:not([open])"),
    ];
    closed.forEach((element) => {
      element.open = true;
    });
    window.print();
    closed.forEach((element) => {
      element.open = false;
    });
  });
}
const scenarioChanges = computed(() => {
  const changes = [];
  for (const [id, delay] of Object.entries(
    selectedScenario.value.taskDelays || {},
  ))
    if (delay > 0)
      changes.push({
        label: taskName(id),
        detail: `+${delay} working day${delay === 1 ? "" : "s"}`,
      });
  for (const id of selectedScenario.value.assumedRequirementIds || [])
    changes.push({
      label: requirementName(id),
      detail: "Assumed satisfied for planning",
    });
  for (const policy of result.value.policyOptions || [])
    if (policyEnabled(policy))
      changes.push({
        label: policy.title,
        detail: "Source-backed preparation policy",
      });
  return changes;
});
onBeforeUnmount(() => {
  clearTimeout(saveTimer);
  clearTimeout(toastTimer);
  for (const url of originalUrls.values()) URL.revokeObjectURL(url);
});
</script>

<template>
  <div class="workspace-shell">
    <a href="#main-content" class="skip-link">Skip to workspace</a>
    <input
      ref="fileInput"
      type="file"
      class="sr-only"
      accept=".txt,.md,.pdf,.docx,.zip"
      multiple
      @change="importDocuments"
    />
    <input
      ref="projectInput"
      type="file"
      class="sr-only"
      accept=".json"
      @change="importProject"
    />
    <div
      v-if="navOpen"
      class="mobile-nav-backdrop"
      @click="navOpen = false"
    ></div>
    <aside
      class="sidebar"
      :class="{ 'is-open': navOpen }"
      aria-label="Workspace navigation"
    >
      <a class="brand" href="#" @click.prevent="navigate('overview')"
        ><span class="brand-mark"
          ><Activity :size="23" :stroke-width="1.8" /></span
        ><span>Trial<span class="brand-second-line">Researcher</span></span></a
      >
      <div class="workspace-switch">
        <label for="project-switch" class="eyebrow">Your workspace</label
        ><select
          id="project-switch"
          :value="project.id"
          @change="switchProject"
        >
          <option v-for="p in workspace.projects" :key="p.id" :value="p.id">
            {{ p.title || p.name }}
          </option>
        </select>
      </div>
      <button class="button new-project-button" @click="newProject">
        <Plus :size="17" /> New workspace
      </button>
      <div class="nav-label eyebrow">Prepare with confidence</div>
      <nav class="main-nav">
        <button
          v-for="item in tabs"
          :key="item.id"
          :class="{ active: tab === item.id }"
          :aria-current="tab === item.id ? 'page' : undefined"
          @click="navigate(item.id)"
        >
          <component :is="item.icon" :size="19" :stroke-width="1.7" /><span>{{
            item.name
          }}</span
          ><span v-if="item.id === 'evidence'" class="nav-count">{{
            requirements.length
          }}</span>
        </button>
      </nav>
      <div class="sidebar-note">
        <span class="mini-icon"><ShieldCheck :size="20" /></span>
        <p>Every next step,<br /><strong>grounded in a source.</strong></p>
        <span>Evidence first. Clear ownership.<br />Human decisions.</span>
      </div>
      <div class="sidebar-bottom">
        <button class="sidebar-utility" @click="projectInput.click()">
          <Upload :size="17" /> Import saved project</button
        ><button class="sidebar-utility" @click="editProject">
          <Settings2 :size="17" /> Workspace details</button
        ><button class="profile-button" @click="editProfile">
          <span class="avatar">{{ profileInitials }}</span
          ><span
            ><strong>{{ workspace.profile.name }}</strong
            ><small>{{ workspace.profile.role }}</small></span
          ><ChevronRight :size="16" />
        </button>
      </div>
    </aside>

    <div class="main-shell">
      <header class="topbar">
        <div class="breadcrumb">
          <button
            class="icon-button mobile-menu"
            aria-label="Open navigation"
            @click="navOpen = true"
          >
            <Menu :size="22" /></button
          ><span class="breadcrumb-home">Workspace</span
          ><ChevronRight :size="14" /><strong>{{ studyCode }}</strong
          ><span
            class="sample-tag"
            v-if="project.documents?.some((d) => d.text.includes('Fictional'))"
            >Fictional sample</span
          >
        </div>
        <div
          class="save-indicator"
          :class="{ 'save-error': savedState === 'error' }"
        >
          <Loader2
            v-if="savedState === 'saving'"
            :size="14"
            class="spin"
          /><Check v-else-if="savedState === 'saved'" :size="15" /><Info
            v-else
            :size="15"
          /><span>{{
            savedState === "saving"
              ? "Saving…"
              : savedState === "error"
                ? "Not saved"
                : "Saved on this device"
          }}</span>
        </div>
      </header>
      <main id="main-content" tabindex="-1">
        <div v-if="storageError" class="notice error-notice" role="alert">
          <Info :size="19" />
          <div>
            <strong>Local saving needs attention.</strong>
            {{ storageError }} Download a JSON packet to keep a copy.
          </div>
          <button class="text-button" @click="download('json')">
            Download backup
          </button>
        </div>
        <div
          v-if="importErrors.length"
          class="notice error-notice"
          role="alert"
        >
          <Info :size="19" />
          <div>
            <strong>Some documents could not be imported.</strong>
            <p v-for="message in importErrors" :key="message">{{ message }}</p>
          </div>
          <button
            class="icon-button"
            aria-label="Dismiss import errors"
            @click="importErrors = []"
          >
            <X :size="16" />
          </button>
        </div>
        <div class="page-heading">
          <div>
            <div class="eyebrow heading-eyebrow">
              {{ project.person?.institution || "Research operations" }}
              <span> / </span> {{ studyCode }}
            </div>
            <h1>
              {{
                tab === "overview"
                  ? `${shortName}’s readiness`
                  : tab === "evidence"
                    ? "The evidence behind the plan"
                    : tab === "timeline"
                      ? "See what happens next"
                      : tab === "scenarios"
                        ? "Explore another path"
                        : "Your preparation packet"
              }}
            </h1>
            <p class="page-description">
              {{
                tab === "overview"
                  ? "Know what’s ready, what’s needed, and what can move forward."
                  : tab === "evidence"
                    ? "A traceable record of requirements, documents, and human review."
                    : tab === "timeline"
                      ? "Dependencies, owners, and working-day estimates in one view."
                      : tab === "scenarios"
                        ? "Test timing and preparation choices without changing the evidence."
                        : "A complete, source-linked handoff for your research team."
              }}
            </p>
          </div>
          <div class="heading-actions">
            <button
              v-if="tab === 'evidence'"
              class="button"
              @click="copyRequest"
            >
              <Copy :size="16" /> Request evidence
            </button>
            <div class="export-wrap">
              <button
                class="button primary-button"
                :aria-expanded="exportOpen"
                aria-haspopup="menu"
                @click="exportOpen = !exportOpen"
              >
                <ArrowDownToLine :size="17" /><span>Export packet</span
                ><ChevronDown :size="15" />
              </button>
              <div v-if="exportOpen" class="export-menu" role="menu">
                <button role="menuitem" @click="download('markdown')">
                  <FileText :size="17" /><span
                    >Markdown document<small
                      >Complete readable handoff</small
                    ></span
                  ></button
                ><button role="menuitem" @click="download('json')">
                  <Download :size="17" /><span
                    >JSON project<small>Full backup and re-import</small></span
                  ></button
                ><button role="menuitem" @click="download('csv')">
                  <ListChecks :size="17" /><span
                    >Preparation packet CSV<small
                      >Complete source and review register</small
                    ></span
                  ></button
                ><button role="menuitem" @click="printPacket">
                  <ClipboardCheck :size="17" /><span>Print / Save as PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <template v-if="tab === 'overview'">
          <div v-if="scenarioMode" class="notice gentle-notice">
            <GitBranch :size="19" />
            <div>
              <strong>{{ selectedScenario.name }} is selected.</strong> Next
              actions use this plan’s source-backed preparation policy. Evidence
              status remains the actual record; assumptions do not grant
              permission.
            </div>
            <button class="text-button" @click="selectScenario(baseline.id)">
              Use baseline
            </button>
          </div>
          <section class="readiness-summary" aria-labelledby="status-title">
            <div class="summary-intro">
              <span class="eyebrow">Current evidence</span>
              <h2 id="status-title">
                {{
                  allReady
                    ? "Every requirement is satisfied."
                    : requirements.length
                      ? "A few steps from ready."
                      : "Start with your source documents."
                }}
              </h2>
              <p>
                {{
                  allReady
                    ? "Recorded evidence meets each source-defined requirement. Confirm institutional authorization before beginning duties."
                    : requirements.length
                      ? `${shortName}’s preparation is in progress. Review the open requirements before study duties begin.`
                      : "Add requirements, processing times, and evidence to build a traceable readiness plan."
                }}
              </p>
              <div class="status-badge" :class="allReady ? 'good' : 'pending'">
                <span class="status-dot"></span
                >{{
                  allReady
                    ? "Requirements satisfied"
                    : requirements.length
                      ? "Not yet ready for study duties"
                      : "Evidence needed"
                }}
              </div>
            </div>
            <div class="summary-progress">
              <div class="progress-ring">
                <svg viewBox="0 0 88 88" aria-hidden="true">
                  <circle cx="44" cy="44" r="37" class="ring-track" />
                  <circle
                    cx="44"
                    cy="44"
                    r="37"
                    class="ring-value"
                    pathLength="100"
                    :stroke-dasharray="`${percentage} 100`"
                  /></svg
                ><span
                  >{{ verified
                  }}<small>/ {{ requirements.length }}</small></span
                >
              </div>
              <div>
                <strong>Requirements satisfied</strong>
                <p>Matched evidence + required review</p>
                <button class="text-button" @click="navigate('evidence')">
                  Review the evidence <ArrowRight :size="15" />
                </button>
              </div>
            </div>
          </section>
          <div class="metric-grid">
            <button
              class="metric"
              @click="
                navigate('evidence');
                evidenceFilter = 'open';
              "
            >
              <span class="metric-icon amber"><FileCheck2 :size="20" /></span>
              <div>
                <span class="metric-value"
                  >{{ requirements.length - verified }}
                  <small>open requirements</small></span
                >
                <p>Evidence or review still needed</p>
              </div>
              <ChevronRight :size="18" /></button
            ><button class="metric" @click="scrollToActions">
              <span class="metric-icon teal"><ArrowUpRight :size="21" /></span>
              <div>
                <span class="metric-value"
                  >{{ available.length }}
                  <small
                    >next
                    {{ available.length === 1 ? "action" : "actions" }}</small
                  ></span
                >
                <p>Can start with current evidence</p>
              </div>
              <ChevronRight :size="18" /></button
            ><button class="metric" @click="navigate('timeline')">
              <span class="metric-icon blue"><CalendarDays :size="20" /></span>
              <div>
                <span class="metric-value"
                  >{{ current.totalWorkingDays ?? "—" }}
                  <small>working days</small></span
                >
                <p>Source-defined baseline estimate</p>
              </div>
              <ChevronRight :size="18" />
            </button>
          </div>
          <div class="overview-grid">
            <div class="overview-main">
              <section class="panel" id="action-queue">
                <div class="panel-heading">
                  <div>
                    <span class="eyebrow">Your next steps</span>
                    <h2>Move the right work forward</h2>
                  </div>
                  <span class="count-label"
                    >{{ available.length + blocked.length }} actions</span
                  >
                </div>
                <div v-if="!current.actions?.length" class="empty-state">
                  <FilePlus2 :size="29" />
                  <h3>Your action plan starts here</h3>
                  <p>
                    Add source documents with requirements and task durations.
                  </p>
                  <button class="button primary-button" @click="editDocument()">
                    Add a source
                  </button>
                </div>
                <article
                  v-for="action in [...available, ...blocked].slice(0, 5)"
                  :key="action.id"
                  class="action-row"
                >
                  <div class="action-state-icon" :class="action.state">
                    <ArrowUpRight
                      v-if="action.state === 'available'"
                      :size="18"
                    /><Clock3 v-else :size="17" />
                  </div>
                  <div class="action-body">
                    <div class="action-title-line">
                      <h3>{{ action.title }}</h3>
                      <span
                        class="status-badge small"
                        :class="
                          action.state === 'available' ? 'good' : 'neutral'
                        "
                        >{{
                          action.state === "available" ? "Can start" : "Waiting"
                        }}</span
                      >
                    </div>
                    <p>{{ action.reason }}</p>
                    <div class="action-meta">
                      <span><UserRound :size="13" />{{ action.owner }}</span
                      ><button
                        v-if="action.sourceRefs?.length"
                        class="source-link"
                        @click="inspectSources(action.sourceRefs)"
                      >
                        <BookOpen :size="13" />Source
                        <ArrowUpRight :size="12" />
                      </button>
                    </div>
                  </div>
                </article>
                <button
                  v-if="current.actions?.length"
                  class="panel-footer-link"
                  @click="navigate('timeline')"
                >
                  See every step and dependency <ArrowRight :size="16" />
                </button>
              </section>
              <section
                class="policy-panel"
                v-for="policy in (current.policyOptions || []).slice(0, 1)"
                :key="policy.id"
              >
                <div class="policy-icon"><GitBranch :size="23" /></div>
                <div>
                  <span class="eyebrow">While you’re waiting</span>
                  <h2>{{ policy.title }}</h2>
                  <p>{{ policy.description }}</p>
                  <div class="inline-actions">
                    <button
                      class="text-button"
                      @click="
                        project.activeScenarioId =
                          scenarios.find((s) => s.id === 'parallel')?.id ||
                          baseline.id;
                        navigate('scenarios');
                      "
                    >
                      Explore parallel preparation
                      <ArrowRight :size="16" /></button
                    ><button
                      class="source-link"
                      @click="inspectSources(policy.sourceRefs)"
                    >
                      Read the policy <ArrowUpRight :size="13" />
                    </button>
                  </div>
                </div>
              </section>
            </div>
            <aside class="overview-aside">
              <section class="panel milestone-panel">
                <div class="panel-heading">
                  <div>
                    <span class="eyebrow">Different decisions</span>
                    <h2>Every gate matters</h2>
                  </div>
                  <ShieldCheck :size="21" class="muted-icon" />
                </div>
                <ol class="state-ladder">
                  <li
                    v-for="(state, index) in [
                      'received',
                      'verified',
                      'approved',
                      'active',
                    ]"
                    :key="state"
                  >
                    <span class="ladder-marker">{{ index + 1 }}</span>
                    <div>
                      <h3>{{ stateLabels[state] }}</h3>
                      <p>
                        {{
                          state === "received"
                            ? "The document is in hand."
                            : state === "verified"
                              ? "A reviewer checked scope and validity."
                              : state === "approved"
                                ? "An authorized person approved the role."
                                : "The required system access is active."
                        }}
                      </p>
                    </div>
                  </li>
                </ol>
                <div class="panel-footnote">
                  <Info :size="15" /><span
                    >Receiving a certificate does not authorize study
                    duties.</span
                  >
                </div>
              </section>
              <section class="compact-panel">
                <div class="small-heading">
                  <h3>Planning window</h3>
                  <button
                    class="icon-button"
                    aria-label="Edit planning dates"
                    @click="editProject"
                  >
                    <Pencil :size="15" />
                  </button>
                </div>
                <dl class="date-list">
                  <div>
                    <dt>Planning starts</dt>
                    <dd>{{ prettyDate(project.startDate) }}</dd>
                  </div>
                  <div>
                    <dt>Team target</dt>
                    <dd>{{ prettyDate(project.targetDate) }}</dd>
                  </div>
                  <div>
                    <dt>Baseline finishes</dt>
                    <dd>{{ prettyDate(current.finishDate) }}</dd>
                  </div>
                </dl>
                <p class="micro-note">
                  Working-day model, not an operational promise. Holidays are
                  not included.
                </p>
              </section>
            </aside>
          </div>
          <section class="role-section" v-if="current.roleReviews?.length">
            <div class="section-heading">
              <div>
                <span class="eyebrow">A review from every seat</span>
                <h2>Team checkpoints</h2>
              </div>
              <span class="subtle-note"
                ><ListChecks :size="15" /> Rule-based review</span
              >
            </div>
            <div class="role-grid">
              <article
                v-for="review in current.roleReviews"
                :key="review.id"
                class="role-card"
              >
                <div class="role-card-head">
                  <span class="role-icon"><UsersRound :size="19" /></span
                  ><span
                    class="status-badge small"
                    :class="review.status === 'clear' ? 'good' : 'pending'"
                    >{{
                      review.status === "clear" ? "Clear" : "Needs attention"
                    }}</span
                  >
                </div>
                <span class="eyebrow">{{ review.role }}</span>
                <h3>{{ review.title }}</h3>
                <p>{{ review.summary }}</p>
                <button
                  v-if="review.sourceRefs?.length"
                  class="source-link"
                  @click="inspectSources(review.sourceRefs)"
                >
                  Check the grounds <ArrowUpRight :size="13" />
                </button>
              </article>
            </div>
          </section>
        </template>

        <template v-if="tab === 'evidence'">
          <div class="notice gentle-notice">
            <ShieldCheck :size="20" />
            <div>
              <strong>Human review is part of the record.</strong> Source text
              can establish that evidence was received. Verification, approval,
              and active access need an explicit review note.
            </div>
          </div>
          <section class="panel requirements-panel">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">Evidence register</span>
                <h2>
                  {{ verified }} of {{ requirements.length }} requirements
                  satisfied
                </h2>
              </div>
              <div class="filter-tabs" aria-label="Filter requirements">
                <button
                  v-for="filter in [
                    { id: 'all', name: 'All' },
                    { id: 'open', name: 'Open' },
                    { id: 'satisfied', name: 'Satisfied' },
                  ]"
                  :key="filter.id"
                  :class="{ active: evidenceFilter === filter.id }"
                  @click="evidenceFilter = filter.id"
                >
                  {{ filter.name }}
                </button>
              </div>
            </div>
            <div class="table-toolbar">
              <div class="search-field">
                <Search :size="17" /><input
                  v-model="evidenceQuery"
                  type="search"
                  placeholder="Find a requirement or owner"
                  aria-label="Search requirements"
                />
              </div>
              <span class="subtle-note"
                >{{ filteredRequirements.length }}
                {{
                  filteredRequirements.length === 1
                    ? "requirement"
                    : "requirements"
                }}</span
              >
            </div>
            <div class="table-scroll">
              <table class="evidence-table">
                <thead>
                  <tr>
                    <th>Requirement</th>
                    <th>Current evidence</th>
                    <th>Owner</th>
                    <th>Required gate</th>
                    <th><span class="sr-only">Review</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="requirement in filteredRequirements"
                    :key="requirement.id"
                  >
                    <td>
                      <button
                        class="table-title"
                        @click="editRequirement(requirement)"
                      >
                        {{ requirement.title }}</button
                      ><button
                        class="table-source"
                        @click="inspectSources(requirement.sourceRefs)"
                      >
                        {{ requirement.code }} <ArrowUpRight :size="12" />
                      </button>
                    </td>
                    <td>
                      <span
                        class="status-badge"
                        :class="statusClass(requirement.effectiveStatus)"
                        ><CheckCircle2
                          v-if="requirement.satisfied"
                          :size="13"
                        /><Circle v-else :size="12" />{{
                          stateLabels[requirement.effectiveStatus] ||
                          requirement.effectiveStatus
                        }}</span
                      ><small class="table-subtext"
                        >{{ requirement.evidenceRefs?.length || 0 }} evidence
                        {{
                          requirement.evidenceRefs?.length === 1
                            ? "record"
                            : "records"
                        }}</small
                      >
                    </td>
                    <td>{{ requirement.owner }}</td>
                    <td>
                      <span class="required-state">{{
                        stateLabels[requirement.requiredState]
                      }}</span>
                    </td>
                    <td>
                      <button
                        class="icon-button"
                        :aria-label="`Review ${requirement.title}`"
                        @click="editRequirement(requirement)"
                      >
                        <Pencil :size="17" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="!filteredRequirements.length" class="empty-state">
              <Search :size="27" />
              <h3>
                {{
                  requirements.length
                    ? "No matching requirements"
                    : "No requirements yet"
                }}
              </h3>
              <p>
                {{
                  requirements.length
                    ? "Try another name, owner, or filter."
                    : "Add a source document to extract your first requirement."
                }}
              </p>
              <button
                v-if="!requirements.length"
                class="button"
                @click="editDocument()"
              >
                Add a source
              </button>
            </div>
          </section>
          <section class="documents-section">
            <div class="section-heading">
              <div>
                <span class="eyebrow">The source of truth</span>
                <h2>
                  Source documents
                  <span class="heading-count">{{
                    project.documents.length
                  }}</span>
                </h2>
              </div>
              <div class="inline-actions">
                <button class="button" @click="editDocument()">
                  <Plus :size="16" /> Add source</button
                ><button
                  class="button primary-button"
                  :disabled="importing"
                  @click="fileInput.click()"
                >
                  <Loader2 v-if="importing" :size="17" class="spin" /><Upload
                    v-else
                    :size="17"
                  />{{ importing ? "Reading files…" : "Import files" }}
                </button>
              </div>
            </div>
            <p class="section-description">
              TXT, Markdown, PDF, DOCX, and ZIP packets. Extracted text stays in
              this browser; edits trigger a fresh evidence review.
            </p>
            <div class="document-grid">
              <article
                class="document-card"
                v-for="doc in project.documents"
                :key="doc.id"
              >
                <div class="document-top">
                  <span class="document-icon"
                    ><FileText :size="24" :stroke-width="1.4" /></span
                  ><button
                    class="icon-button"
                    :aria-label="`Edit ${doc.name}`"
                    @click="editDocument(doc)"
                  >
                    <Pencil :size="16" />
                  </button>
                </div>
                <button
                  class="document-name"
                  @click="inspectSources([], doc.id)"
                >
                  {{ doc.name }}
                </button>
                <div class="document-meta">
                  <span>{{ doc.kind }}</span
                  ><span>{{ doc.text.split("\n").length }} lines</span>
                </div>
                <button class="text-button" @click="inspectSources([], doc.id)">
                  Read source <ArrowUpRight :size="14" />
                </button>
              </article>
              <button
                class="document-card add-document-card"
                @click="editDocument()"
              >
                <span class="add-document-circle"><Plus :size="23" /></span
                ><strong>Add the next source</strong
                ><span>Paste text or use a structured template</span>
              </button>
            </div>
          </section>
          <section v-if="current.findings?.length" class="findings-section">
            <div class="section-heading">
              <h2>Source checks</h2>
              <span class="subtle-note">Deterministic extraction</span>
            </div>
            <article
              class="finding-row"
              v-for="finding in current.findings"
              :key="finding.id"
            >
              <Info :size="18" />
              <div>
                <h3>{{ finding.title }}</h3>
                <p>{{ finding.detail }}</p>
              </div>
              <button
                v-if="finding.sourceRefs?.length"
                class="source-link"
                @click="inspectSources(finding.sourceRefs)"
              >
                View source <ArrowUpRight :size="13" />
              </button>
            </article>
          </section>
        </template>

        <template v-if="tab === 'timeline'">
          <div class="plan-toolbar">
            <div>
              <label for="timeline-plan" class="eyebrow">Viewing plan</label
              ><select
                id="timeline-plan"
                :value="selectedScenario.id"
                @change="selectScenario($event.target.value)"
              >
                <option
                  v-for="scenario in scenarios"
                  :key="scenario.id"
                  :value="scenario.id"
                >
                  {{ scenario.name }}
                </option>
              </select>
            </div>
            <div class="plan-finish">
              <span>{{
                scenarioMode ? "Scenario finish" : "Baseline finish"
              }}</span
              ><strong>{{ prettyDate(result.finishDate) }}</strong>
            </div>
            <button
              class="button"
              @click="scenarioMode ? navigate('scenarios') : forkScenario()"
            >
              <GitBranch :size="17" />{{
                scenarioMode ? "Adjust scenario" : "Fork a scenario"
              }}
            </button>
          </div>
          <div class="notice gentle-notice">
            <Info :size="19" />
            <div>
              <strong>{{
                scenarioMode
                  ? "You are viewing a planning scenario."
                  : "This is the source-defined baseline."
              }}</strong>
              Bars show estimated elapsed work. Real permissions depend on
              verified evidence and authorized approvals.
            </div>
          </div>
          <section class="panel timeline-panel">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">Dependency map</span>
                <h2>
                  {{ result.totalWorkingDays ?? "—" }} working days in this plan
                </h2>
              </div>
              <div class="timeline-legend">
                <span><i class="legend-dot critical"></i> Critical path</span
                ><span><i class="legend-dot"></i> Other work</span>
              </div>
            </div>
            <div v-if="result.tasks?.length" class="gantt-scroll">
              <div class="gantt">
                <div class="gantt-heading">
                  <span>Step / owner</span>
                  <div class="gantt-scale">
                    <span>Day 0</span
                    ><span>Day {{ Math.round(taskMax / 2) }}</span
                    ><span>Day {{ taskMax }}</span>
                  </div>
                  <span>Workdays</span>
                </div>
                <button
                  v-for="task in result.tasks"
                  :key="task.id"
                  class="gantt-row"
                  @click="openModal('task', task)"
                >
                  <span class="gantt-task"
                    ><strong
                      ><CheckCircle2 v-if="task.completed" :size="16" />{{
                        task.title
                      }}</strong
                    ><small>{{ task.owner }}</small></span
                  ><span class="gantt-track"
                    ><span
                      class="gantt-bar"
                      :class="{
                        critical: task.critical,
                        complete: task.completed,
                        assumed: task.projectedCompleted && !task.completed,
                      }"
                      :style="{
                        left: `${((task.startOffset || 0) / taskMax) * 100}%`,
                        width: `${Math.max(task.completed ? 1.5 : 2, ((task.effectiveDuration || 0) / taskMax) * 100)}%`,
                      }"
                      ><span v-if="task.effectiveDuration > 2"
                        >{{ task.effectiveDuration }}d</span
                      ></span
                    ></span
                  ><span class="gantt-duration"
                    >{{ task.completed ? "Done" : task.effectiveDuration
                    }}<ChevronRight :size="14"
                  /></span>
                </button>
              </div>
            </div>
            <div v-else class="empty-state">
              <CalendarDays :size="30" />
              <h3>No timeline yet</h3>
              <p>Add source-defined tasks with durations and dependencies.</p>
              <button class="button" @click="editDocument()">
                Add source tasks
              </button>
            </div>
            <div class="panel-footnote">
              <Clock3 :size="15" /><span
                >Monday–Friday only. A five-day task starting Monday finishes at
                the following Monday boundary. Holidays are excluded.</span
              >
            </div>
          </section>
          <section class="panel timeline-register">
            <div class="panel-heading">
              <h2>Dependencies & permissions</h2>
              <span class="subtle-note"
                >Click a step above for its sources</span
              >
            </div>
            <article
              v-for="task in result.tasks"
              :key="task.id"
              class="dependency-row"
            >
              <div>
                <h3>{{ task.title }}</h3>
                <p>
                  {{
                    task.effectiveDependsOn?.length
                      ? `Follows: ${task.effectiveDependsOn.map(taskName).join("; ")}`
                      : "No preceding task in this plan"
                  }}
                </p>
              </div>
              <div>
                <span
                  class="status-badge small"
                  :class="
                    task.completed
                      ? 'good'
                      : task.available
                        ? 'good'
                        : 'neutral'
                  "
                  >{{
                    task.completed
                      ? "Complete"
                      : task.available
                        ? "Can start"
                        : "Waiting"
                  }}</span
                ><small
                  >{{ prettyDate(task.startDate) }} →
                  {{ prettyDate(task.finishDate) }}</small
                >
              </div>
            </article>
          </section>
        </template>

        <template v-if="tab === 'scenarios'">
          <div class="notice gentle-notice">
            <GitBranch :size="20" />
            <div>
              <strong>Explore the plan. Preserve the record.</strong>
              Assumptions affect this model only. They never verify a
              certificate, approve a role, or activate access.
            </div>
          </div>
          <div class="scenario-layout">
            <aside class="scenario-sidebar">
              <div class="small-heading">
                <h2>Your plans</h2>
                <button
                  class="icon-button"
                  aria-label="Fork a scenario"
                  @click="forkScenario"
                >
                  <Plus :size="19" />
                </button>
              </div>
              <button
                v-for="scenario in scenarios"
                :key="scenario.id"
                class="scenario-choice"
                :class="{ active: selectedScenario.id === scenario.id }"
                @click="selectScenario(scenario.id)"
              >
                <span class="scenario-choice-icon"
                  ><ListChecks
                    v-if="scenario.id === baseline.id"
                    :size="18" /><GitBranch v-else :size="18" /></span
                ><span
                  ><strong>{{ scenario.name }}</strong
                  ><small>{{
                    scenario.id === baseline.id
                      ? "Source-defined baseline"
                      : "Planning scenario"
                  }}</small></span
                ></button
              ><button class="button scenario-fork" @click="forkScenario">
                <Plus :size="16" /> Fork selected plan
              </button>
              <p class="micro-note">
                All plans share the same current evidence. A fork keeps its own
                timing and assumptions.
              </p>
            </aside>
            <div class="scenario-main">
              <div class="section-heading scenario-title">
                <div>
                  <span class="eyebrow">{{
                    scenarioMode ? "Scenario" : "Baseline"
                  }}</span>
                  <h2>{{ selectedScenario.name }}</h2>
                  <p>{{ selectedScenario.description }}</p>
                </div>
                <div v-if="scenarioMode" class="inline-actions">
                  <button
                    class="icon-button"
                    aria-label="Rename scenario"
                    @click="renameScenario"
                  >
                    <Pencil :size="17" /></button
                  ><button
                    class="icon-button"
                    aria-label="Delete scenario"
                    @click="deleteScenario"
                  >
                    <Trash2 :size="17" />
                  </button>
                </div>
              </div>
              <div class="comparison-grid">
                <article class="comparison-card">
                  <span class="eyebrow">Source-defined baseline</span
                  ><strong
                    >{{
                      result.comparison?.baselineDays ??
                      current.totalWorkingDays ??
                      "—"
                    }}<small>working days</small></strong
                  >
                  <p>
                    {{
                      prettyDate(
                        result.comparison?.baselineFinishDate ||
                          current.finishDate,
                      )
                    }}
                  </p>
                </article>
                <article class="comparison-card selected">
                  <span class="eyebrow">{{
                    scenarioMode ? "Selected scenario" : "Current plan"
                  }}</span
                  ><strong
                    >{{ result.totalWorkingDays ?? "—"
                    }}<small>working days</small></strong
                  >
                  <p>{{ prettyDate(result.finishDate) }}</p>
                </article>
              </div>
              <div
                class="comparison-delta"
                v-if="scenarioMode && result.comparison"
              >
                <GitBranch :size="18" /><span
                  >{{
                    result.comparison.daysSaved > 0
                      ? `${result.comparison.daysSaved} fewer modelled working days`
                      : result.comparison.daysSaved < 0
                        ? `${Math.abs(result.comparison.daysSaved)} additional modelled working days`
                        : "No timing difference from the baseline"
                  }}<small
                    >A comparison of assumptions, not measured time
                    savings.</small
                  ></span
                >
              </div>
              <section v-if="!scenarioMode" class="panel baseline-explainer">
                <ShieldCheck :size="29" />
                <h3>The baseline follows your source documents.</h3>
                <p>
                  Fork this plan to explore delays, supported parallel
                  preparation, or assumed evidence. Edit source documents to
                  change the actual requirements or baseline sequence.
                </p>
                <button class="button primary-button" @click="forkScenario">
                  <GitBranch :size="17" /> Create a scenario
                </button>
              </section>
              <template v-else
                ><section class="panel scenario-controls">
                  <div class="panel-heading">
                    <div>
                      <span class="eyebrow">Preparation policy</span>
                      <h2>Move preparation into the wait</h2>
                    </div>
                  </div>
                  <label
                    class="policy-option"
                    v-for="policy in result.policyOptions"
                    :key="policy.id"
                    ><input
                      type="checkbox"
                      :checked="policyEnabled(policy)"
                      @change="
                        togglePolicy(policy, $event.target.checked)
                      " /><span
                      ><strong>{{ policy.title }}</strong>
                      <p>{{ policy.description }}</p>
                      <button
                        type="button"
                        class="source-link"
                        @click.prevent="inspectSources(policy.sourceRefs)"
                      >
                        Read policy grounds
                        <ArrowUpRight :size="13" /></button></span
                  ></label>
                  <p v-if="!result.policyOptions?.length" class="empty-copy">
                    No preparation policy is defined in these sources. Add a
                    source-backed policy before changing task dependencies.
                  </p>
                </section>
                <section class="panel scenario-controls">
                  <div class="panel-heading">
                    <div>
                      <span class="eyebrow">Timing adjustments</span>
                      <h2>Allow for additional workdays</h2>
                    </div>
                    <SlidersHorizontal :size="20" class="muted-icon" />
                  </div>
                  <div
                    v-for="task in result.tasks"
                    :key="task.id"
                    class="delay-row"
                  >
                    <div>
                      <label :for="`delay-${task.id}`">{{ task.title }}</label
                      ><small
                        >{{ task.owner }} · source duration
                        {{ task.duration }}d</small
                      >
                    </div>
                    <div class="delay-input">
                      <span>+</span
                      ><input
                        :id="`delay-${task.id}`"
                        :value="selectedScenario.taskDelays?.[task.id] || 0"
                        type="number"
                        min="0"
                        max="60"
                        @input="setDelay(task.id, $event.target.value)"
                      /><span>days</span>
                    </div>
                  </div>
                </section>
                <section class="panel scenario-controls">
                  <div class="panel-heading">
                    <div>
                      <span class="eyebrow">Explicit assumptions</span>
                      <h2>Assume a requirement is satisfied</h2>
                    </div>
                  </div>
                  <label
                    class="assumption-row"
                    v-for="requirement in requirements.filter(
                      (r) => !r.satisfied,
                    )"
                    :key="requirement.id"
                    ><input
                      type="checkbox"
                      :checked="
                        selectedScenario.assumedRequirementIds?.includes(
                          requirement.id,
                        )
                      "
                      @change="
                        toggleAssumption(requirement.id, $event.target.checked)
                      "
                    /><span
                      ><strong>{{ requirement.title }}</strong
                      ><small
                        >Actual state:
                        {{ stateLabels[requirement.effectiveStatus] }} · model
                        as {{ requirement.requiredState }}</small
                      ></span
                    ><span class="status-badge small neutral"
                      >Assumption</span
                    ></label
                  >
                  <div class="panel-footnote">
                    <Info :size="15" /><span
                      >The current evidence register and real action permissions
                      are unchanged.</span
                    >
                  </div>
                </section>
                <section class="panel changes-panel">
                  <div class="panel-heading">
                    <h2>What changed in this fork</h2>
                    <button class="text-button" @click="resetScenario">
                      <RotateCcw :size="14" /> Reset adjustments
                    </button>
                  </div>
                  <div v-if="!scenarioChanges.length" class="empty-copy">
                    This fork currently matches the baseline. Adjust a delay,
                    preparation policy, or assumption to compare another path.
                  </div>
                  <div
                    v-for="(change, index) in scenarioChanges"
                    :key="index"
                    class="change-row"
                  >
                    <span>{{ change.label }}</span
                    ><strong>{{ change.detail }}</strong>
                  </div>
                </section></template
              >
            </div>
          </div>
        </template>

        <template v-if="tab === 'packet'">
          <div class="packet-topline">
            <span class="status-badge neutral"
              ><FileText :size="14" />Live preparation packet</span
            >
            <p>
              Includes all source documents, review decisions, plan assumptions,
              and scenarios.
            </p>
            <button class="button" @click="printPacket">
              <ClipboardCheck :size="16" /> Print packet
            </button>
          </div>
          <article class="packet-document">
            <header class="packet-cover">
              <span class="eyebrow"
                >Trial Researcher / Research team preparation</span
              >
              <h2>{{ projectTitle }}</h2>
              <p>
                {{ researcherName }} ·
                {{ project.person?.role || "Research team member" }}<br />{{
                  project.person?.institution
                }}
              </p>
              <dl>
                <div>
                  <dt>Plan</dt>
                  <dd>{{ selectedScenario.name }}</dd>
                </div>
                <div>
                  <dt>Evidence status</dt>
                  <dd>
                    {{ verified }} / {{ requirements.length }} requirements
                    satisfied
                  </dd>
                </div>
                <div>
                  <dt>Modelled finish</dt>
                  <dd>{{ prettyDate(result.finishDate) }}</dd>
                </div>
              </dl>
            </header>
            <section class="packet-section">
              <h3>Readiness decision</h3>
              <p>
                {{
                  allReady
                    ? "All source-defined requirements are satisfied in the recorded evidence."
                    : "Study duties are not yet ready. The following requirements still need evidence or a human review decision."
                }}
              </p>
              <ul>
                <li
                  v-for="req in requirements.filter((r) => !r.satisfied)"
                  :key="req.id"
                >
                  <strong>{{ req.title }}</strong> — {{ req.owner }}. Current:
                  {{ req.effectiveStatus }}; required: {{ req.requiredState }}.
                </li>
              </ul>
              <p class="packet-caveat">
                This packet supports team preparation. It does not grant
                institutional permission, replace an authorized reviewer, or
                guarantee a completion date.
              </p>
            </section>
            <section class="packet-section">
              <h3>Actions and owners · {{ selectedScenario.name }}</h3>
              <article
                class="packet-action"
                v-for="action in result.actions"
                :key="action.id"
              >
                <strong>{{ action.title }}</strong
                ><span>{{ action.owner }} · {{ action.state }}</span>
                <p>{{ action.reason }}</p>
                <button
                  v-if="action.sourceRefs?.length"
                  class="source-link"
                  @click="inspectSources(action.sourceRefs)"
                >
                  Source: {{ sourceName(action.sourceRefs[0]) }}, line
                  {{ action.sourceRefs[0].line }} <ArrowUpRight :size="12" />
                </button>
              </article>
            </section>
            <section class="packet-section">
              <h3>Evidence and review register</h3>
              <article
                class="packet-action"
                v-for="req in requirements"
                :key="req.id"
              >
                <strong
                  >{{ req.title }}
                  <span
                    class="status-badge small"
                    :class="statusClass(req.effectiveStatus)"
                    >{{ stateLabels[req.effectiveStatus] }}</span
                  ></strong
                ><span
                  >{{ req.owner }} · required {{ req.requiredState }} ·
                  {{ req.code }}</span
                >
                <p>
                  {{
                    req.reviewerNote || "No human confirmation note recorded."
                  }}
                </p>
                <p v-if="req.notes">Working note: {{ req.notes }}</p>
                <button
                  v-for="(source, index) in [
                    ...(req.sourceRefs || []),
                    ...(req.evidenceRefs || []),
                  ]"
                  :key="index"
                  class="packet-source-line"
                  @click="inspectSources([source])"
                >
                  {{ sourceName(source) }} · line {{ source.line
                  }}<q>{{ source.quote }}</q>
                </button>
              </article>
            </section>
            <section class="packet-section">
              <h3>Selected plan and assumptions</h3>
              <p>
                {{ selectedScenario.name }} ·
                {{ result.totalWorkingDays ?? "Unspecified" }} working days ·
                {{ prettyDate(project.startDate) }} →
                {{ prettyDate(result.finishDate) }}
              </p>
              <ul>
                <li v-for="change in scenarioChanges" :key="change.label">
                  {{ change.label }} — {{ change.detail }}
                </li>
                <li v-if="!scenarioChanges.length">
                  No adjustments to the source-defined baseline.
                </li>
              </ul>
              <div
                class="packet-task"
                v-for="task in result.tasks"
                :key="task.id"
              >
                <strong>{{ task.title }}</strong
                ><span
                  >{{ task.owner }} · {{ task.effectiveDuration }}d ·
                  {{ prettyDate(task.startDate) }} →
                  {{ prettyDate(task.finishDate) }}</span
                >
                <p>
                  Dependencies:
                  {{
                    task.effectiveDependsOn?.length
                      ? task.effectiveDependsOn.map(taskName).join("; ")
                      : "None"
                  }}.
                  {{
                    task.critical
                      ? "On the modelled critical path."
                      : `Slack: ${task.slack} working days.`
                  }}
                </p>
              </div>
            </section>
            <section class="packet-section">
              <h3>Role review</h3>
              <div
                class="packet-action"
                v-for="review in current.roleReviews"
                :key="review.id"
              >
                <strong>{{ review.role }} — {{ review.title }}</strong>
                <p>{{ review.summary }}</p>
              </div>
              <p class="packet-caveat">
                Generated by deterministic source and dependency rules. These
                are advisory checkpoints, not independent human reviews.
              </p>
            </section>
            <section class="packet-section">
              <h3>All scenario forks</h3>
              <div
                v-for="scenario in scenarios"
                :key="scenario.id"
                class="packet-action"
              >
                <strong>{{ scenario.name }}</strong>
                <p>{{ scenario.description }}</p>
                <span
                  >{{
                    Object.keys(scenario.taskDelays || {}).filter(
                      (id) => scenario.taskDelays[id] > 0,
                    ).length
                  }}
                  timing adjustments ·
                  {{ scenario.assumedRequirementIds?.length || 0 }} evidence
                  assumptions</span
                >
              </div>
            </section>
            <section class="packet-section">
              <h3>Source documents</h3>
              <details
                v-for="doc in project.documents"
                :key="doc.id"
                class="packet-source-document"
              >
                <summary>
                  <FileText :size="16" />{{ doc.name
                  }}<span>{{ doc.text.split("\n").length }} lines</span>
                </summary>
                <pre>{{ doc.text }}</pre>
              </details>
            </section>
            <section v-if="current.findings?.length" class="packet-section">
              <h3>Open source checks</h3>
              <p v-for="finding in current.findings" :key="finding.id">
                <strong>{{ finding.title }}.</strong> {{ finding.detail }}
              </p>
            </section>
            <footer class="packet-document-footer">
              <span>Prepared with Trial Researcher.</span
              ><span>Source-linked. Human-reviewed. Locally saved.</span>
            </footer>
          </article>
        </template>
        <section
          v-if="!result.valid"
          class="notice error-notice model-error"
          role="alert"
        >
          <Info :size="20" />
          <div>
            <strong
              >Correct the source model before relying on this plan.</strong
            >
            <p v-for="error in result.errors" :key="error">{{ error }}</p>
            <button class="text-button" @click="navigate('evidence')">
              Review source documents <ArrowRight :size="15" />
            </button>
          </div>
        </section>
        <footer class="workspace-footer">
          <span
            ><ShieldCheck :size="14" /> Your documents stay on this
            device.</span
          ><span>Readiness support · Human authorization required</span>
        </footer>
      </main>
    </div>

    <div v-if="toast" class="toast" role="status">
      <CheckCircle2 :size="18" /><span>{{ toast }}</span
      ><button v-if="undoSnapshot" @click="undo">Undo</button
      ><button
        class="icon-button"
        aria-label="Dismiss notice"
        @click="
          toast = '';
          undoSnapshot = null;
        "
      >
        <X :size="16" />
      </button>
    </div>

    <AppModal
      v-if="modal === 'requirement'"
      title="Review requirement"
      @close="closeModal"
      ><div class="modal-kicker">{{ form.code }} / {{ form.kind }}</div>
      <h3 class="modal-feature-title">{{ form.title }}</h3>
      <div class="requirement-ground">
        <span>Required gate</span
        ><strong>{{ stateLabels[form.requiredState] }}</strong
        ><button
          v-if="form.sourceRefs?.length"
          class="source-link"
          @click="inspectSources(form.sourceRefs)"
        >
          Read requirement <ArrowUpRight :size="13" />
        </button>
      </div>
      <form
        id="requirement-form"
        class="form-stack"
        @submit.prevent="saveRequirement"
      >
        <label>Responsible owner<input v-model="form.owner" required /></label
        ><label
          >Recorded evidence state<select v-model="form.status">
            <option v-for="state in statuses" :key="state" :value="state">
              {{ stateLabels[state] }}
            </option>
          </select></label
        >
        <div class="inline-evidence">
          <FileCheck2 :size="18" /><span
            >{{ form.evidenceRefs?.length || 0 }} matching evidence
            {{
              form.evidenceRefs?.length === 1 ? "record" : "records"
            }}
            available.</span
          ><button
            v-if="form.evidenceRefs?.length"
            type="button"
            class="source-link"
            @click="inspectSources(form.evidenceRefs)"
          >
            Inspect evidence
          </button>
        </div>
        <label
          >Human reviewer note
          <span class="label-hint">{{
            ["verified", "approved", "active"].includes(form.status)
              ? "Required for confirmation"
              : "Optional"
          }}</span
          ><textarea
            v-model="form.reviewerNote"
            :required="['verified', 'approved', 'active'].includes(form.status)"
            rows="4"
            placeholder="Who reviewed the record, what was checked, and why this state is supported."
          /></label
        ><label
          >Working notes<textarea
            v-model="form.notes"
            rows="2"
            placeholder="Context, follow-up, or a handoff note"
          />
        </label>
        <p class="micro-note">
          A confirmation requires matching evidence and a review note. Changing
          the source or evidence revokes affected confirmations.
        </p>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      </form>
      <template #footer
        ><button class="button" @click="closeModal">Cancel</button
        ><button
          class="button primary-button"
          type="submit"
          form="requirement-form"
        >
          <Check :size="16" /> Save review decision
        </button></template
      ></AppModal
    >

    <AppModal
      v-if="modal === 'source'"
      title="Source document"
      drawer
      @close="closeModal"
      ><template v-if="sourceDoc"
        ><div class="source-drawer-heading">
          <span class="document-icon"><FileText :size="24" /></span>
          <div>
            <h3>{{ sourceDoc.name }}</h3>
            <p>{{ sourceDoc.kind }} · {{ sourceLines.length }} lines</p>
          </div>
        </div>
        <label class="source-select-label"
          >Document<select v-model="sourceDocumentId">
            <option
              v-for="doc in project.documents"
              :key="doc.id"
              :value="doc.id"
            >
              {{ doc.name }}
            </option>
          </select></label
        >
        <div v-if="sourceRefs.length" class="source-evidence-note">
          <BookOpen :size="16" /><span
            >Referenced passages are highlighted. Line numbers match the stored
            source text.</span
          >
        </div>
        <div
          class="source-lines"
          tabindex="0"
          aria-label="Document text with line numbers"
        >
          <div
            v-for="line in sourceLines"
            :key="line.number"
            class="source-line"
            :class="{ highlighted: isHighlighted(line.number) }"
          >
            <span class="line-number">{{ line.number }}</span
            ><span>{{ line.text || " " }}</span>
          </div>
        </div>
        <div class="source-drawer-actions">
          <button class="button" @click="openOriginal">
            <ExternalLink :size="16" />{{
              originalUrls.has(sourceDoc.id) ||
              !["pdf", "docx"].includes(sourceDoc.format)
                ? "Open original document"
                : "Open extracted text"
            }}</button
          ><button class="button" @click="downloadSource">
            <Download :size="16" /> Download text</button
          ><button class="button" @click="editDocument(sourceDoc)">
            <Pencil :size="16" /> Edit source
          </button>
        </div>
        <p v-if="['pdf', 'docx'].includes(sourceDoc.format)" class="micro-note">
          Original uploads can be opened during this session. Extracted text is
          retained for local saving and source references.
        </p></template
      >
      <div v-else class="empty-state">
        <FileText :size="30" />
        <h3>This source is unavailable</h3>
        <p>It may have been removed. Add or restore the source document.</p>
      </div></AppModal
    >

    <AppModal
      v-if="modal === 'new'"
      title="Create a workspace"
      @close="closeModal"
      ><p class="modal-description">
        Start with a fictional case or bring your team’s own source documents.
      </p>
      <div class="sample-options">
        <label :class="{ selected: form.kind === 'rest' }"
          ><input v-model="form.kind" type="radio" value="rest" /><span
            ><strong>Alex · REST-101</strong
            ><small
              >Study-specific training, delegation, and system access</small
            ></span
          ><span class="status-badge small neutral">Sample</span></label
        ><label :class="{ selected: form.kind === 'aurora' }"
          ><input v-model="form.kind" type="radio" value="aurora" /><span
            ><strong>Jordan · AURORA-22</strong
            ><small
              >Biospecimen training, lab approval, and LIMS access</small
            ></span
          ><span class="status-badge small neutral">Sample</span></label
        ><label :class="{ selected: form.kind === 'empty' }"
          ><input v-model="form.kind" type="radio" value="empty" /><span
            ><strong>A blank workspace</strong
            ><small
              >Add your own researcher, requirements, and evidence</small
            ></span
          ></label
        >
      </div>
      <label class="standalone-label"
        >Workspace name <span class="label-hint">Optional</span
        ><input
          v-model="form.name"
          placeholder="Use the default name"
          @keyup.enter="createNewProject" /></label
      ><template #footer
        ><button class="button" @click="closeModal">Cancel</button
        ><button class="button primary-button" @click="createNewProject">
          Create workspace <ArrowRight :size="16" /></button></template
    ></AppModal>

    <AppModal
      v-if="modal === 'profile'"
      title="Your profile"
      @close="closeModal"
      ><div class="profile-modal-intro">
        <span class="avatar large">{{ profileInitials }}</span>
        <div>
          <h3>Your research workspace</h3>
          <p>A local profile for ownership and handoffs.</p>
        </div>
      </div>
      <form id="profile-form" class="form-stack" @submit.prevent="saveProfile">
        <label>Display name<input v-model="form.name" required /></label
        ><label
          >Role<input
            v-model="form.role"
            placeholder="Research coordinator" /></label
        ><label
          >Organization<input
            v-model="form.organization"
            placeholder="Your institution or team"
        /></label>
        <div class="notice gentle-notice">
          <ShieldCheck :size="18" />
          <p>
            Your profile and documents are saved in this browser. Export JSON to
            transfer or back up a project.
          </p>
        </div>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      </form>
      <template #footer
        ><button class="button" @click="closeModal">Cancel</button
        ><button
          class="button primary-button"
          type="submit"
          form="profile-form"
        >
          Save profile
        </button></template
      ></AppModal
    >

    <AppModal
      v-if="modal === 'project'"
      title="Workspace details"
      @close="closeModal"
      ><form id="project-form" class="form-stack" @submit.prevent="saveProject">
        <label>Workspace name<input v-model="form.name" required /></label
        ><label
          >Researcher name<input v-model="form.researcher" required
        /></label>
        <div class="form-columns">
          <label
            >Planning start<input
              v-model="form.startDate"
              type="date"
              required /></label
          ><label
            >Team target<input v-model="form.targetDate" type="date"
          /></label>
        </div>
        <p class="micro-note">
          Dates set a working-day planning window. Changing them does not affect
          evidence or permissions.
        </p>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      </form>
      <div class="danger-zone">
        <div>
          <strong>Remove this workspace</strong>
          <p>The removal can be undone immediately.</p>
        </div>
        <button class="button danger-button" @click="deleteProject">
          <Trash2 :size="15" /> Remove
        </button>
      </div>
      <template #footer
        ><button class="button" @click="closeModal">Cancel</button
        ><button
          class="button primary-button"
          type="submit"
          form="project-form"
        >
          Save details
        </button></template
      ></AppModal
    >

    <AppModal
      v-if="modal === 'fork' || modal === 'rename'"
      :title="modal === 'fork' ? 'Fork a planning scenario' : 'Rename scenario'"
      @close="closeModal"
      ><p class="modal-description">
        {{
          modal === "fork"
            ? `Start from “${selectedScenario.name}”. Explore changes with a separate set of assumptions.`
            : "Give this planning path a useful name and description."
        }}
      </p>
      <form
        id="scenario-form"
        class="form-stack"
        @submit.prevent="modal === 'fork' ? saveFork() : saveRename()"
      >
        <label>Scenario name<input v-model="form.name" required /></label
        ><label
          >Planning question<textarea
            v-model="form.description"
            rows="3"
            placeholder="What would you like this scenario to explore?"
          />
        </label>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      </form>
      <template #footer
        ><button class="button" @click="closeModal">Cancel</button
        ><button
          class="button primary-button"
          type="submit"
          form="scenario-form"
        >
          <GitBranch :size="16" />{{
            modal === "fork" ? "Create scenario" : "Save name"
          }}
        </button></template
      ></AppModal
    >

    <AppModal
      v-if="modal === 'document'"
      :title="editingId ? 'Edit source document' : 'Add source document'"
      wide
      @close="closeModal"
      ><form
        id="document-form"
        class="form-stack"
        @submit.prevent="saveDocument"
      >
        <div class="form-columns">
          <label
            >Document name<input
              v-model="form.name"
              required
              placeholder="Study onboarding requirements.txt" /></label
          ><label
            >Document type<select v-model="form.kind">
              <option value="source">Source document</option>
              <option value="protocol">Protocol / requirements</option>
              <option value="workflow">Workflow / timing</option>
              <option value="policy">Preparation policy</option>
              <option value="evidence">Evidence record</option>
              <option value="notes">Working notes</option>
            </select></label
          >
        </div>
        <div class="editor-label">
          <label for="source-text">Source text</label
          ><button type="button" class="text-button" @click="insertTemplate">
            <FilePlus2 :size="15" /> Insert structured example
          </button>
        </div>
        <textarea
          id="source-text"
          v-model="form.text"
          class="source-editor"
          rows="15"
          required
          spellcheck="false"
          placeholder="Paste source text here. Use a structured example to define requirements, tasks, and evidence."
        />
        <details class="syntax-help">
          <summary>How source extraction works</summary>
          <p>
            Readable lines beginning with <code>Requirement</code>,
            <code>Task</code>, <code>Policy</code>, or
            <code>Evidence</code> define the plan. Fields are separated by
            <code>|</code>. Other passages remain available as context and are
            flagged for review.
          </p>
          <pre>
Requirement | id=training | title=Study training | code=TRAINING | owner=Alex | state=verified
Task | id=review | title=Review training | owner=Coordinator | days=2 | after= | requires=training | completes=training | state=verified
Evidence | code=TRAINING | state=received | title=Training certificate
Policy | id=prep | title=Prepare while waiting | parallel=prepare-forms | description=Preparation only</pre
          >
          <p>
            Task <code>after</code> values are task IDs.
            <code>requires</code> and <code>completes</code> use requirement
            IDs. Evidence <code>code</code> must exactly match the requirement’s
            code.
          </p>
        </details>
        <p class="micro-note">
          Saving re-extracts the plan and invalidates any human confirmation
          whose source or evidence changed.
        </p>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      </form>
      <template #footer
        ><button
          v-if="editingId"
          class="button danger-button"
          @click="removeDocument(form)"
        >
          <Trash2 :size="16" /> Delete source</button
        ><span class="footer-spacer"></span
        ><button class="button" @click="closeModal">Cancel</button
        ><button
          class="button primary-button"
          type="submit"
          form="document-form"
        >
          Save source
        </button></template
      ></AppModal
    >

    <AppModal
      v-if="modal === 'request'"
      title="Request the missing evidence"
      wide
      @close="closeModal"
      ><p class="modal-description">
        A draft to copy into your team’s usual channel. Edit it before sending.
      </p>
      <textarea
        v-model="form.text"
        class="request-editor"
        rows="15"
        aria-label="Evidence request draft"
      />
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <template #footer
        ><button class="button" @click="closeModal">Close</button
        ><button class="button primary-button" @click="copyText(form.text)">
          <Copy :size="16" /> Copy request
        </button></template
      ></AppModal
    >

    <AppModal v-if="modal === 'task'" title="Step details" @close="closeModal"
      ><span class="eyebrow">{{
        form.preparation ? "Preparation" : "Readiness gate"
      }}</span>
      <h3 class="modal-feature-title">{{ form.title }}</h3>
      <dl class="task-detail-list">
        <div>
          <dt>Responsible owner</dt>
          <dd>{{ form.owner }}</dd>
        </div>
        <div>
          <dt>Working days</dt>
          <dd>{{ form.effectiveDuration }} (source: {{ form.duration }})</dd>
        </div>
        <div>
          <dt>Planning window</dt>
          <dd>
            {{ prettyDate(form.startDate) }} → {{ prettyDate(form.finishDate) }}
          </dd>
        </div>
        <div>
          <dt>Critical path</dt>
          <dd>
            {{ form.critical ? "Yes" : `No · ${form.slack} days of slack` }}
          </dd>
        </div>
        <div>
          <dt>Current permission</dt>
          <dd>
            {{
              form.completed
                ? "Completed against current evidence"
                : form.available
                  ? "Can begin with current evidence"
                  : "Waiting on prerequisites"
            }}
          </dd>
        </div>
      </dl>
      <div v-if="form.effectiveDependsOn?.length" class="task-blockers">
        <h4>Preceding steps</h4>
        <ul>
          <li v-for="id in form.effectiveDependsOn" :key="id">
            {{ taskName(id) }}
          </li>
        </ul>
      </div>
      <div v-if="form.requirementIds?.length" class="task-blockers">
        <h4>Evidence gates</h4>
        <ul>
          <li v-for="id in form.requirementIds" :key="id">
            {{ requirementName(id) }}
          </li>
        </ul>
      </div>
      <button
        v-if="form.sourceRefs?.length"
        class="button"
        @click="inspectSources(form.sourceRefs)"
      >
        <BookOpen :size="16" /> Inspect or edit source timing</button
      ><template #footer
        ><button class="button" @click="closeModal">Close</button
        ><button
          class="button primary-button"
          @click="
            closeModal();
            scenarioMode ? navigate('scenarios') : forkScenario();
          "
        >
          <GitBranch :size="16" /> Explore timing
        </button></template
      ></AppModal
    >
  </div>
</template>
