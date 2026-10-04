<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { X } from "lucide-vue-next";
const props = defineProps({ title: String, wide: Boolean, drawer: Boolean });
const emit = defineEmits(["close"]);
const panel = ref(null);
let previousFocus;
function keydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key !== "Tab") return;
  const elements = [
    ...panel.value.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex="0"]',
    ),
  ].filter((e) => !e.disabled && e.offsetParent !== null);
  const first = elements[0],
    last = elements[elements.length - 1];
  if (!first) {
    event.preventDefault();
    panel.value.focus();
    return;
  }
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === panel.value)
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
onMounted(() => {
  previousFocus = document.activeElement;
  document.body.style.overflow = "hidden";
  panel.value.focus();
  document.addEventListener("keydown", keydown);
});
onBeforeUnmount(() => {
  document.body.style.overflow = "";
  document.removeEventListener("keydown", keydown);
  previousFocus?.focus();
});
</script>
<template>
  <Teleport to="body">
    <div
      class="modal-backdrop"
      :class="{ 'drawer-backdrop': drawer }"
      @mousedown.self="emit('close')"
    >
      <section
        ref="panel"
        class="modal"
        :class="{ 'modal-wide': wide, 'modal-drawer': drawer }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabindex="-1"
      >
        <header class="modal-header">
          <h2 id="modal-title">{{ title }}</h2>
          <button
            class="icon-button"
            aria-label="Close dialog"
            @click="emit('close')"
          >
            <X :size="20" />
          </button>
        </header>
        <div class="modal-body"><slot /></div>
        <footer v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>
