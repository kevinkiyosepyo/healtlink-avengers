<script setup>
import { ref } from 'vue'

const views = ['Graph', 'Split', 'Workbench']
const activeView = ref('Graph')
const question = ref('')
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="Simulation Starter home">SIMULATION STARTER</a>
      <nav class="view-switcher" aria-label="Workspace view">
        <button
          v-for="view in views"
          :key="view"
          :class="{ active: activeView === view }"
          @click="activeView = view"
        >{{ view }}</button>
      </nav>
      <span class="status"><i></i> Starter</span>
    </header>

    <main class="workspace" :class="`workspace--${activeView.toLowerCase()}`">
      <section class="graph-panel" aria-labelledby="graph-title">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">WORKSPACE</p>
            <h1 id="graph-title">Knowledge graph</h1>
          </div>
          <span class="empty-count">No simulation data</span>
        </div>

        <div class="graph-canvas">
          <div class="empty-state">
            <div class="graph-mark" aria-hidden="true">
              <span class="edge edge-a"></span>
              <span class="edge edge-b"></span>
              <span class="edge edge-c"></span>
              <span class="node node-a"></span>
              <span class="node node-b"></span>
              <span class="node node-c"></span>
            </div>
            <h2>Your graph will appear here</h2>
            <p>Connect a simulation backend to explore entities and relationships.</p>
          </div>
          <div class="legend"><i></i> Entity <i class="relation"></i> Relationship</div>
        </div>
      </section>

      <aside class="setup-panel" aria-labelledby="setup-title">
        <p class="eyebrow">NEW SIMULATION</p>
        <h2 id="setup-title">Set up a scenario</h2>
        <label class="upload-box">
          <span class="upload-icon">＋</span>
          <span><strong>Add a source document</strong><small>PDF, Markdown, or text</small></span>
          <input type="file" accept=".pdf,.md,.txt" disabled />
        </label>
        <label class="field-label" for="question">Simulation question</label>
        <textarea id="question" v-model="question" placeholder="What would you like to explore?" disabled></textarea>
        <button class="start-button" disabled>Backend connection coming next</button>
        <p class="note">This starter is a static UI shell. Simulation controls activate when the backend is connected.</p>
      </aside>
    </main>
  </div>
</template>
