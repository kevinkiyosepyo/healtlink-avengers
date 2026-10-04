import { createApp } from "vue";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import App from "./App.vue";
import "./style.css";
import "./responsive.css";

window.addEventListener("vite:preloadError", () => {
  const key = "trial-researcher:reload";
  const lastReload = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - lastReload > 60_000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  }
});

createApp(App).mount("#app");
