<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { ArrowUp, PanelLeft, Square } from "@lucide/vue";
import SidebarPanel from "./components/SidebarPanel.vue";
import BootScreen from "./components/fx/BootScreen.vue";
import { BlurReveal } from "./components/ui/blur-reveal";
import { FlickeringGrid } from "./components/ui/flickering-grid";
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
import { useSimulationWorkspace } from "./composables/useSimulationWorkspace.js";
import { PROMPT_LIMIT, TITLE_LIMIT } from "./lib/simulationWorkspace.js";

// Vue Flow is only needed once the graph is opened.
const SimulationGraph = defineAsyncComponent(() => import("./components/SimulationGraph.vue"));

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

const isMac =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform);
const starters = [
  {
    title: "explore a community",
    prompt: "How might a community respond to a new neighborhood health clinic?",
  },
  {
    title: "compare two approaches",
    prompt: "How might appointment reminders by text compare with reminders by phone?",
  },
  {
    title: "test a what-if",
    prompt: "What might change if a clinic offered evening and weekend appointments?",
  },
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
const canSubmit = computed(
  () => Boolean(activeSession.value?.draft.trim()) && !isRunning.value,
);

function runForMessage(message) {
  return activeSession.value?.runs.find((run) => run.id === message.runId);
}
function runIndex(run) {
  return String(activeSession.value.runs.indexOf(run) + 1).padStart(2, "0");
}
function runTitle(run) {
  return { running: "running", completed: "done", stopped: "stopped" }[run.status] ?? run.status;
}

function selectChat(id) {
  selectSession(id);
  sidebarOpen.value = false;
  paletteOpen.value = false;
  submitError.value = "";
}
async function newChat() {
  paletteOpen.value = false;
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
function submitRun() {
  if (!canSubmit.value) return;
  const run = startRun(activeId.value, activeSession.value.draft);
  submitError.value = run
    ? ""
    : "this run could not start — check the workspace notice and try again.";
}
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
}
onMounted(() => {
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
  <Transition name="boot">
    <BootScreen v-if="booting" @done="finishBoot" />
  </Transition>

  <div class="app-shell">
    <SidebarPanel
      v-model:search="search"
      :sessions="sessions"
      :filtered-sessions="filteredSessions"
      :similar-ids="similarIds"
      :search-status="semanticLabel"
      :active-id="activeId"
      :running-count="runningCount"
      @new="newChat"
      @select="selectChat"
      @rename="openAction('rename', $event)"
      @delete="openAction('delete', $event)"
      @palette="paletteOpen = true"
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
          <span class="current">{{ activeSession?.title }}</span>
        </div>
        <div class="topbar-right">
          <span v-if="runningCount" class="pill mono" role="status"
            ><span class="dot running"></span>{{ runningCount }} running</span
          >
          <span class="pill mono demo-pill">demo</span>
          <nav class="segmented mono" aria-label="Workspace view">
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

      <main
        v-if="activeSession"
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
                  <p class="eyebrow mono">a little curiosity — a world of possibilities</p>
                  <h1>one question.<br />many possible futures.</h1>
                  <p class="welcome-copy">
                    give each what-if its own chat. explore a scenario, then start another alongside
                    it — runs keep going in parallel.
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
                  <p class="welcome-note mono">separate conversations — independent simulations</p>
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
                      >microfish — run {{ runIndex(runForMessage(message)) }} —
                      {{ runForMessage(message).agentCount }} agents — demo</template
                    >
                    <template v-else>microfish — demo</template>
                  </div>
                  <p class="message-text">{{ message.content }}</p>
                  <div
                    v-if="message.role === 'assistant' && runForMessage(message)"
                    class="run-block"
                    :class="`run-${runForMessage(message).status}`"
                  >
                    <div class="run-head mono">
                      <span class="dot" :class="runForMessage(message).status"></span>
                      <span>{{ runTitle(runForMessage(message)) }}</span>
                      <span class="pct">{{ Math.round(runForMessage(message).progress) }}%</span>
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
                </article>
              </TransitionGroup>
            </div>
          </div>

          <div class="column composer-area">
            <div v-if="isRunning" class="background-hint mono" role="status">
              <span class="dot running"></span>this demo keeps running when you switch chats
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
                <span>12 demo agents</span>
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
            <div class="composer-hints mono">
              <span class="keys">enter to run · shift+enter for newline</span>
              <span>demo runs only — no engine connected</span>
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
          <SimulationGraph :run="latestRun" :session-title="activeSession.title" />
          <div v-if="activeView === 'graph' && isRunning" class="graph-stop">
            <button class="stop-btn mono" @click="stopRun(activeId)">
              <Square :size="11" fill="currentColor" /> stop
            </button>
          </div>
        </section>
      </main>
    </div>

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
            </CommandGroup>
            <CommandGroup heading="chats">
              <CommandItem
                v-for="session in paletteSessions"
                :key="session.id"
                :value="session.id"
                @select="selectChat(session.id)"
              >
                <span class="dot" :class="session.runs.at(-1)?.status"></span>
                <span class="truncate">{{ session.title }}</span>
                <span v-if="paletteSimilarIds.has(session.id)" class="similar-tag mono">≈ similar</span>
              </CommandItem>
            </CommandGroup>
            <p v-if="!paletteSessions.length" class="mono py-6 text-center text-[12px] text-[var(--faint)]">
              nothing matches
            </p>
          </CommandList>
          <div class="palette-foot mono">
            <span class="dot" :class="{ running: semantic.status.value === 'loading', completed: semantic.status.value === 'ready' }"></span>
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
