<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import gsap from "gsap";

const emit = defineEmits(["done"]);
const root = ref(null);
const letters = "microfish.".split("");
let timeline;
let fallback;
let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  emit("done");
}

onMounted(() => {
  const chars = root.value.querySelectorAll(".boot-word span");
  timeline = gsap
    .timeline({ onComplete: finish })
    .from(chars, {
      y: 12,
      opacity: 0,
      duration: 0.45,
      ease: "power3.out",
      stagger: 0.04,
    })
    .from(".boot-caption", { opacity: 0, duration: 0.3 }, "<0.2")
    .to(root.value, { opacity: 0, duration: 0.35, ease: "power2.inOut" }, "+=0.3");
  // GSAP pauses with requestAnimationFrame in hidden tabs; never hold the app behind the boot.
  fallback = window.setTimeout(finish, 2000);
});
onBeforeUnmount(() => {
  timeline?.kill();
  window.clearTimeout(fallback);
});
</script>

<template>
  <div ref="root" class="boot" aria-hidden="true" @click="finish">
    <div class="boot-word">
      <span
        v-for="(char, index) in letters"
        :key="index"
        :style="char === '.' ? { color: 'var(--accent)' } : null"
        >{{ char }}</span
      >
    </div>
    <span class="boot-caption mono">booting local demo — 12 agents</span>
  </div>
</template>
