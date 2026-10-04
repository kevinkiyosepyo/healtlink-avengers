<script setup>
import { computed, defineAsyncComponent, h, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { ArrowUp, Mic, MicOff, PanelLeft, Square } from "@lucide/vue";
import SidebarPanel from "./components/SidebarPanel.vue";
import BootScreen from "./components/fx/BootScreen.vue";
import SampleRack from "./components/fx/SampleRack.vue";
import StatusBadge from "./components/StatusBadge.vue";
import StatusIcon from "./components/StatusIcon.vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./components/ui/dialog";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./components/ui/command";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./components/ui/sheet";
import { Input } from "./components/ui/input";
import { prefersReducedMotion, useLenis } from "./composables/useMotion.js";
import { useSemanticSearch } from "./composables/useSemanticSearch.js";
import { ERROR_COPY, useResearch } from "./composables/useResearch.js";
import AnalysisPanel from "./components/AnalysisPanel.vue";
import EvidencePanel from "./components/EvidencePanel.vue";
import { BLOCK_REASONS } from "./lib/guardrails.js";
import { useSimulationWorkspace } from "./composables/useSimulationWorkspace.js";
import { useResearcherAccount } from "./composables/useResearcherAccount.js";
import { useCloudSync } from "./composables/useCloudSync.js";
import { useVoice } from "./composables/useVoice.js";
import { appendSegment, cleanTranscript } from "./lib/voice.js";
import { PROMPT_LIMIT, TITLE_LIMIT } from "./lib/simulationWorkspace.js";

// Views load on demand; if a chunk can't be fetched (e.g. a stale tab after a
// deploy) show a retry instead of an empty pane.
const LoadError = () =>
  h("p", { class: "load-error mono" }, ["this view failed to load — ", h("button", { class: "glyph-link", onClick: () => window.location.reload() }, "reload")]);
const Nothing = () => null;
const lazy = (loader, errorComponent = LoadError) => defineAsyncComponent({ loader, errorComponent, timeout: 20_000 });
const SimulationGraph = lazy(() => import("./components/SimulationGraph.vue"));
// Welcome effects (motion-v) and settings load on demand to keep first paint light.
const BlurReveal = lazy(() => import("./components/ui/blur-reveal/BlurReveal.vue"));
const FlickeringGrid = lazy(() => import("./components/ui/flickering-grid/FlickeringGrid.vue"), Nothing);
const SettingsDialog = lazy(() => import("./components/SettingsDialog.vue"));
const settingsMounted = ref(false);
const JumpScare = lazy(() => import("./components/fx/JumpScare.vue"), Nothing);
const LibraryPage = lazy(() => import("./components/LibraryPage.vue"));
const StudyBuildPage = lazy(() => import("./components/StudyBuildPage.vue"));
const PreflightPage = lazy(() => import("./components/PreflightPage.vue"));
const TimelinePage = lazy(() => import("./components/TimelinePage.vue"));

// Hash routes for the research tools; chats stay on the default page.
const PAGES = { "#/library": "library", "#/build": "build", "#/preflight": "preflight", "#/timeline": "timeline" };
const PAGE_TITLES = { library: "source library", build: "study build", preflight: "document preflight", timeline: "start-up timeline" };
const currentPage = ref(PAGES[window.location.hash] ?? "simulations");
const toolPage = ref(null);
function navigate(page) {
  const hash = Object.keys(PAGES).find((key) => PAGES[key] === page) ?? "#/";
  if (window.location.hash !== hash) history.pushState(null, "", hash);
  currentPage.value = page;
  sidebarOpen.value = false;
  paletteOpen.value = false;
}
// Study build hands its burden summary to a new stakeholder rehearsal.
async function rehearsePrompt(prompt) {
  if (!createSession()) return;
  navigate("simulations");
  activeView.value = "chat";
  await nextTick();
  activeSession.value.draft = prompt;
  await nextTick();
  composer.value?.focus();
}
function syncPage() {
  currentPage.value = PAGES[window.location.hash] ?? "simulations";
}

const {
  sessions,
  activeSession,
  activeId,
  runningCount,
  storageWarning,
  createSession,
  selectSession,
  renameSession,
  deleteSession,
  startRun,
  stopRun,
} = useSimulationWorkspace();

const reducedMotion = prefersReducedMotion();
const BOOT_KEY = "microfish:booted";
function shouldBoot() {
  if (reducedMotion) return false;
  try {
    return !window.sessionStorage.getItem(BOOT_KEY);
  } catch {
    return false;
  }
}
const booting = ref(shouldBoot());
function finishBoot() {
  booting.value = false;
  try {
    window.sessionStorage.setItem(BOOT_KEY, "1");
  } catch {
    /* Boot simply replays next time. */
  }
}

const views = ["chat", "split", "graph"];
const activeView = ref("chat");
const search = ref("");
const sidebarOpen = ref(false);
const paletteOpen = ref(false);
const composer = ref(null);
const messageList = ref(null);
const submitError = ref("");
const { scrollToBottom } = useLenis(messageList);

const starters = [
  {
    title: "cut the visit burden",
    prompt: "What happens to retention if REST-101 cuts clinic visits from 4 to 3 and adds a remote check-in at week 2?",
  },
  {
    title: "widen the enrollment window",
    prompt: "How would offering evening and weekend study visits affect enrollment and site staffing?",
  },
  {
    title: "modernize consent",
    prompt: "What changes if REST-101 moves to e-consent with a short video explainer?",
  },
];
const tools = [
  { page: "build", title: "study build", note: "protocol → schedule, crf, edit checks and auto queries" },
  { page: "preflight", title: "document preflight", note: "catch protocol ↔ consent conflicts before submission" },
  { page: "timeline", title: "start-up timeline", note: "see which delay actually moves first-participant-in" },
];

const sortedSessions = computed(() =>
  [...sessions.value].sort((a, b) => b.updatedAt - a.updatedAt),
);
function keywordMatch(session, query) {
  return `${session.title} ${session.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ")}`
    .toLowerCase()
    .includes(query);
}

// Semantic search: an in-browser vector index (see useSemanticSearch). Keyword
// matches stay instant; semantic matches are appended once the model is ready.
const semantic = useSemanticSearch(sessions);
function useRankedSessions(term) {
  const hits = ref([]);
  let token = 0;
  let timer;
  watch([term, semantic.status, semantic.indexSize], () => {
    clearTimeout(timer);
    const current = ++token;
    if (term.value.trim().length < 3) {
      hits.value = [];
      return;
    }
    timer = setTimeout(async () => {
      const result = await semantic.query(term.value);
      if (current === token) hits.value = result;
    }, 150);
  });
  const ranked = computed(() => {
    const query = term.value.trim().toLowerCase();
    if (!query) return sortedSessions.value;
    const keyword = sortedSessions.value.filter((session) => keywordMatch(session, query));
    const seen = new Set(keyword.map((session) => session.id));
    const similar = hits.value
      .filter((hit) => !seen.has(hit.sessionId))
      .map((hit) => sessions.value.find((session) => session.id === hit.sessionId))
      .filter(Boolean);
    return [...keyword, ...similar];
  });
  const similarIds = computed(() => {
    const query = term.value.trim().toLowerCase();
    return new Set(
      hits.value
        .map((hit) => hit.sessionId)
        .filter((id) => {
          const session = sessions.value.find((item) => item.id === id);
          return session && !keywordMatch(session, query);
        }),
    );
  });
  return { ranked, similarIds };
}
const { ranked: filteredSessions, similarIds } = useRankedSessions(search);
const paletteTerm = ref("");
const { ranked: paletteSessions, similarIds: paletteSimilarIds } = useRankedSessions(paletteTerm);
watch(paletteOpen, (open) => {
  if (!open) paletteTerm.value = "";
});
const semanticLabel = computed(
  () =>
    ({
      idle: "keyword search",
      loading: `loading semantic index${semantic.progress.value ? ` · ${semantic.progress.value}%` : ""}`,
      ready: `semantic · ${semantic.indexSize.value} vectors`,
      unavailable: "keyword search · semantic offline",
    })[semantic.status.value],
);
const latestRun = computed(() => activeSession.value?.runs.at(-1) ?? null);
const isRunning = computed(() => latestRun.value?.status === "running");
const checking = ref(false);
const canSubmit = computed(
  () => Boolean(activeSession.value?.draft.trim()) && !isRunning.value && !checking.value,
);
const research = useResearch(sessions);
const account = useResearcherAccount();
const cloud = useCloudSync({ research, account, sessions });

// Voice dictation: talk continuously; segments are cleaned and appended to the
// draft, and saying "run it" submits (hands-free, e.g. on the go).
const voice = useVoice({ getApiKey: () => (research.settings.mode === "openai" && research.keyStatus.value === "valid" ? research.apiKey.value.trim() : "") });
function onVoiceSegment(raw) {
  const session = activeSession.value;
  if (!session) return;
  const { text, command } = cleanTranscript(raw);
  session.draft = appendSegment(session.draft, text);
  if (command === "send") nextTick(submitRun);
}
const toggleVoice = () => voice.toggle(onVoiceSegment);
const settingsOpen = ref(false);
watch(settingsOpen, (open) => {
  if (open) settingsMounted.value = true;
});
const latestRecord = computed(() => (latestRun.value ? research.records[latestRun.value.id] ?? null : null));
const latestStances = computed(() => latestRecord.value?.analysis?.stances ?? null);

function runForMessage(message) {
  return activeSession.value?.runs.find((run) => run.id === message.runId);
}
function runIndex(run) {
  return String(activeSession.value.runs.indexOf(run) + 1).padStart(2, "0");
}
function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}
// Vercel-style metadata: progress while running, then the elapsed duration.
function runMeta(run) {
  const elapsed = formatDuration(((run.progress || 0) / 100) * (run.durationMs || 0));
  if (run.status === "running") return [`${Math.round(run.progress)}%`, elapsed];
  if (run.status === "stopped") return [`at ${Math.round(run.progress)}%`, elapsed];
  return [elapsed, `${run.agentCount} agents`];
}

function selectChat(id) {
  navigate("simulations");
  selectSession(id);
  sidebarOpen.value = false;
  paletteOpen.value = false;
  submitError.value = "";
}
async function newChat() {
  paletteOpen.value = false;
  navigate("simulations");
  if (!createSession()) return;
  search.value = "";
  sidebarOpen.value = false;
  activeView.value = "chat";
  submitError.value = "";
  await nextTick();
  composer.value?.focus();
}
async function useStarter(prompt) {
  activeSession.value.draft = prompt;
  await nextTick();
  composer.value?.focus();
}
// Every prompt is screened before a run starts: local rules, then (OpenAI
// mode) moderation; the model's own scope check runs with the analysis.
async function submitRun() {
  if (!canSubmit.value) return;
  const session = activeSession.value;
  const prompt = session.draft;
  checking.value = true;
  submitError.value = "";
  const result = await research.check(prompt);
  checking.value = false;
  if (result.needsKey) {
    submitError.value = "add and test an openai key in settings, or switch to demo mode.";
    settingsOpen.value = true;
    return;
  }
  if (result.error) {
    submitError.value = ERROR_COPY[result.error] ?? ERROR_COPY.unavailable;
    return;
  }
  if (result.blocked) {
    submitError.value = BLOCK_REASONS[result.blocked] ?? BLOCK_REASONS.unsafe;
    return;
  }
  const run = startRun(session.id, prompt);
  if (!run) {
    submitError.value = "this run could not start — check the workspace notice and try again.";
    return;
  }
  const record = await research.analyze({ run, session, guardrails: result.guardrails });
  // In OpenAI mode the analysis is the result; end the playback so the
  // researcher can ask a follow-up immediately.
  const live = session.runs.find((item) => item.id === run.id);
  if (record?.mode === "openai" && live?.status === "running") stopRun(session.id);
  if (record?.analysis?.inScope === false && activeId.value === session.id) {
    submitError.value = BLOCK_REASONS[record.analysis.reason] ?? BLOCK_REASONS.off_topic;
  }
}
// The graph and sidebar follow the analysis (not the playback) for OpenAI runs.
function effectiveStatus(run) {
  if (!run) return "draft";
  const record = research.records[run.id];
  if (record?.mode !== "openai") return run.status;
  return { analyzing: "running", ready: "completed", blocked: "error", error: "error" }[research.status[run.id]] ?? run.status;
}
const graphRun = computed(() => {
  const run = latestRun.value;
  if (!run || research.records[run.id]?.mode !== "openai") return run;
  const status = effectiveStatus(run);
  return { ...run, status, progress: status === "completed" ? 100 : run.progress, stage: research.status[run.id] === "ready" ? "analysis ready" : run.stage };
});
watch(
  () => latestRun.value && research.status[latestRun.value.id],
  async () => {
    await nextTick();
    scrollToBottom();
  },
);
function retryAnalysis(run) {
  research.retry(run, activeSession.value);
}
watch(
  () => activeSession.value?.draft,
  () => {
    if (submitError.value && !checking.value) submitError.value = "";
  },
);
function composerKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submitRun();
  }
}

// Rename / delete dialog
const dialogOpen = ref(false);
const dialogAction = ref("rename");
const dialogSession = ref(null);
const editedTitle = ref("");
function openAction(action, session) {
  dialogAction.value = action;
  dialogSession.value = session;
  editedTitle.value = session.title;
  sidebarOpen.value = false;
  dialogOpen.value = true;
}
function confirmAction() {
  if (dialogAction.value === "rename") {
    if (!editedTitle.value.trim()) return;
    renameSession(dialogSession.value.id, editedTitle.value);
  } else {
    deleteSession(dialogSession.value.id);
  }
  dialogOpen.value = false;
}
const dialogSessionRunning = computed(
  () => dialogSession.value?.runs.at(-1)?.status === "running",
);

// Split view divider
const workspaceEl = ref(null);
const splitRatio = ref(45);
const workspaceStyle = computed(() =>
  activeView.value === "split"
    ? {
        gridTemplateColumns: `minmax(0, ${splitRatio.value}fr) 8px minmax(0, ${100 - splitRatio.value}fr)`,
      }
    : null,
);
function clampRatio(value) {
  return Math.min(70, Math.max(30, value));
}
function startResize(event) {
  const rect = workspaceEl.value.getBoundingClientRect();
  const move = (moveEvent) => {
    splitRatio.value = clampRatio(((moveEvent.clientX - rect.left) / rect.width) * 100);
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };
  event.preventDefault();
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
}
function resizeKeydown(event) {
  const step = { ArrowLeft: -2, ArrowRight: 2 }[event.key];
  if (!step) return;
  event.preventDefault();
  splitRatio.value = clampRatio(splitRatio.value + step);
}

function globalKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    paletteOpen.value = !paletteOpen.value;
  }
  // ⌘/Ctrl + Shift + Space toggles dictation.
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === "Space" && currentPage.value === "simulations") {
    event.preventDefault();
    toggleVoice();
  }
}
watch(currentPage, async (page) => {
  await nextTick();
  if (page !== "simulations") setTimeout(() => toolPage.value?.focusHeading?.(), 50);
});
onUnmounted(() => window.removeEventListener("popstate", syncPage));
onMounted(() => {
  window.addEventListener("popstate", syncPage);
  window.addEventListener("keydown", globalKeydown);
  // Load the embedding model after first paint so it never competes with the UI.
  const startIndex = () => semantic.start();
  if ("requestIdleCallback" in window) window.requestIdleCallback(startIndex, { timeout: 4000 });
  else setTimeout(startIndex, 1500);
});
onUnmounted(() => window.removeEventListener("keydown", globalKeydown));

watch(
  () => [activeId.value, activeSession.value?.messages.length, activeView.value],
  async () => {
    await nextTick();
    scrollToBottom();
  },
);
</script>

<template>
  <JumpScare />
  <Transition name="boot">
    <BootScreen v-if="booting" @done="finishBoot" />
  </Transition>

  <div class="app-shell">
    <SidebarPanel
      v-model:search="search"
      :sessions="sessions"
      :filtered-sessions="filteredSessions"
      :status-of="(session) => effectiveStatus(session.runs.at(-1))"
      :similar-ids="similarIds"
      :search-status="semanticLabel"
      :active-id="activeId"
      :running-count="runningCount"
      @new="newChat"
      @select="selectChat"
      @rename="openAction('rename', $event)"
      @delete="openAction('delete', $event)"
      @palette="paletteOpen = true"
      @settings="settingsOpen = true"
      :current-page="currentPage"
      :user="account.account.user"
      @navigate="navigate"
    />

    <Sheet v-model:open="sidebarOpen">
      <SheetContent
        side="left"
        class="w-[288px] max-w-[85vw] gap-0 border-0 p-0 [&>button.absolute]:hidden"
      >
        <SheetTitle class="sr-only">Simulation conversations</SheetTitle>
        <SheetDescription class="sr-only">Switch, rename, or delete simulations.</SheetDescription>
        <SidebarPanel
          v-model:search="search"
          closable
          :sessions="sessions"
          :filtered-sessions="filteredSessions"
          :status-of="(session) => effectiveStatus(session.runs.at(-1))"
          :similar-ids="similarIds"
          :search-status="semanticLabel"
          :active-id="activeId"
          :running-count="runningCount"
          @new="newChat"
          @select="selectChat"
          @rename="openAction('rename', $event)"
          @delete="openAction('delete', $event)"
          @palette="
            sidebarOpen = false;
            paletteOpen = true;
          "
          @settings="
            sidebarOpen = false;
            settingsOpen = true;
          "
          :current-page="currentPage"
          :user="account.account.user"
          @navigate="navigate"
          @close="sidebarOpen = false"
        />
      </SheetContent>
    </Sheet>

    <div class="main-shell">
      <header class="topbar">
        <div class="breadcrumb mono">
          <button
            class="icon-btn mobile-only"
            aria-label="Open simulation sidebar"
            :aria-expanded="sidebarOpen"
            @click="sidebarOpen = true"
          >
            <PanelLeft :size="16" />
          </button>
          <span>workspace</span><span>/</span>
          <span class="current">{{ currentPage === "simulations" ? activeSession?.title : PAGE_TITLES[currentPage] }}</span>
        </div>
        <div class="topbar-right">
          <StatusBadge
            v-if="runningCount"
            role="status"
            variant="chip"
            status="running"
            :label="`${runningCount} running`"
          />
          <button class="mode-chip" aria-label="Model and data settings" @click="settingsOpen = true">
            <StatusBadge
              variant="chip"
              size="sm"
              :status="research.ready.value ? 'completed' : 'draft'"
              :label="research.modeLabel.value"
            />
          </button>
          <nav v-if="currentPage === 'simulations'" class="segmented mono" aria-label="Workspace view">
            <button
              v-for="view in views"
              :key="view"
              :class="{ active: activeView === view }"
              :aria-pressed="activeView === view"
              @click="activeView = view"
            >
              {{ view }}
            </button>
          </nav>
        </div>
      </header>

      <div v-if="storageWarning" class="notice" role="alert">
        <span class="mono">note —</span><span>{{ storageWarning }}</span>
      </div>

      <div v-if="currentPage !== 'simulations'" class="tool-shell">
        <LibraryPage v-if="currentPage === 'library'" ref="toolPage" />
        <StudyBuildPage v-else-if="currentPage === 'build'" ref="toolPage" @rehearse="rehearsePrompt" />
        <PreflightPage v-else-if="currentPage === 'preflight'" ref="toolPage" />
        <TimelinePage v-else ref="toolPage" />
      </div>
      <main
        v-else-if="activeSession"
        ref="workspaceEl"
        class="workspace"
        :class="`view-${activeView}`"
        :style="workspaceStyle"
      >
        <section class="chat-panel" aria-label="Simulation chat">
          <div ref="messageList" class="message-scroll">
            <div v-if="!activeSession.messages.length" class="welcome">
              <FlickeringGrid
                v-if="!reducedMotion"
                class="welcome-bg"
                color="#cc785c"
                :square-size="3"
                :grid-gap="9"
                :flicker-chance="0.12"
                :max-opacity="0.16"
              />
              <div class="column">
                <BlurReveal :key="activeId" :delay="0.12" :duration="0.6" blur="8px" :y-offset="10">
                  <p class="eyebrow mono">
                    <span class="beta-pill">beta</span> trial ops copilot — track 2 · clinical research
                  </p>
                  <h1>rehearse the trial<br />before it reaches your sites.</h1>
                  <p class="welcome-copy">
                    test a protocol change against participants, sites, oversight and sponsors — then
                    check your documents and start-up plan. every run is a cited, exportable record.
                  </p>
                  <div class="starters">
                    <button
                      v-for="(starter, index) in starters"
                      :key="starter.title"
                      class="starter"
                      @click="useStarter(starter.prompt)"
                    >
                      <span class="glyph-link">{{ starter.title }}</span>
                      <span class="mono">0{{ index + 1 }}</span>
                      <span class="starter-prompt">{{ starter.prompt }}</span>
                    </button>
                  </div>
                  <div class="toolkit">
                    <button v-for="tool in tools" :key="tool.page" class="tool-card" @click="navigate(tool.page)">
                      <span class="glyph-link">{{ tool.title }}</span>
                      <span class="tool-note">{{ tool.note }}</span>
                    </button>
                  </div>
                  <p class="welcome-note mono">local-first · your key, your data · ⌘k to jump anywhere</p>
                </BlurReveal>
              </div>
            </div>

            <div v-else class="column messages">
              <div class="date-label mono">
                {{
                  new Date(activeSession.createdAt)
                    .toLocaleDateString(undefined, { month: "long", day: "numeric" })
                    .toLowerCase()
                }}
              </div>
              <TransitionGroup name="msg">
                <article
                  v-for="message in activeSession.messages"
                  :key="message.id"
                  class="message"
                  :class="`message-${message.role}`"
                >
                  <div class="message-label mono">
                    <template v-if="message.role === 'user'">you</template>
                    <template v-else-if="runForMessage(message)"
                      >lookahead — run {{ runIndex(runForMessage(message)) }} —
                      {{ research.records[runForMessage(message).id]?.mode === "openai"
                        ? `11 stakeholders — ${research.records[runForMessage(message).id].provenance?.model || research.records[runForMessage(message).id].provenance?.requestedModel || "openai"}`
                        : `${runForMessage(message).agentCount} agents — demo` }}</template
                    >
                    <template v-else>lookahead — demo</template>
                  </div>
                  <p
                    v-if="!(message.role === 'assistant' && research.records[message.runId]?.mode === 'openai')"
                    class="message-text"
                  >
                    {{ message.content }}
                  </p>
                  <p v-else class="message-text">
                    stakeholder analysis for this scenario — saved as a research record with full provenance.
                  </p>
                  <div
                    v-if="
                      message.role === 'assistant' &&
                      runForMessage(message) &&
                      !(research.records[runForMessage(message).id]?.mode === 'openai' && research.status[runForMessage(message).id] !== 'analyzing')
                    "
                    class="run-block"
                    :class="`run-${runForMessage(message).status}`"
                  >
                    <div class="run-head">
                      <StatusBadge
                        :status="runForMessage(message).status"
                        :progress="runForMessage(message).progress"
                        :meta="runMeta(runForMessage(message))"
                      />
                      <span class="pct mono">run {{ runIndex(runForMessage(message)) }}</span>
                    </div>
                    <div
                      class="progress"
                      role="progressbar"
                      :aria-label="`Demo progress for ${runForMessage(message).prompt}`"
                      :aria-valuenow="Math.round(runForMessage(message).progress)"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <div :style="{ width: `${runForMessage(message).progress}%` }"></div>
                    </div>
                    <SampleRack
                      v-if="runForMessage(message).status === 'running' || research.status[runForMessage(message).id] === 'analyzing'"
                      :progress="runForMessage(message).progress"
                    />
                    <div class="run-foot mono">
                      <span>{{ runForMessage(message).stage.toLowerCase() }}</span>
                      <button
                        v-if="runForMessage(message).id === latestRun?.id && activeView === 'chat'"
                        class="glyph-link"
                        @click="activeView = 'split'"
                      >
                        open in graph
                      </button>
                    </div>
                  </div>
                  <AnalysisPanel
                    v-if="message.role === 'assistant' && runForMessage(message)"
                    :record="research.records[runForMessage(message).id] ?? null"
                    :status="research.status[runForMessage(message).id] ?? ''"
                    :latest="runForMessage(message).id === latestRun?.id"
                    @retry="retryAnalysis(runForMessage(message))"
                    @export="research.exportRun(runForMessage(message).id, $event)"
                    @graph="activeView = 'split'"
                  />
                  <EvidencePanel
                    v-if="research.records[message.runId]?.mode === 'openai' && research.records[message.runId]?.analysis?.inScope"
                    :deliberation="research.records[message.runId].deliberation"
                    :progress="research.progress[message.runId] ?? null"
                    :can-run="research.ready.value"
                    @deliberate="research.deliberate(message.runId)"
                  />
                </article>
              </TransitionGroup>
            </div>
          </div>

          <div class="column composer-area">
            <div v-if="isRunning" class="background-hint mono" role="status">
              <StatusIcon status="running" :size="12" />this demo keeps running when you switch chats
            </div>
            <form class="composer" @submit.prevent="submitRun">
              <label class="sr-only" for="simulation-prompt">Simulation question</label>
              <textarea
                id="simulation-prompt"
                ref="composer"
                v-model="activeSession.draft"
                :maxlength="PROMPT_LIMIT"
                rows="2"
                :placeholder="
                  isRunning
                    ? 'draft your next question while this demo runs…'
                    : activeSession.messages.length
                      ? 'ask a follow-up or explore another possibility…'
                      : 'what would you like to simulate?'
                "
                @keydown="composerKeydown"
              ></textarea>
              <div class="composer-toolbar mono">
                <span v-if="voice.listening.value" class="voice-status" role="status">
                  <StatusIcon status="running" :size="12" />
                  {{ voice.pending.value ? "transcribing…" : voice.interim.value || "listening" }} · say “run it” to send
                </span>
                <span v-else-if="checking" role="status">checking scope…</span>
                <span v-else-if="research.settings.mode === 'openai'">sent to openai with your key · trial &amp; health scenarios only</span>
                <span v-else>12 demo agents · trial &amp; health scenarios only</span>
                <button
                  v-if="voice.supported"
                  class="mic-btn"
                  :class="{ live: voice.listening.value }"
                  type="button"
                  :aria-pressed="voice.listening.value"
                  :aria-label="voice.listening.value ? 'Stop dictation' : 'Dictate (⌘⇧Space)'"
                  :title="voice.listening.value ? 'stop dictation' : 'dictate · ⌘⇧space'"
                  @click="toggleVoice"
                >
                  <MicOff v-if="voice.listening.value" :size="15" /><Mic v-else :size="15" />
                </button>
                <button
                  v-if="isRunning"
                  class="stop-btn mono"
                  type="button"
                  @click="stopRun(activeId)"
                >
                  <Square :size="11" fill="currentColor" /> stop
                </button>
                <button
                  v-else
                  class="send-btn"
                  type="submit"
                  aria-label="Run simulation"
                  :disabled="!canSubmit"
                >
                  <ArrowUp :size="16" />
                </button>
              </div>
            </form>
            <p v-if="submitError" class="submit-error" role="alert">{{ submitError }}</p>
            <p v-if="voice.error.value" class="submit-error" role="alert">{{ voice.error.value }}</p>
            <p v-else-if="voice.listening.value && voice.engine.value === 'browser'" class="voice-note mono">using your browser's speech service (audio may go to google or apple). add an openai key for private-to-your-key transcription.</p>
            <div class="composer-hints mono">
              <span class="keys">enter to run · shift+enter for newline</span>
              <span>{{ research.settings.mode === "openai" ? "model estimates · not medical advice" : "demo runs · not medical advice" }}</span>
            </div>
          </div>
        </section>

        <div
          v-if="activeView === 'split'"
          class="split-handle"
          role="separator"
          tabindex="0"
          aria-orientation="vertical"
          aria-label="Resize chat and graph"
          :aria-valuenow="Math.round(splitRatio)"
          aria-valuemin="30"
          aria-valuemax="70"
          @pointerdown="startResize"
          @keydown="resizeKeydown"
        ></div>

        <section v-if="activeView !== 'chat'" class="graph-pane" aria-label="Simulation graph">
          <SimulationGraph :run="graphRun" :stances="latestStances" :stance-source="latestRecord?.provenance?.model || ''" :session-title="activeSession.title" />
          <div v-if="activeView === 'graph' && isRunning" class="graph-stop">
            <button class="stop-btn mono" @click="stopRun(activeId)">
              <Square :size="11" fill="currentColor" /> stop
            </button>
          </div>
        </section>
      </main>
    </div>

    <SettingsDialog v-if="settingsMounted" v-model:open="settingsOpen" :research="research" :account="account" :cloud="cloud" />

    <Dialog v-model:open="paletteOpen">
      <DialogContent class="overlay-surface overflow-hidden p-0" :show-close-button="false">
        <DialogTitle class="sr-only">Jump to chat</DialogTitle>
        <DialogDescription class="sr-only">Search saved simulations by keyword or meaning</DialogDescription>
        <Command :should-filter="false" @update:search-term="paletteTerm = $event">
          <CommandInput placeholder="search chats by keyword or meaning…" class="mono text-[12.5px]" />
          <CommandList>
            <CommandGroup v-if="!paletteTerm.trim()" heading="actions">
              <CommandItem value="new simulation" class="mono" @select="newChat">
                new simulation
              </CommandItem>
              <CommandItem value="source library" class="mono" @select="navigate('library')">
                source library
              </CommandItem>
              <CommandItem value="study build" class="mono" @select="navigate('build')">
                study build
              </CommandItem>
              <CommandItem value="document preflight" class="mono" @select="navigate('preflight')">
                document preflight
              </CommandItem>
              <CommandItem value="start-up timeline" class="mono" @select="navigate('timeline')">
                start-up timeline
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="chats">
              <CommandItem
                v-for="session in paletteSessions"
                :key="session.id"
                :value="session.id"
                @select="selectChat(session.id)"
              >
                <StatusIcon :status="effectiveStatus(session.runs.at(-1))" :size="12" />
                <span class="truncate">{{ session.title }}</span>
                <span v-if="paletteSimilarIds.has(session.id)" class="similar-tag mono">≈ similar</span>
              </CommandItem>
            </CommandGroup>
            <p v-if="!paletteSessions.length" class="mono py-6 text-center text-[12px] text-[var(--faint)]">
              nothing matches
            </p>
          </CommandList>
          <div class="palette-foot mono">
            <StatusIcon :status="{ loading: 'running', ready: 'completed', unavailable: 'stopped' }[semantic.status.value] ?? 'draft'" :size="12" />
            {{ semanticLabel }}
          </div>
        </Command>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="overlay-surface sm:max-w-[420px]" :show-close-button="false">
        <form class="grid gap-4" @submit.prevent="confirmAction">
          <DialogTitle class="dialog-title">
            {{ dialogAction === "rename" ? "rename simulation" : "delete simulation?" }}
          </DialogTitle>
          <template v-if="dialogAction === 'rename'">
            <DialogDescription class="sr-only">Choose a new name.</DialogDescription>
            <div>
              <label class="field-label mono" for="simulation-title">name</label>
              <Input
                id="simulation-title"
                v-model="editedTitle"
                :maxlength="TITLE_LIMIT"
                autocomplete="off"
                required
                class="bg-[var(--canvas)]"
                @focus="$event.target.select()"
              />
            </div>
          </template>
          <DialogDescription v-else class="dialog-copy">
            “{{ dialogSession?.title }}” and its conversation will be removed from this device.{{
              dialogSessionRunning ? " its running demo will also stop." : ""
            }}
          </DialogDescription>
          <DialogFooter class="gap-2">
            <button type="button" class="stop-btn mono neutral" @click="dialogOpen = false">
              cancel
            </button>
            <button
              type="submit"
              class="confirm-btn mono"
              :class="{ danger: dialogAction === 'delete' }"
              :disabled="dialogAction === 'rename' && !editedTitle.trim()"
            >
              {{ dialogAction === "rename" ? "save name" : "delete" }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
