<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import AppIcon from "./components/AppIcon.vue";
import SimulationGraph from "./components/SimulationGraph.vue";
import { useSimulationWorkspace } from "./composables/useSimulationWorkspace.js";
import { PROMPT_LIMIT, TITLE_LIMIT } from "./lib/simulationWorkspace.js";

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
const activeView = ref("Chat");
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
const isRunning = computed(() => latestRun.value?.status === "running");
const canSubmit = computed(
  () => Boolean(activeSession.value?.draft.trim()) && !isRunning.value,
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
      draft: "Draft",
    }[status] || "Draft"
  );
}
function runForMessage(message) {
  return activeSession.value?.runs.find((run) => run.id === message.runId);
}
function selectChat(id) {
  selectSession(id);
  menuId.value = null;
  sidebarOpen.value = false;
  submitError.value = "";
}
async function newChat() {
  if (!createSession()) return;
  search.value = "";
  sidebarOpen.value = false;
  activeView.value = "Chat";
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
  <div
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
        <span class="brand-symbol"><AppIcon name="fish" :size="28" /></span
        ><span class="brand">microfish<span class="brand-period">.</span></span
        ><button
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
            selected: activeId === session.id,
            'has-menu': menuId === session.id,
          }"
        >
          <button
            class="conversation-button"
            :aria-current="activeId === session.id ? 'page' : undefined"
            @click="selectChat(session.id)"
          >
            <AppIcon name="chat" :size="17" /><span class="conversation-text"
              ><span class="conversation-title">{{ session.title }}</span
              ><span class="conversation-status"
                ><span class="status-dot" :class="sessionStatus(session)"></span
                >{{ statusLabel(sessionStatus(session))
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
        <div class="parallel-notice">
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
        <div class="workspace-identity">
          <span class="workspace-avatar">M</span>
          <div>
            <strong>My workspace</strong><span>Saved on this device</span>
          </div>
          <AppIcon name="lock" :size="15" />
        </div>
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
          ><span class="breadcrumb-parent">Workspace</span
          ><span class="breadcrumb-divider">/</span
          ><span class="current-title">{{ activeSession?.title }}</span>
        </div>
        <div class="header-status">
          <span v-if="runningCount" class="running-badge" role="status"
            ><span class="status-dot running"></span
            >{{ runningCount }} running</span
          ><span class="demo-badge"><span></span>Demo mode</span>
        </div>
      </header>
      <main v-if="activeSession" class="workspace">
        <div class="workspace-toolbar">
          <div class="workspace-heading">
            <AppIcon name="layers" :size="18" /><span
              >Simulation workspace</span
            >
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
                <div class="welcome-emblem">
                  <AppIcon name="fish" :size="43" /><span
                    class="emblem-dot"
                  ></span>
                </div>
                <p class="eyebrow">
                  A LITTLE CURIOSITY. A WORLD OF POSSIBILITIES.
                </p>
                <h1>One question.<br />Many possible futures.</h1>
                <p class="welcome-copy">
                  Give your next what-if a space of its own.<br />Explore a
                  scenario, then start another alongside it.
                </p>
                <div class="starter-grid">
                  <button
                    v-for="starter in starters"
                    :key="starter.title"
                    class="starter-card"
                    @click="useStarter(starter.prompt)"
                  >
                    <AppIcon :name="starter.icon" :size="20" /><strong>{{
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
                <div class="welcome-note">
                  <AppIcon name="layers" :size="15" /><span
                    >Separate conversations. Independent simulations.</span
                  >
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
                    <AppIcon name="fish" :size="22" />
                  </div>
                  <div class="message-body">
                    <div
                      v-if="message.role === 'assistant'"
                      class="assistant-name"
                    >
                      Microfish <span>DEMO</span>
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
                                  ? "Demo run complete"
                                  : "Demo run stopped"
                            }}</strong
                            ><span
                              >Local demo ·
                              {{ runForMessage(message).agentCount }}
                              illustrative agents</span
                            >
                          </div>
                          <span class="run-percentage"
                            >{{
                              Math.round(runForMessage(message).progress)
                            }}%</span
                          >
                        </div>
                        <div
                          class="progress-track"
                          role="progressbar"
                          :aria-label="`Demo progress for ${runForMessage(message).prompt}`"
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
                            v-if="runForMessage(message).id === latestRun?.id"
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
                <span class="status-dot running"></span>This demo keeps running
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
                      ? 'Draft your next question while this demo runs…'
                      : activeSession.messages.length
                        ? 'Ask a follow-up or explore another possibility…'
                        : 'What would you like to simulate?'
                  "
                  @keydown="composerKeydown"
                ></textarea>
                <div class="composer-toolbar">
                  <span class="composer-meta"
                    ><AppIcon name="spark" :size="15" /><span
                      >12 demo agents</span
                    ></span
                  ><button
                    v-if="isRunning"
                    class="stop-button"
                    type="button"
                    @click="stopRun(activeId)"
                  >
                    <AppIcon name="stop" :size="13" />Stop demo</button
                  ><button
                    v-else
                    class="send-button"
                    type="submit"
                    :disabled="!canSubmit"
                  >
                    <span>Run simulation</span
                    ><AppIcon name="arrow-up" :size="17" />
                  </button>
                </div>
              </form>
              <p v-if="submitError" class="submit-error" role="alert">
                {{ submitError }}
              </p>
              <p class="composer-disclaimer">
                Demo runs show the workflow. Connect a simulation engine for
                real results.
              </p>
            </div>
          </section>
          <section
            v-if="activeView !== 'Chat'"
            class="graph-container"
            aria-label="Simulation graph"
          >
            <SimulationGraph
              :run="latestRun"
              :session-title="activeSession.title"
            />
            <div v-if="activeView === 'Graph'" class="graph-actions">
              <button class="secondary-button" @click="activeView = 'Chat'">
                <AppIcon name="chat" :size="16" />Back to chat</button
              ><button
                v-if="isRunning"
                class="stop-button"
                @click="stopRun(activeId)"
              >
                <AppIcon name="stop" :size="13" />Stop demo
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
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
              ? " Its running demo will also stop."
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
