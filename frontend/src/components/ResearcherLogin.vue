<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import AppIcon from "./AppIcon.vue";
import UniversitySelection from "./UniversitySelection.vue";

const props = defineProps({
  account: {
    type: Object,
    required: true,
  },
  busy: { type: Boolean, default: false },
  error: { type: String, default: "" },
  university: { type: Object, default: null },
  universityError: { type: String, default: "" },
});
const emit = defineEmits([
  "google",
  "connect",
  "disconnect",
  "signout",
  "continue",
  "demo",
  "save-university",
]);
const heading = ref(null);
const apiKey = ref("");
const keyInput = ref(null);
const localError = ref("");
const universityEditing = ref(false);
const message = computed(() => localError.value || props.error);
const connected = computed(() => Boolean(props.account.user && props.account.openaiConnected));
const googleAvailable = computed(() => props.account.configured);
const isLocalPreview = typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
const liveSignIn = computed(() => isLocalPreview && !googleAvailable.value);
const displayName = computed(() => props.account.user?.name || props.account.user?.email || "Researcher");
const initial = computed(() => displayName.value.trim().charAt(0).toUpperCase());

function clearKey() {
  apiKey.value = "";
  localError.value = "";
}

function connect() {
  if (props.busy || !props.account.user) return;
  const key = apiKey.value.trim();
  if (!key) {
    localError.value = "Enter your OpenAI API key to connect.";
    keyInput.value?.focus();
    return;
  }
  clearKey();
  emit("connect", key);
}

function signout() {
  clearKey();
  emit("signout");
}

function leave(event, mode) {
  if (event === 'continue' && (!props.university || universityEditing.value)) return;
  clearKey();
  emit(event, mode);
}

watch(() => props.account.user?.id || props.account.user?.email, clearKey);
onUnmounted(clearKey);
defineExpose({ focusHeading: () => heading.value?.focus(), clearKey });
</script>

<template>
  <section class="researcher-login" aria-labelledby="researcher-login-heading">
    <div class="login-layout">
      <div class="login-introduction">
        <div class="login-eyebrow"><span></span> Researcher workspace</div>
        <div class="login-brand-mark"><AppIcon name="fish" :size="38" /></div>
        <h1 id="researcher-login-heading" ref="heading" tabindex="-1">
          {{ account.user ? "Your next research step, in focus." : "Explore the paths your research could take." }}
        </h1>
        <p class="login-lead">Explore the paths ahead, uncover bottlenecks, and bring your research team’s next steps into focus.</p>

        <div class="login-benefits">
          <div><span class="login-benefit-icon"><AppIcon name="timeline" :size="19" /></span><div><strong>See what moves next</strong><p>Trace dependencies across your research timeline.</p></div></div>
          <div><span class="login-benefit-icon"><AppIcon name="branch" :size="19" /></span><div><strong>Explore the what-ifs</strong><p>Use AI to examine a scenario from different perspectives.</p></div></div>
          <div><span class="login-benefit-icon"><AppIcon name="people" :size="19" /></span><div><strong>Start with your account</strong><p>Sign in and explore your research workspace.</p></div></div>
        </div>
        <div class="login-footnote"><AppIcon name="spark" :size="16" /><span>Built for the questions before the breakthrough.</span></div>
      </div>

      <div class="login-options">
        <section class="login-setup login-demo-card" aria-labelledby="demo-option-title">
          <div class="login-option-label"><span class="login-option-number">01</span><span>Explore a sample</span><span class="login-fictional-label">Fictional case</span></div>
          <div class="login-setup-heading">
            <h2 id="demo-option-title">Explore a case through 60 perspectives.</h2>
            <p>Open an interactive knowledge graph of the REST-101 study. Follow 60 simulated agents as they review Alex’s research onboarding.</p>
          </div>
          <div class="login-case-preview">
            <span class="login-case-icon"><AppIcon name="graph" :size="22" /></span>
            <div><strong>60 agents. Six areas of expertise.</strong><span>Drag the graph, inspect agents, and follow the scripted review.</span></div>
          </div>
          <button type="button" class="login-demo-button" @click="leave('demo')">Explore the sample case <AppIcon name="arrow-right" :size="17" /></button>
          <p class="login-demo-note">No account or API key needed.</p>
        </section>

        <section class="login-setup login-personal-card" :aria-busy="account.loading || busy" aria-labelledby="personal-option-title">
        <div class="login-option-label"><span class="login-option-number">02</span><span>Your research</span></div>
        <div class="login-setup-heading">
          <h2 id="personal-option-title">{{ account.user ? "Welcome back to your workspace." : "Start your own research." }}</h2>
          <p>Sign in with Google to keep your scenario chats and document checks together. Connect OpenAI to explore your own research questions with AI.</p>
        </div>

        <div v-if="account.loading" class="login-loading" role="status"><span class="login-spinner"></span> Checking your connections…</div>

        <template v-else>
          <section class="login-step" :class="{ 'is-complete': account.user }" aria-labelledby="identity-step-title">
            <div class="login-step-heading">
              <span class="login-step-number" :class="{ complete: account.user }"><AppIcon :name="account.user ? 'check' : 'people'" :size="15" /></span>
              <div><h3 id="identity-step-title">Your Google account</h3><p>{{ account.user ? 'Signed in with Google.' : 'A workspace for your own work.' }}</p></div>
              <span v-if="account.user" class="login-status">Connected</span>
            </div>

            <div v-if="account.user" class="login-user">
              <span class="login-user-avatar" aria-hidden="true">{{ initial }}</span>
              <div class="login-user-details"><strong>{{ displayName }}</strong><span>{{ account.user.email }}</span></div>
              <button type="button" class="login-text-button" :disabled="busy" @click="signout">Sign out</button>
            </div>
            <template v-else>
              <button v-if="googleAvailable" type="button" class="login-google-button" :disabled="busy" @click="emit('google')">
                <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.7Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.5l-3.3-2.6c-.9.6-2 1-3.4 1-2.6 0-4.7-1.7-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.5 13.8a6 6 0 0 1 0-3.6V7.5H3.1a10 10 0 0 0 0 9l3.4-2.7Z"/><path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.5l3.4 2.7A5.8 5.8 0 0 1 12 6.1Z"/></svg>
                {{ busy ? "Connecting…" : "Continue with Google" }}
              </button>
              <template v-else-if="liveSignIn">
                <a class="login-google-button login-live-link" href="https://health-link-hackathon.vercel.app/#/login">Sign in on live website <AppIcon name="arrow-up-right" :size="16" /></a>
                <p class="login-subtle-note">Google sign-in is configured on the live website. This local preview does not have sign-in credentials.</p>
              </template>
              <p v-else class="login-config-note"><AppIcon name="info" :size="15" /><span>Google sign-in is unavailable. Please try again later or explore the demo.</span></p>
            </template>
          </section>

          <UniversitySelection
            v-if="account.user"
            :key="account.user.id || account.user.email"
            :university="university"
            :error="universityError"
            :disabled="busy"
            @save="emit('save-university', $event)"
            @editing="universityEditing = $event"
          />

          <section class="login-step" :class="{ 'is-complete': connected }" aria-labelledby="provider-step-title">
            <div class="login-step-heading">
              <span class="login-step-number" :class="{ complete: connected }"><AppIcon :name="connected ? 'check' : 'spark'" :size="15" /></span>
              <div><h3 id="provider-step-title">Connect OpenAI</h3><p>{{ connected ? 'Your API connection is ready.' : 'Your API key powers AI simulations.' }}</p></div>
              <span v-if="connected" class="login-status">Connected</span>
            </div>

            <template v-if="connected">
              <div class="login-provider-connected"><span class="login-provider-icon"><AppIcon name="spark" :size="22" /></span><div><strong>OpenAI API</strong><span>Ready for AI simulations</span></div><button type="button" class="login-text-button" :disabled="busy" @click="emit('disconnect')">Disconnect</button></div>
              <p class="login-subtle-note">Simulation usage is billed to your OpenAI API account.</p>
            </template>
            <form v-else @submit.prevent="connect">
              <label for="researcher-openai-key">OpenAI API key</label>
              <div class="login-key-field">
                <AppIcon name="lock" :size="16" />
                <input id="researcher-openai-key" ref="keyInput" v-model="apiKey" name="openai-api-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="sk-…" :disabled="!account.user || busy" aria-describedby="openai-key-note" :aria-invalid="Boolean(localError)" @input="localError = ''" />
              </div>
              <p id="openai-key-note" class="login-key-note">Create a key in your <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI dashboard <span class="sr-only">(opens in a new tab)</span><AppIcon name="arrow-up-right" :size="12" /></a>. Simulation usage is billed to that API account, separately from a ChatGPT subscription.</p>
              <button type="submit" class="login-connect-button" :disabled="!account.user || busy || !apiKey.trim()"><AppIcon name="spark" :size="17" />{{ busy ? 'Connecting…' : 'Connect OpenAI' }}</button>
              <p class="login-subtle-note">{{ account.user ? 'Your key is encrypted for this sign-in session and removed when you disconnect or sign out.' : 'Sign in with Google first to connect your key.' }}</p>
            </form>
          </section>

          <p v-if="message" class="login-error" role="alert"><AppIcon name="alert" :size="17" /><span>{{ message }}</span></p>

          <button v-if="account.user" type="button" class="login-continue-button" :disabled="busy || !university || universityEditing" @click="leave('continue', connected ? 'openai' : 'demo')">Open my workspace <AppIcon name="arrow-right" :size="18" /></button>
          <p v-if="account.user && (!university || universityEditing)" class="login-subtle-note">Save your university or institution above to open your workspace.</p>
          <p class="login-save-note"><AppIcon name="lock" :size="14" /><span>Work is saved for your Google account in this browser. Other devices have separate saved work.</span></p>
        </template>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* The login keeps its original palette; workspace styles are independent. */
.researcher-login {
  --ui-canvas: #FFFFFF;
  --ui-surface: #FFFFFF;
  --ui-surface-alt: #F8FAFC;
  --ui-text: #1D1D1F;
  --ui-muted: #5D616B;
  --ui-accent: #2457D6;
  --ui-on-accent: #FFFFFF;
  --ui-border: #E2E7EF;
  --ui-control-border: #737986;
  --ui-hover: #F2F6FC;
  --ui-selected: #EDF3FF;
  --ui-focus: #2457D6;
  --ui-shadow: 0 8px 28px #1E3A5F0A;
  --ui-backdrop: #F0F4FAB8;
  --ui-warning: #82520E;
  --ui-warning-bg: #FFF4DF;
  --ui-danger: #963E30;
  --ui-danger-bg: #FFF0EA;
  --ui-info: #285E7A;
  --ui-info-bg: #EAF4FA;
  --ui-purple: #6C4785;
  --ui-purple-bg: #F4EDF9;
  --green: var(--ui-accent);
  --muted: var(--ui-muted);
  --border: var(--ui-border);
  font-family: var(--font-body);
}
.researcher-login { flex: 1; min-width: 0; min-height: 100dvh; overflow-y: auto; padding: clamp(24px, 5vw, 64px) clamp(16px, 3vw, 40px); background: var(--ui-canvas); color: var(--ui-text); }
.login-layout { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: clamp(28px, 5vw, 72px); max-width: 1180px; margin: 0 auto; align-items: start; }
.login-introduction { padding: 20px 0; position: sticky; top: 28px; }
.login-eyebrow { display: flex; align-items: center; gap: 8px; color: var(--ui-muted); font-size: .75rem; font-weight: 650; letter-spacing: .08em; margin-bottom: 28px; }
.login-eyebrow > span { height: 6px; width: 6px; border-radius: 50%; background: var(--ui-accent); }
.login-brand-mark { display: grid; place-items: center; width: 64px; height: 64px; background: var(--ui-surface-alt); color: var(--ui-accent); border: 1px solid var(--ui-border); border-radius: 18px; margin-bottom: 24px; }
h1 { color: var(--ui-text); font-size: clamp(1.875rem, 3.1vw, 2.625rem); line-height: 1.16; letter-spacing: -.045em; font-weight: 650; margin: 0 0 20px; max-width: 440px; overflow-wrap: anywhere; }
h1:focus { outline: none; }
.login-lead { color: var(--ui-muted); font-size: 1rem; line-height: 1.7; margin: 0 0 32px; max-width: 400px; }
.login-benefits { display: flex; flex-direction: column; gap: 24px; }
.login-benefits > div { display: flex; align-items: flex-start; gap: 14px; }
.login-benefits > div > div { min-width: 0; }
.login-benefit-icon { color: var(--ui-accent); padding-top: 2px; flex-shrink: 0; }
.login-benefits strong { display: block; font-size: .875rem; font-weight: 650; color: var(--ui-text); margin-bottom: 5px; }
.login-benefits p { font-size: .875rem; line-height: 1.65; color: var(--ui-muted); margin: 0; max-width: 320px; }
.login-footnote { border-top: 1px solid var(--ui-border); padding-top: 20px; margin-top: 32px; display: flex; align-items: center; gap: 10px; color: var(--ui-muted); font-size: .75rem; line-height: 1.6; }
.login-setup { min-width: 0; border: 1px solid var(--ui-border); border-radius: 20px; background: var(--ui-surface); padding: clamp(20px, 3vw, 32px); box-shadow: var(--ui-shadow); }
.login-options { display: grid; gap: 24px; min-width: 0; }
.login-demo-card { border-color: #C8D8F5; }
.login-option-label { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--ui-accent); font-size: .75rem; font-weight: 600; margin-bottom: 16px; }
.login-option-number { font-family: var(--font-data); color: var(--ui-muted); margin-right: 2px; }
.login-fictional-label { margin-left: auto; background: var(--ui-selected); padding: 5px 8px; border-radius: 6px; font-size: .6875rem; }
.login-case-preview { display: flex; gap: 14px; padding: 16px 0; border-top: 1px solid var(--ui-border); border-bottom: 1px solid var(--ui-border); }
.login-case-icon { color: var(--ui-accent); padding-top: 3px; flex-shrink: 0; }
.login-case-preview strong { display: block; font-size: .875rem; line-height: 1.5; margin-bottom: 4px; }
.login-case-preview div > span { display: block; font-size: .8125rem; line-height: 1.65; color: var(--ui-muted); }
.login-save-note { display: flex; align-items: flex-start; gap: 7px; font-size: .75rem; line-height: 1.65; color: var(--ui-muted); margin: 18px 0 0; }
.login-save-note svg { flex-shrink: 0; margin-top: 3px; }
.login-small-label { display: block; color: var(--ui-muted); letter-spacing: .04em; font-size: .75rem; font-weight: 600; margin-bottom: 10px; }
.login-setup-heading h2 { font-size: 1.5rem; letter-spacing: -.025em; color: var(--ui-text); line-height: 1.3; font-weight: 650; margin: 0 0 10px; overflow-wrap: anywhere; }
.login-setup-heading > p { font-size: .875rem; color: var(--ui-muted); line-height: 1.65; margin: 0 0 24px; }
.login-step { border-top: 1px solid var(--ui-border); padding-top: 20px; margin-top: 20px; }
.login-step.is-complete, .login-step.is-waiting { background: var(--ui-canvas); }
.login-step-heading { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; margin-bottom: 18px; }
.login-step-heading > div { flex: 1; min-width: min(9rem, 100%); }
.login-step-number { width: 28px; height: 28px; border: 1px solid var(--ui-border); background: var(--ui-surface-alt); color: var(--ui-muted); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: .75rem; font-weight: 650; }
.login-step-number.complete { background: var(--ui-selected); color: var(--ui-accent); }
.login-step-heading h3 { font-size: .875rem; font-weight: 650; color: var(--ui-text); margin: 3px 0 5px; line-height: 1.45; }
.login-step-heading p { font-size: .75rem; line-height: 1.6; color: var(--ui-muted); margin: 0; }
.login-status { display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; font-size: .75rem; color: var(--ui-accent); }
.login-status::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.login-google-button, .login-connect-button, .login-continue-button { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 44px; border: 1px solid var(--ui-control-border); border-radius: 10px; padding: 11px 14px; font-size: .875rem; font-weight: 600; line-height: 1.5; transition: background .15s, border-color .15s; }
.login-google-button { background: var(--ui-surface); color: var(--ui-text); }
.login-live-link { text-decoration: none; background: var(--ui-accent); color: var(--ui-on-accent); border-color: var(--ui-accent); }
.login-live-link:hover { filter: brightness(.94); }
.login-google-button:not(.login-live-link):hover:not(:disabled) { background: var(--ui-hover); }
.login-google-button:disabled, .login-connect-button:disabled { color: var(--ui-muted); background: var(--ui-surface-alt); border-color: var(--ui-border); cursor: not-allowed; }
.login-google-button:disabled svg { opacity: .65; }
.login-subtle-note { margin: 12px 0 0; font-size: .75rem; line-height: 1.7; color: var(--ui-muted); }
.login-config-note { display: flex; align-items: flex-start; gap: 8px; margin: 12px 0 0; color: var(--ui-muted); font-size: .75rem; line-height: 1.65; }
.login-config-note svg { margin-top: 2px; flex-shrink: 0; }
.login-user { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.login-user-avatar { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; color: var(--ui-accent); background: var(--ui-selected); border: 1px solid var(--ui-border); font-size: 1rem; }
.login-user-details { min-width: 0; flex: 1 1 8rem; }
.login-user-details strong { font-size: .875rem; display: block; margin-bottom: 4px; overflow-wrap: anywhere; color: var(--ui-text); font-weight: 600; }
.login-user-details span { display: block; font-size: .75rem; color: var(--ui-muted); overflow-wrap: anywhere; }
.login-text-button { min-height: 36px; border: 0; border-radius: 6px; background: transparent; padding: 8px; font-size: .75rem; color: var(--ui-accent); text-decoration: underline; text-underline-offset: 3px; }
.login-text-button:hover:not(:disabled) { background: var(--ui-hover); }
.login-text-button:disabled { color: var(--ui-muted); cursor: not-allowed; }
form > label { display: block; font-size: .75rem; font-weight: 600; color: var(--ui-text); margin-bottom: 8px; }
.login-key-field { display: flex; align-items: center; gap: 10px; border: 1px solid var(--ui-control-border); background: var(--ui-surface); border-radius: 8px; padding: 0 12px; color: var(--ui-muted); }
.login-key-field:focus-within { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.login-key-field input { border: 0; width: 100%; min-width: 0; min-height: 44px; padding: 11px 0; font-size: 1rem; color: var(--ui-text); background: transparent; outline: none; }
.login-key-field input::placeholder { color: var(--ui-muted); }
.login-key-field input:disabled { cursor: not-allowed; }
.login-key-note { font-size: .75rem; line-height: 1.7; color: var(--ui-muted); margin: 12px 0 16px; }
.login-key-note a { color: var(--ui-accent); text-underline-offset: 3px; }
.login-key-note a svg { display: inline; vertical-align: -2px; }
.login-connect-button { background: var(--ui-selected); border-color: var(--ui-control-border); color: var(--ui-accent); }
.login-connect-button:hover:not(:disabled) { background: var(--ui-hover); }
.login-provider-connected { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.login-provider-icon { width: 36px; height: 36px; display: grid; place-items: center; background: var(--ui-selected); border-radius: 10px; color: var(--ui-accent); flex-shrink: 0; }
.login-provider-connected > div { flex: 1 1 8rem; min-width: 0; }
.login-provider-connected strong { display: block; font-size: .875rem; color: var(--ui-text); margin-bottom: 4px; }
.login-provider-connected > div > span { display: block; font-size: .75rem; color: var(--ui-muted); }
.login-continue-button { margin-top: 24px; background: var(--ui-accent); color: var(--ui-on-accent); border-color: var(--ui-accent); }
.login-continue-button:hover:not(:disabled) { filter: brightness(.94); }
.login-continue-button:disabled { opacity: .65; cursor: not-allowed; }
.login-demo-button { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 46px; padding: 11px 14px; margin-top: 20px; border: 1px solid var(--ui-accent); border-radius: 10px; background: var(--ui-accent); color: var(--ui-on-accent); font-size: .875rem; font-weight: 600; line-height: 1.5; }
.login-demo-button:hover:not(:disabled) { filter: brightness(.94); }
.login-demo-button:disabled { opacity: .65; cursor: not-allowed; }
.login-demo-note { margin: 10px 0 0; color: var(--ui-muted); text-align: center; font-size: .75rem; line-height: 1.6; }
.login-error { display: flex; align-items: flex-start; gap: 8px; margin: 16px 0 0; background: var(--ui-danger-bg); border: 1px solid var(--ui-danger); border-radius: 10px; padding: 12px; color: var(--ui-danger); font-size: .875rem; line-height: 1.65; overflow-wrap: anywhere; }
.login-error > svg { margin-top: 2px; flex-shrink: 0; }
.login-loading { display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--ui-muted); font-size: .875rem; padding: 72px 0; }
.login-spinner { width: 18px; height: 18px; border: 2px solid var(--ui-border); border-top-color: var(--ui-accent); border-radius: 50%; animation: login-spin 1s linear infinite; flex-shrink: 0; }
.researcher-login :is(button, a):focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 3px; }
@keyframes login-spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) { .login-layout { display: block; max-width: 560px; } .login-introduction { padding: 0 0 28px; position: static; } .login-eyebrow { margin-bottom: 16px; } .login-brand-mark, .login-benefits, .login-footnote { display: none; } h1 { max-width: none; margin-bottom: 14px; } .login-lead { max-width: none; margin-bottom: 0; } }
@media (max-width: 480px) { .researcher-login { padding: 24px 16px; } .login-setup { padding: 24px 20px; border-radius: 16px; } .login-options { gap: 20px; } .login-step-heading { gap: 8px; } .login-step-heading > div { min-width: 0; } .login-status { margin-left: 36px; } .login-text-button { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .login-spinner { animation: none; } .researcher-login * { transition: none; } }
</style>
