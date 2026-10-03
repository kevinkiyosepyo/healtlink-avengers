<script setup>
import { Ellipsis, Pencil, Plus, Search, Trash2, X } from "@lucide/vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

defineProps({
  sessions: { type: Array, required: true },
  filteredSessions: { type: Array, required: true },
  similarIds: { type: Set, default: () => new Set() },
  searchStatus: { type: String, default: "" },
  activeId: { type: String, default: null },
  runningCount: { type: Number, default: 0 },
  closable: { type: Boolean, default: false },
});
const search = defineModel("search", { type: String, default: "" });
const emit = defineEmits(["new", "select", "rename", "delete", "palette", "close"]);

function sessionStatus(session) {
  return session.runs.at(-1)?.status ?? "draft";
}
function statusText(session) {
  const status = { running: "running", completed: "done", stopped: "stopped" }[
    sessionStatus(session)
  ];
  const runs = session.runs.length;
  if (!status) return "draft";
  return `${status} · ${runs} ${runs === 1 ? "run" : "runs"}`;
}
const isMac =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform);
</script>

<template>
  <aside class="sidebar" aria-label="Simulation conversations">
    <div class="sidebar-brand">
      <span class="brand">microfish<span class="brand-period">.</span></span>
      <button v-if="closable" class="icon-btn" aria-label="Close sidebar" @click="emit('close')">
        <X :size="16" />
      </button>
    </div>

    <div class="sidebar-actions">
      <button class="sidebar-row-button new-chat-button" @click="emit('new')">
        <Plus :size="15" /> new simulation
      </button>
      <button class="sidebar-row-button" @click="emit('palette')">
        <Search :size="15" /> jump to chat
        <span class="kbd mono">{{ isMac ? "⌘" : "ctrl " }}k</span>
      </button>
      <Input
        v-model="search"
        type="search"
        placeholder="filter chats — keyword or meaning"
        aria-label="Filter simulations"
        class="mono h-8 border-[var(--hairline)] bg-[var(--canvas)] text-[12px] placeholder:text-[var(--faint)]"
      />
    </div>

    <div class="section-label mono">
      <span>{{ search.trim() ? searchStatus : "chats" }}</span><span>{{ search.trim() ? filteredSessions.length : sessions.length }}</span>
    </div>

    <nav class="conversation-list" aria-label="Saved simulations">
      <p v-if="!filteredSessions.length" class="no-results mono">
        nothing matches "{{ search.trim() }}"
      </p>
      <TransitionGroup name="list">
        <div
          v-for="session in filteredSessions"
          :key="session.id"
          class="conversation-row"
          :class="{ selected: activeId === session.id }"
        >
          <button
            class="conversation-button"
            :aria-current="activeId === session.id ? 'page' : undefined"
            @click="emit('select', session.id)"
          >
            <span class="conversation-title">{{ session.title }}</span>
            <span class="conversation-status mono">
              <span class="dot" :class="sessionStatus(session)"></span>{{ statusText(session) }}
              <span v-if="similarIds.has(session.id)" class="similar-tag">≈ similar</span>
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button class="row-menu-button" :aria-label="`Options for ${session.title}`">
                <Ellipsis :size="15" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="overlay-surface w-40">
              <DropdownMenuItem class="mono" @select="emit('rename', session)">
                <Pencil /> rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                class="mono text-[var(--danger)] focus:text-[var(--danger)]"
                @select="emit('delete', session)"
              >
                <Trash2 class="text-[var(--danger)]" /> delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TransitionGroup>
    </nav>

    <div class="sidebar-footer mono">
      <p v-if="runningCount">
        <span class="dot running" style="display: inline-block; margin-right: 6px"></span
        >{{ runningCount }} running — other chats keep going
      </p>
      <p v-else>room for every what-if — runs continue in parallel</p>
      <div class="identity">
        <span class="avatar">m</span>
        <span>my workspace</span>
        <span class="pill mono" style="margin-left: auto">local demo</span>
      </div>
    </div>
  </aside>
</template>
