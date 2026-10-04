<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import AppIcon from "./components/AppIcon.vue";
import LookaheadLogo from "./components/LookaheadLogo.vue";
import LookaheadIntro from "./components/LookaheadIntro.vue";
import SimulationGraph from "./components/SimulationGraph.vue";
import BottleneckTimeline from "./components/BottleneckTimeline.vue";
import DocumentPreflight from "./components/DocumentPreflight.vue";
import ResearcherLogin from "./components/ResearcherLogin.vue";
import SampleCaseGraph from "./components/SampleCaseGraph.vue";
import NewSimulationDialog from "./components/NewSimulationDialog.vue";
import WorkspaceModeToggle from "./components/WorkspaceModeToggle.vue";
import StatusIcon from "./components/StatusIcon.vue";
import UniversityIRBPanel from "./components/UniversityIRBPanel.vue";
import UniversitySimulationPreview from "./components/UniversitySimulationPreview.vue";
import { useResearcherAccount } from "./composables/useResearcherAccount.js";
import { useResearcherProfile } from "./composables/useResearcherProfile.js";
import { useInstitutionProfile } from "./composables/useInstitutionProfile.js";
import { institutionSnapshotMatches, prepareInstitutionSimulationContext } from "./lib/institutionProfile.js";
import { useSimulationWorkspace } from "./composables/useSimulationWorkspace.js";
import { PROMPT_LIMIT, TITLE_LIMIT, STORAGE_KEY } from "./lib/simulationWorkspace.js";
import { workspaceStorageKey } from "./lib/workspaceStorage.js";
import { canonicalWorkspaceHash, workspacePage } from "./lib/workspaceNavigation.js";
import { normalizeSimulationContext } from "./lib/simulationContext.js";

const ResearchTools = defineAsyncComponent(() => import('./components/ResearchTools.vue'));

const { account, busy: accountBusy, error: accountError, ready: providerReady, openaiReady, anthropicReady, google, connect, disconnect, connectAnthropic, disconnectAnthropic, signout } = useResearcherAccount();
const { university, universityError, saveUniversity } = useResearcherProfile(account);
const { profile: universityProfile, token: universityToken, state: institutionState, error: institutionError, provider: institutionProvider, refresh: refreshInstitution } = useInstitutionProfile(account, university);
const institutionSnapshot = computed(() => ({ university: university.value, profile: universityProfile.value, token: universityToken.value, state: institutionState.value, error: institutionError.value, provider: institutionProvider.value }));
let savedWorkspaceKind = "demo";
try { if (sessionStorage.getItem("microfish.workspace-choice.v1") === "personal") savedWorkspaceKind = "personal"; } catch { /* Navigation also works without browser storage. */ }
const workspaceKind = ref(savedWorkspaceKind);
const storageIdentity = computed(() => workspaceKind.value === "personal" ? account.user?.id || account.user?.email || null : null);
const simulationStorageKey = computed(() => workspaceStorageKey(STORAGE_KEY, storageIdentity.value));
const timelineStorageKey = computed(() => workspaceStorageKey("microfish.bottleneck-timeline.v1", storageIdentity.value));
const preflightStorageKey = computed(() => workspaceStorageKey("microfish.document-preflight.v1", storageIdentity.value));
function chooseWorkspace(kind) {
  workspaceKind.value = kind;
  search.value = "";
  submitError.value = "";
  try { sessionStorage.setItem("microfish.workspace-choice.v1", kind); } catch { /* Keep the selected workspace for this visit. */ }
}

const {
  sessions,
  activeSession,
  activeId,
  runningCount,
  storageWarning,
  createSession,
  setSessionContext,
  selectSession,
  renameSession,
  deleteSession,
  startRun,
  startOpenAIRun,
  startAnthropicRun,
  stopRun,
} = useSimulationWorkspace({ storageKey: simulationStorageKey });
const runMode = ref("demo");
const selectedProviderReady = computed(() => runMode.value === "openai" ? openaiReady.value : runMode.value === "anthropic" ? anthropicReady.value : false);
const connectionLabel = computed(() => openaiReady.value && anthropicReady.value ? "OpenAI + Anthropic connected" : openaiReady.value ? "OpenAI connected" : anthropicReady.value ? "Anthropic connected" : "Connect AI");
const providerName = mode => mode === "anthropic" ? "Anthropic" : mode === "openai" ? "OpenAI" : "Demo";
const isAIRun = run => run?.mode === "openai" || run?.mode === "anthropic";
const loginPage = ref(null);
function enterWorkspace(mode) {
  if (!account.user || !university.value) return;
  chooseWorkspace("personal");
  runMode.value = mode;
  navigate("simulations");
}
function enterDemo() {
  chooseWorkspace("demo");
  runMode.value = "demo";
  navigate("case");
}
watch([openaiReady, anthropicReady], ([openai, anthropic]) => {
  if (workspaceKind.value === "personal" && !selectedProviderReady.value) {
    runMode.value = openai ? "openai" : anthropic ? "anthropic" : "demo";
  }
  for (const session of sessions.value) {
    if (session.runs.some(run => run.status === "running" && ((run.mode === "openai" && !openai) || (run.mode === "anthropic" && !anthropic)))) stopRun(session.id);
  }
});
const activeView = ref("Split");
function pageFromHash() {
  const hash = canonicalWorkspaceHash(window.location.hash);
  if (hash !== window.location.hash) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
  return workspacePage(hash);
}
const currentPage = ref(pageFromHash());
const researchVisited = ref(currentPage.value === 'research');
const researchPage = ref(null);
const researchToolsNotice = ref('');
const timelinePage = ref(null);
const preflightPage = ref(null);
const casePage = ref(null);
const universityPage = ref(null);
watch(() => [account.loading, account.user?.id || account.user?.email], ([loading, id], [, previousId]) => {
  if (loading || workspaceKind.value !== "personal") return;
  if (!id) {
    chooseWorkspace("demo");
    runMode.value = "demo";
    navigate("login");
  } else if (previousId && previousId !== id) navigate("login");
});
function syncPage() {
  currentPage.value = pageFromHash();
  sidebarOpen.value = false;
  menuId.value = null;
}
function navigate(page) {
  window.location.hash = ({ case: "/case", university: "/university", timeline: "/timeline", preflight: "/preflight", login: "/login", research: "/research" })[page] || "/simulations";
  currentPage.value = page;
  sidebarOpen.value = false;
  menuId.value = null;
}
onMounted(() => window.addEventListener("hashchange", syncPage));
onUnmounted(() => window.removeEventListener("hashchange", syncPage));
watch(currentPage, async (page) => {
  if (page === 'research') researchVisited.value = true;
  await nextTick();
  if (page === "timeline") timelinePage.value?.focusHeading();
  else if (page === "preflight") preflightPage.value?.focusHeading();
  else if (page === "login") loginPage.value?.focusHeading();
  else if (page === "case") casePage.value?.focusHeading();
  else if (page === 'research') researchPage.value?.focusHeading();
  else if (page === "university") universityPage.value?.focusHeading();
  else composer.value?.focus();
});
const search = ref("");
const sidebarOpen = ref(false);
const sidebar = ref(null);
const sidebarToggle = ref(null);
const isMobile = ref(false);
let mobileQuery;
function updateMobileLayout(event) {
  isMobile.value = event.matches;
  if (!event.matches) sidebarOpen.value = false;
}
onMounted(() => {
  mobileQuery = window.matchMedia("(max-width: 760px)");
  updateMobileLayout(mobileQuery);
  mobileQuery.addEventListener("change", updateMobileLayout);
});
onUnmounted(() =>
  mobileQuery?.removeEventListener("change", updateMobileLayout),
);
watch(sidebarOpen, async (open) => {
  const focusWasInSidebar = sidebar.value?.contains(document.activeElement);
  await nextTick();
  if (open && isMobile.value) {
    // Wait for the drawer's visibility style to apply before moving focus.
    await new Promise(requestAnimationFrame);
    if (sidebarOpen.value)
      sidebar.value?.querySelector(".new-chat-button")?.focus();
  } else if (
    isMobile.value &&
    focusWasInSidebar &&
    (document.activeElement === document.body ||
      sidebar.value?.contains(document.activeElement))
  ) {
    sidebarToggle.value?.focus();
  }
});
function trapSidebarFocus(event) {
  if (!sidebarOpen.value || !isMobile.value) return;
  const controls = [
    ...sidebar.value.querySelectorAll("button:not(:disabled), input"),
  ].filter((element) => element.getClientRects().length);
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
const menuId = ref(null);
const composer = ref(null);
const messageList = ref(null);
const actionDialog = ref(null);
const dialogAction = ref(null);
const dialogSession = ref(null);
const editedTitle = ref("");
const renameInput = ref(null);
let dialogFocusReturn;
const submitError = ref("");
const setupOpen = ref(false);
const editingSessionId = ref(null);
const setupError = ref("");
const setupSession = computed(() => sessions.value.find(session => session.id === editingSessionId.value));
const preparingInstitution = ref(false);
let preparingAbort;
watch([storageIdentity, workspaceKind], () => { preparingAbort?.abort(); preparingInstitution.value = false; });
onUnmounted(() => preparingAbort?.abort());
watch([storageIdentity, workspaceKind], () => { setupOpen.value = false; editingSessionId.value = null; researchToolsNotice.value = ''; });
watch(activeId, () => { researchToolsNotice.value = ''; });
watch(currentPage, page => { if (page === 'login') setupOpen.value = false; });
watch(
  () => [account.loading, account.user, workspaceKind.value, university.value, currentPage.value],
  () => {
    if (!account.loading && account.user && workspaceKind.value === 'personal' && !university.value && currentPage.value !== 'login') navigate('login');
  },
  { immediate: true },
);
const views = [
  { name: "Chat", icon: "chat" },
  { name: "Split", icon: "split" },
  { name: "Graph", icon: "graph" },
];
const starters = [
  {
    icon: "people",
    title: "Explore a community",
    prompt:
      "How might a community respond to a new neighborhood health clinic?",
  },
  {
    icon: "branch",
    title: "Compare two approaches",
    prompt:
      "How might appointment reminders by text compare with reminders by phone?",
  },
  {
    icon: "spark",
    title: "Test a what-if",
    prompt:
      "What might change if a clinic offered evening and weekend appointments?",
  },
];
const filteredSessions = computed(() =>
  [...sessions.value]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((session) =>
      `${session.title} ${session.messages
        .filter((message) => message.role === "user")
        .map((message) => message.content)
        .join(" ")}`
        .toLowerCase()
        .includes(search.value.trim().toLowerCase()),
    ),
);
const latestRun = computed(() => activeSession.value?.runs.at(-1) ?? null);
const simulationUniversity = computed(() => activeSession.value?.context?.university || university.value);
const sharedInstitutionMatches = computed(() => institutionSnapshotMatches(universityProfile.value, simulationUniversity.value));
const sharedInstitutionUniversityMatches = computed(() => institutionSnapshotMatches({ university: university.value }, simulationUniversity.value));
const simulationInstitution = computed(() => activeSession.value?.context?.institution || (sharedInstitutionMatches.value ? universityProfile.value : null));
const simulationInstitutionState = computed(() => activeSession.value?.context?.institution ? 'ready' : sharedInstitutionUniversityMatches.value ? institutionState.value : 'idle');
const isRunning = computed(() => latestRun.value?.status === "running");
const canSubmit = computed(
  () => Boolean(activeSession.value?.draft.trim()) && !isRunning.value && !preparingInstitution.value,
);
function sessionStatus(session) {
  return session.runs.at(-1)?.status ?? "draft";
}
function statusLabel(status) {
  return (
    {
      running: "Running",
      completed: "Completed",
      stopped: "Stopped",
      failed: "Failed",
      draft: "Draft",
    }[status] || "Draft"
  );
}
function runForMessage(message) {
  return activeSession.value?.runs.find((run) => run.id === message.runId);
}
function selectChat(id) {
  navigate("simulations");
  selectSession(id);
  menuId.value = null;
  sidebarOpen.value = false;
  submitError.value = "";
}
async function newChat() {
  sidebarOpen.value = false;
  editingSessionId.value = null;
  setupError.value = "";
  await nextTick();
  setupOpen.value = true;
}
function editSetup() {
  if (isRunning.value || preparingInstitution.value) return;
  editingSessionId.value = activeId.value;
  setupError.value = "";
  setupOpen.value = true;
}
function reviewResearchSetup(id) {
  if (id) selectSession(id);
  editSetup();
}
function attachResearchDocuments(documents) {
  researchToolsNotice.value = '';
  const session = activeSession.value;
  if (!session) return;
  if (preparingInstitution.value || session.runs.some(run => run.status === 'running')) {
    researchToolsNotice.value = 'Wait for the university source check or stop the current run before adding sources to its setup.';
    return;
  }
  try {
    const existing = session.context || { overview: '', transcript: '', documents: [], university: workspaceKind.value === 'personal' ? university.value : null };
    const merged = new Map(existing.documents.map(document => [document.id, document]));
    for (const document of documents) merged.set(document.id, document);
    const context = normalizeSimulationContext({ ...existing, documents: [...merged.values()] });
    if (!setSessionContext(session.id, context)) throw new Error(storageWarning.value || 'The sources could not be added.');
    researchToolsNotice.value = `${documents.length} ${documents.length === 1 ? 'source added' : 'sources added'} to ${session.title}.`;
  } catch (error) {
    researchToolsNotice.value = error.message;
  }
}
async function saveSetup({ title, question, context }) {
  if (preparingInstitution.value) { setupError.value = 'Wait for the university source check to finish before changing this study setup.'; return; }
  if (editingSessionId.value) {
    if (!setSessionContext(editingSessionId.value, context)) {
      setupError.value = storageWarning.value || 'Stop the current run before changing its setup.';
      return;
    }
    if (title) renameSession(editingSessionId.value, title);
    const session = sessions.value.find(item => item.id === editingSessionId.value);
    if (session) session.draft = question;
    selectSession(editingSessionId.value);
  } else {
    const session = createSession({ title, context });
    if (!session) { setupError.value = storageWarning.value || 'This simulation could not be created.'; return; }
    activeSession.value.draft = question;
  }
  setupOpen.value = false;
  search.value = "";
  submitError.value = "";
  activeView.value = "Chat";
  navigate('simulations');
  await nextTick();
  composer.value?.focus();
}
async function useStarter(prompt) {
  activeSession.value.draft = prompt;
  await nextTick();
  composer.value?.focus();
}
async function submitRun() {
  if (!canSubmit.value) return;
  if (runMode.value !== "demo" && (workspaceKind.value !== "personal" || !selectedProviderReady.value)) {
    navigate("login");
    return;
  }
  const session = activeSession.value;
  const mode = runMode.value;
  const prompt = session.draft;
  const identity = storageIdentity.value;
  if (mode !== 'demo') {
    const controller = new AbortController();
    preparingAbort = controller;
    preparingInstitution.value = true;
    submitError.value = '';
    try {
      const context = await prepareInstitutionSimulationContext(session.context, university.value, {
        snapshot: institutionSnapshot.value, provider: mode,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(150000)]),
      });
      if (controller.signal.aborted || identity !== storageIdentity.value || !sessions.value.includes(session)) return;
      if (!setSessionContext(session.id, context)) throw new Error('The simulation setup could not be saved. Please try again.');
    } catch (error) {
      if (!controller.signal.aborted) submitError.value = error.message || 'University sources could not be checked. Please try again.';
      return;
    } finally {
      if (preparingAbort === controller) { preparingInstitution.value = false; preparingAbort = null; }
    }
  }
  const nextDraft = session.draft !== prompt ? session.draft : null;
  const run = (mode === "anthropic" ? startAnthropicRun : mode === "openai" ? startOpenAIRun : startRun)(session.id, prompt);
  if (run && nextDraft !== null) session.draft = nextDraft;
  submitError.value = run
    ? ""
    : "This run could not start. Check the workspace notice and try again.";
}
function composerKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submitRun();
  }
}
async function openAction(action, session) {
  dialogFocusReturn = document.activeElement
    ?.closest(".conversation-row")
    ?.querySelector(".conversation-menu-button");
  dialogAction.value = action;
  dialogSession.value = session;
  editedTitle.value = session.title;
  menuId.value = null;
  actionDialog.value.showModal();
  await nextTick();
  if (action === "rename") renameInput.value?.select();
}
async function restoreDialogFocus() {
  await nextTick();
  if (
    dialogFocusReturn?.isConnected &&
    dialogFocusReturn.getClientRects().length
  ) {
    dialogFocusReturn.focus();
  } else if (sidebarOpen.value) {
    sidebar.value?.querySelector(".new-chat-button")?.focus();
  } else {
    composer.value?.focus();
  }
}
function confirmAction() {
  if (dialogAction.value === "rename") {
    if (!editedTitle.value.trim()) return;
    renameSession(dialogSession.value.id, editedTitle.value);
  } else {
    deleteSession(dialogSession.value.id);
  }
  actionDialog.value.close();
}
watch(
  () => [
    activeId.value,
    activeSession.value?.messages.length,
    activeView.value,
  ],
  async () => {
    await nextTick();
    if (messageList.value)
      messageList.value.scrollTop = messageList.value.scrollHeight;
  },
);
</script>

<template>
  <LookaheadIntro />
  <ResearcherLogin
    v-if="currentPage === 'login' || (workspaceKind === 'personal' && (account.loading || !university))"
    ref="loginPage"
    :account="account"
    :busy="accountBusy"
    :error="accountError"
    :university="university"
    :university-error="universityError"
    :institution-snapshot="institutionSnapshot"
    @save-university="saveUniversity"
    @google="google"
    @connect="connect"
    @disconnect="disconnect"
    @connect-anthropic="connectAnthropic"
    @disconnect-anthropic="disconnectAnthropic"
    @signout="signout"
    @continue="enterWorkspace($event)"
    @demo="enterDemo"
    @refresh-institution="refreshInstitution"
  />
  <div
    v-else
    class="app-shell"
    @click="menuId = null"
    @keydown.esc="
      sidebarOpen = false;
      menuId = null;
    "
  >
    <button
      v-if="sidebarOpen"
      class="sidebar-scrim"
      aria-label="Close sidebar"
      @click="sidebarOpen = false"
    ></button>
    <aside
      ref="sidebar"
      id="simulation-sidebar"
      class="sidebar"
      :class="{ 'is-open': sidebarOpen }"
      aria-label="Simulation conversations"
      :role="sidebarOpen && isMobile ? 'dialog' : undefined"
      :aria-modal="sidebarOpen && isMobile ? true : undefined"
      @keydown.tab="trapSidebarFocus"
    >
      <div class="sidebar-brand">
        <LookaheadLogo class="brand" />
        <button
          class="icon-button mobile-close"
          aria-label="Close sidebar"
          @click="sidebarOpen = false"
        >
          <AppIcon name="close" />
        </button>
      </div>
      <button class="new-chat-button" @click="newChat">
        <AppIcon name="plus" :size="18" /> New simulation
        <span class="new-chat-hint">↗</span>
      </button>
      <div class="sidebar-section-label workspace-nav-label">WORKSPACE</div>
      <nav class="workspace-navigation" aria-label="Workspace pages">
        <button
          v-if="workspaceKind === 'demo'"
          class="workspace-nav-button"
          :class="{ active: currentPage === 'case' }"
          :aria-current="currentPage === 'case' ? 'page' : undefined"
          @click="navigate('case')"
        >
          <AppIcon name="people" :size="18" />
          <span>Sample case study</span>
          <AppIcon class="workspace-nav-arrow" name="arrow-up-right" :size="15" />
        </button>
        <button
          class="workspace-nav-button"
          :class="{ active: currentPage === 'timeline' }"
          :aria-current="currentPage === 'timeline' ? 'page' : undefined"
          @click="navigate('timeline')"
        >
          <AppIcon name="timeline" :size="18" />
          <span>Bottleneck timeline</span>
          <AppIcon class="workspace-nav-arrow" name="arrow-up-right" :size="15" />
        </button>
        <button
          class="workspace-nav-button"
          :class="{ active: currentPage === 'preflight' }"
          :aria-current="currentPage === 'preflight' ? 'page' : undefined"
          @click="navigate('preflight')"
        >
          <AppIcon name="document-check" :size="18" />
          <span>Document preflight</span>
          <AppIcon class="workspace-nav-arrow" name="arrow-up-right" :size="15" />
        </button>
        <button
          class="workspace-nav-button"
          :class="{ active: currentPage === 'university' }"
          :aria-current="currentPage === 'university' ? 'page' : undefined"
          @click="navigate('university')"
        >
          <AppIcon name="people" :size="18" />
          <span>University IRB preview</span>
          <AppIcon class="workspace-nav-arrow" name="arrow-up-right" :size="15" />
        </button>
        <button class="workspace-nav-button" :class="{ active: currentPage === 'research' }" :aria-current="currentPage === 'research' ? 'page' : undefined" @click="navigate('research')">
          <AppIcon name="layers" :size="18" />
          <span>Research tools</span>
          <AppIcon class="workspace-nav-arrow" name="arrow-up-right" :size="15" />
        </button>
      </nav>
      <label class="search-box"
        ><AppIcon name="search" :size="16" /><input
          v-model="search"
          type="search"
          placeholder="Search simulations"
          aria-label="Search simulations"
      /></label>
      <div class="sidebar-section-label">
        <span>YOUR SIMULATIONS</span><span>{{ sessions.length }}</span>
      </div>
      <nav class="conversation-list" aria-label="Saved simulations">
        <p v-if="!filteredSessions.length" class="no-results">
          No simulations found.<br />Try another search.
        </p>
        <div
          v-for="session in filteredSessions"
          :key="session.id"
          class="conversation-row"
          :class="{
            selected: currentPage === 'simulations' && activeId === session.id,
            'has-menu': menuId === session.id,
          }"
        >
          <button
            class="conversation-button"
            :aria-current="currentPage === 'simulations' && activeId === session.id ? 'page' : undefined"
            @click="selectChat(session.id)"
          >
            <AppIcon name="chat" :size="17" /><span class="conversation-text"
              ><span class="conversation-title">{{ session.title }}</span
              ><span class="conversation-status"
                ><StatusIcon :status="sessionStatus(session) === 'failed' ? 'error' : sessionStatus(session)" :progress="session.runs.at(-1)?.mode === 'demo' ? session.runs.at(-1)?.progress : null" />
                {{ statusLabel(sessionStatus(session))
                }}<span v-if="session.runs.length" class="run-count"
                  >· {{ session.runs.length }}
                  {{ session.runs.length === 1 ? "run" : "runs" }}</span
                ></span
              ></span
            >
          </button>
          <button
            class="icon-button conversation-menu-button"
            :aria-label="`Options for ${session.title}`"
            :aria-expanded="menuId === session.id"
            @click.stop="menuId = menuId === session.id ? null : session.id"
          >
            <AppIcon name="more" :size="17" />
          </button>
          <div
            v-if="menuId === session.id"
            class="conversation-menu"
            @click.stop
          >
            <button @click="openAction('rename', session)">
              <AppIcon name="edit" :size="16" /> Rename</button
            ><button class="danger-text" @click="openAction('delete', session)">
              <AppIcon name="trash" :size="16" /> Delete
            </button>
          </div>
        </div>
      </nav>
      <div class="sidebar-bottom">
        <div v-if="runningCount" class="parallel-notice">
          <span class="parallel-icon"
            ><AppIcon name="layers" :size="18"
          /></span>
          <div>
            <strong>{{
              runningCount
                ? `${runningCount} ${runningCount === 1 ? "simulation" : "simulations"} running`
                : "Room for every what-if"
            }}</strong>
            <p>
              {{
                runningCount
                  ? "Keep exploring. Your other chats keep running."
                  : "Start a new chat to run another scenario in parallel."
              }}
            </p>
          </div>
        </div>
        <button class="workspace-identity account-button" @click="navigate('login')">
          <span class="workspace-avatar">{{ account.user?.name?.charAt(0) || 'M' }}</span>
          <div>
            <strong>{{ workspaceKind === 'personal' ? account.user?.name || 'Researcher' : 'Demo workspace' }}</strong><span :title="workspaceKind === 'personal' ? university?.name : undefined">{{ workspaceKind === 'personal' ? university?.name || 'Account & AI connection' : 'Sign in for your own work' }}</span>
          </div>
          <AppIcon name="lock" :size="15" />
        </button>
      </div>
    </aside>
    <div class="main-shell" :inert="sidebarOpen && isMobile">
      <header class="topbar">
        <div class="workspace-breadcrumb">
          <button
            ref="sidebarToggle"
            class="icon-button sidebar-toggle"
            aria-label="Open simulation sidebar"
            aria-controls="simulation-sidebar"
            :aria-expanded="sidebarOpen"
            @click="sidebarOpen = !sidebarOpen"
          >
            <AppIcon name="sidebar" /></button
          ><span class="breadcrumb-parent">{{ workspaceKind === 'personal' ? 'Your workspace' : 'Demo workspace' }}</span
          ><span class="breadcrumb-divider">/</span
          ><span class="current-title">{{ currentPage === 'case' ? 'REST-101 sample case' : currentPage === 'university' ? 'University IRB preview' : currentPage === 'timeline' ? 'Bottleneck timeline' : currentPage === 'preflight' ? 'Document preflight' : currentPage === 'research' ? 'Research tools' : activeSession?.title }}</span>
        </div>
        <div class="header-status">
          <WorkspaceModeToggle />
          <span v-if="runningCount" class="running-badge" role="status"
            ><span class="status-dot running"></span
            >{{ runningCount }} running</span
          ><button class="demo-badge account-status" @click="navigate('login')"><span></span>{{ workspaceKind === 'demo' ? 'Demo mode' : connectionLabel }}</button>
        </div>
      </header>
      <SampleCaseGraph v-if="currentPage === 'case'" ref="casePage" @navigate="navigate($event)" />
      <UniversitySimulationPreview v-if="currentPage === 'university'" ref="universityPage" @account="navigate('login')" />
      <BottleneckTimeline :key="timelineStorageKey" ref="timelinePage" :storage-key="timelineStorageKey" v-show="currentPage === 'timeline'" />
      <DocumentPreflight :key="preflightStorageKey" ref="preflightPage" :storage-key="preflightStorageKey" :sample-default="workspaceKind === 'demo'" v-show="currentPage === 'preflight'" />
      <ResearchTools v-if="researchVisited" v-show="currentPage === 'research'" :key="simulationStorageKey" ref="researchPage" :sessions="sessions" :active-session="activeSession" :storage-key="simulationStorageKey" :workspace-kind="workspaceKind" :provider-connected="workspaceKind === 'personal' && providerReady" :openai-connected="workspaceKind === 'personal' && openaiReady" :anthropic-connected="workspaceKind === 'personal' && anthropicReady" :notice="researchToolsNotice" @select-session="selectChat" @review-setup="reviewResearchSetup" @navigate="navigate" @attach-documents="attachResearchDocuments" />
      <main v-if="activeSession" v-show="currentPage === 'simulations'" class="workspace">
        <div class="workspace-toolbar">
          <div class="workspace-heading">
            <span>Scenario notebook</span>
            <button v-if="!activeSession.context" type="button" class="secondary-button" :disabled="isRunning || preparingInstitution" @click="editSetup">Add study context</button>
          </div>
          <nav class="view-switcher" aria-label="Workspace view">
            <button
              v-for="view in views"
              :key="view.name"
              :class="{ active: activeView === view.name }"
              :aria-pressed="activeView === view.name"
              @click="activeView = view.name"
            >
              <AppIcon :name="view.icon" :size="15" /><span>{{
                view.name
              }}</span>
            </button>
          </nav>
        </div>
        <section v-if="activeSession.context" class="simulation-context-bar" aria-label="Simulation setup">
          <div><strong>{{ activeSession.context.university?.name || 'Study context' }}</strong><span>{{ activeSession.context.documents.length }} {{ activeSession.context.documents.length === 1 ? 'document' : 'documents' }}<template v-if="activeSession.context.transcript"> · Voice transcript</template><template v-if="activeSession.context.institution"> · {{ activeSession.context.institution.reviewers?.length || 0 }} reviewer profiles</template></span></div>
          <button type="button" class="secondary-button" :disabled="isRunning || preparingInstitution" @click="editSetup">Review setup & sources</button>
        </section>
        <UniversityIRBPanel v-if="workspaceKind === 'personal' && simulationUniversity" class="workspace-irb-panel" compact :university="simulationUniversity" :profile="simulationInstitution" :state="simulationInstitutionState" :error="sharedInstitutionUniversityMatches && !activeSession.context?.institution ? institutionError : ''" :provider="institutionProvider" @refresh="editSetup" />
        <div v-if="storageWarning" class="storage-warning" role="alert">
          <AppIcon name="info" :size="17" />{{ storageWarning }}
        </div>
        <div
          class="workspace-content"
          :class="`view-${activeView.toLowerCase()}`"
        >
          <section
            v-show="activeView !== 'Graph'"
            class="chat-panel"
            aria-label="Simulation chat"
          >
            <div ref="messageList" class="message-scroll">
              <div v-if="!activeSession.messages.length" class="welcome">
                <h1>{{ workspaceKind === 'personal' ? 'Prepare for your IRB review.' : 'Start with a question.' }}</h1>
                <p class="welcome-copy">
                  {{ workspaceKind === 'personal' ? `Describe your study. Your simulation will use ${activeSession.context?.university?.name || university?.name} review perspectives and verified university sources.` : 'A change in timing. A different approach. A community’s response. Give your next what-if a place to unfold.' }}
                </p>
                <h2 class="starter-heading">Questions to get you started</h2>
                <div class="starter-grid">
                  <button
                    v-for="(starter, index) in starters"
                    :key="starter.title"
                    class="starter-card"
                    @click="useStarter(starter.prompt)"
                  >
                    <span class="starter-number" aria-hidden="true">0{{ index + 1 }}</span><strong>{{
                      starter.title
                    }}</strong
                    ><span>{{ starter.prompt }}</span
                    ><AppIcon
                      class="starter-arrow"
                      name="arrow-up-right"
                      :size="16"
                    />
                  </button>
                </div>
              </div>
              <div v-else class="messages">
                <div class="conversation-date">
                  {{
                    new Date(activeSession.createdAt).toLocaleDateString(
                      undefined,
                      { month: "long", day: "numeric" },
                    )
                  }}
                </div>
                <article
                  v-for="message in activeSession.messages"
                  :key="message.id"
                  class="message"
                  :class="`message-${message.role}`"
                >
                  <div
                    v-if="message.role === 'assistant'"
                    class="assistant-avatar"
                  >
                    <LookaheadLogo icon-only style="font-size:22px" />
                  </div>
                  <div class="message-body">
                    <div
                      v-if="message.role === 'assistant'"
                      class="assistant-name"
                    >
                      Lookahead <span>{{ providerName(runForMessage(message)?.mode).toUpperCase() }}</span>
                    </div>
                    <p class="message-text">{{ message.content }}</p>
                    <template
                      v-if="
                        message.role === 'assistant' && runForMessage(message)
                      "
                      ><div
                        class="run-card"
                        :class="`run-${runForMessage(message).status}`"
                      >
                        <div class="run-card-heading">
                          <span class="run-symbol"
                            ><AppIcon
                              :name="
                                runForMessage(message).status === 'completed'
                                  ? 'check'
                                  : runForMessage(message).status === 'stopped'
                                    ? 'stop'
                                    : 'graph'
                              "
                              :size="19"
                          /></span>
                          <div>
                            <strong>{{
                              runForMessage(message).status === "running"
                                ? "Exploring your scenario"
                                : runForMessage(message).status === "completed"
                                  ? (isAIRun(runForMessage(message)) ? 'AI exploration complete' : 'Demo run complete')
                                  : runForMessage(message).status === 'failed' ? 'Run could not complete' : 'Run stopped'
                            }}</strong
                            ><span
                              >{{ isAIRun(runForMessage(message)) ? `${providerName(runForMessage(message).mode)} ·` : 'Local demo ·' }}
                              {{ runForMessage(message).agentCount }}
                              {{ isAIRun(runForMessage(message)) ? 'research perspectives' : 'illustrative agents' }}</span
                            >
                          </div>
                          <span class="run-percentage"
                            v-if="!isAIRun(runForMessage(message)) || runForMessage(message).status === 'completed'"
                            >{{
                              Math.round(runForMessage(message).progress)
                            }}%</span
                          >
                        </div>
                        <div
                          v-if="!isAIRun(runForMessage(message)) || runForMessage(message).status === 'completed'"
                          class="progress-track"
                          role="progressbar"
                          :aria-label="`Run progress for ${runForMessage(message).prompt}`"
                          :aria-valuenow="
                            Math.round(runForMessage(message).progress)
                          "
                          aria-valuemin="0"
                          aria-valuemax="100"
                        >
                          <div
                            :style="{
                              width: `${runForMessage(message).progress}%`,
                            }"
                          ></div>
                        </div>
                        <div class="run-card-footer">
                          <span>{{ runForMessage(message).stage }}</span
                          ><button
                            v-if="runForMessage(message).id === latestRun?.id && !isAIRun(runForMessage(message))"
                            @click="activeView = 'Split'"
                          >
                            View graph
                            <AppIcon name="arrow-up-right" :size="13" />
                          </button>
                        </div></div
                    ></template>
                  </div>
                </article>
              </div>
            </div>
            <div class="composer-area">
              <div v-if="isRunning" class="background-hint" role="status">
                <span class="status-dot running"></span>This run keeps running
                when you switch chats.
              </div>
              <form class="composer" @submit.prevent="submitRun">
                <label class="sr-only" for="simulation-prompt"
                  >Simulation question</label
                ><textarea
                  id="simulation-prompt"
                  ref="composer"
                  v-model="activeSession.draft"
                  :maxlength="PROMPT_LIMIT"
                  rows="3"
                  :placeholder="
                    isRunning
                      ? 'Draft your next question while this run finishes…'
                      : activeSession.messages.length
                        ? 'Ask a follow-up or explore another possibility…'
                        : 'What would you like to simulate?'
                  "
                  @keydown="composerKeydown"
                ></textarea>
                <div class="composer-toolbar">
                  <label class="composer-meta run-mode-select">
                    <AppIcon name="spark" :size="15" />
                    <span class="sr-only">Simulation provider</span>
                    <select v-model="runMode" :disabled="isRunning || preparingInstitution">
                      <option value="demo">12 demo agents</option>
                      <option value="openai" :disabled="workspaceKind === 'demo'">{{ workspaceKind === 'demo' ? 'OpenAI · open your workspace' : openaiReady ? 'OpenAI · 3 perspectives' : 'OpenAI · connect API key' }}</option>
                      <option value="anthropic" :disabled="workspaceKind === 'demo'">{{ workspaceKind === 'demo' ? 'Anthropic · open your workspace' : anthropicReady ? 'Anthropic · 3 perspectives' : 'Anthropic · connect API key' }}</option>
                    </select>
                  </label><button
                    v-if="isRunning"
                    class="stop-button"
                    type="button"
                    @click="stopRun(activeId)"
                  >
                    <AppIcon name="stop" :size="13" />{{ isAIRun(latestRun) ? 'Stop waiting' : 'Stop run' }}</button
                  ><button
                    v-else-if="preparingInstitution"
                    class="stop-button"
                    type="button"
                    @click="preparingAbort?.abort(); preparingInstitution = false"
                  >
                    <AppIcon name="stop" :size="13" />Stop source check
                  </button><button
                    v-else
                    class="send-button"
                    type="submit"
                    :disabled="!canSubmit"
                  >
                    <span>{{ preparingInstitution ? 'Checking university sources…' : runMode !== 'demo' && !selectedProviderReady ? 'Connect to run' : 'Run simulation' }}</span
                    ><AppIcon name="arrow-up" :size="17" />
                  </button>
                </div>
              </form>
              <p v-if="submitError" class="submit-error" role="alert">
                {{ submitError }}
              </p>
              <p class="composer-disclaimer">
                {{ runMode !== 'demo' ? `AI explorations are hypotheses, not research findings. API usage is billed to your ${providerName(runMode)} account.` : (providerReady ? 'Demo runs show the workflow. Choose a connected provider for an AI exploration.' : 'Sample simulations show the workflow. Connect an OpenAI or Anthropic API key to run AI explorations.') }}
                {{ workspaceKind === 'personal' ? 'Chats are saved for your Google account in this browser.' : 'Demo chats are saved in this browser.' }}
              </p>
            </div>
          </section>
          <section
            v-if="activeView !== 'Chat'"
            class="graph-container"
            aria-label="Simulation graph"
          >
            <SimulationGraph
              v-if="!isAIRun(latestRun)"
              :key="activeId"
              :run="latestRun"
              :session-title="activeSession.title"
            />
            <div v-else class="ai-graph-note">
              <AppIcon name="spark" :size="28" />
              <h2>Read the research perspectives</h2>
              <p>{{ providerName(latestRun?.mode) }} responses are available in the chat. The illustrative demo graph does not represent these AI runs.</p>
              <button class="secondary-button" @click="activeView = 'Chat'">View AI responses</button>
            </div>
            <div v-if="activeView === 'Graph'" class="graph-actions">
              <button class="secondary-button" @click="activeView = 'Chat'">
                <AppIcon name="chat" :size="16" />Back to chat</button
              ><button
                v-if="isRunning"
                class="stop-button"
                @click="stopRun(activeId)"
              >
                <AppIcon name="stop" :size="13" />{{ isAIRun(latestRun) ? 'Stop waiting' : 'Stop run' }}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
    <NewSimulationDialog
      :open="setupOpen"
      :personal="workspaceKind === 'personal'"
      :ai-ready="workspaceKind === 'personal' && openaiReady"
      :lookup-ready="workspaceKind === 'personal' && providerReady"
      :institution-snapshot="institutionSnapshot"
      :busy="preparingInstitution"
      :university="setupSession?.context?.university || (workspaceKind === 'personal' ? university : null)"
      :initial-context="setupSession?.context || null"
      :initial-title="setupSession?.title || ''"
      :initial-question="setupSession?.draft || ''"
      :error="setupError"
      @close="setupOpen = false"
      @submit="saveSetup"
    />
    <dialog
      ref="actionDialog"
      class="action-dialog"
      aria-labelledby="dialog-title"
      @keydown.esc.stop
      @close="restoreDialogFocus"
      @click="
        (event) => {
          if (event.target === actionDialog) actionDialog.close();
        }
      "
    >
      <form @submit.prevent="confirmAction">
        <h2 id="dialog-title">
          {{
            dialogAction === "rename"
              ? "Rename simulation"
              : "Delete simulation?"
          }}
        </h2>
        <template v-if="dialogAction === 'rename'"
          ><label class="field-label" for="simulation-title">Name</label
          ><input
            id="simulation-title"
            ref="renameInput"
            v-model="editedTitle"
            :maxlength="TITLE_LIMIT"
            autocomplete="off"
            required
        /></template>
        <p v-else>
          “{{ dialogSession?.title }}” and its conversation will be removed from
          this device.{{
            dialogSession && sessionStatus(dialogSession) === "running"
              ? (isAIRun(dialogSession.runs.at(-1)) ? " We will stop waiting for its AI response. Requests already sent may still incur API usage." : " Its running simulation will also stop.")
              : ""
          }}
        </p>
        <div class="dialog-actions">
          <button
            class="secondary-button"
            type="button"
            @click="actionDialog.close()"
          >
            Cancel</button
          ><button
            :class="dialogAction === 'rename' ? 'send-button' : 'delete-button'"
            type="submit"
            :disabled="dialogAction === 'rename' && !editedTitle.trim()"
          >
            {{ dialogAction === "rename" ? "Save name" : "Delete simulation" }}
          </button>
        </div>
      </form>
    </dialog>
  </div>
</template>

<style scoped>
.workspace-irb-panel { margin:0 24px 14px; max-height:270px; overflow-y:auto; flex-shrink:0; }
@media (max-width:760px) { .workspace-irb-panel { margin:0 14px 12px; max-height:190px; } }
</style>
