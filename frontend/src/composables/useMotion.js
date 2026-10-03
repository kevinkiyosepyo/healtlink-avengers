import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import Lenis from "lenis";

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

// Smooth scrolling for one scroll container (DESIGN.md §8: lists only, never the page).
export function useLenis(wrapperRef) {
  const lenis = ref(null);
  let frame;

  function destroy() {
    cancelAnimationFrame(frame);
    lenis.value?.destroy();
    lenis.value = null;
  }
  function create(wrapper) {
    destroy();
    if (!wrapper || prefersReducedMotion()) return;
    const instance = new Lenis({
      wrapper,
      content: wrapper.firstElementChild ?? wrapper,
      eventsTarget: wrapper,
      lerp: 0.14,
      smoothWheel: true,
      // Keep nested scrollables (e.g. the composer textarea) native.
      prevent: (node) => node.tagName === "TEXTAREA",
    });
    lenis.value = instance;
    const raf = (time) => {
      instance.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
  }

  onMounted(() => create(wrapperRef.value));
  watch(wrapperRef, (wrapper) => create(wrapper));
  onBeforeUnmount(destroy);

  // Content changes size as runs arrive; Lenis must re-measure before scrolling.
  function scrollToBottom() {
    const wrapper = wrapperRef.value;
    if (!wrapper) return;
    if (lenis.value) {
      lenis.value.resize();
      lenis.value.scrollTo(wrapper.scrollHeight, { immediate: true });
    } else {
      wrapper.scrollTop = wrapper.scrollHeight;
    }
  }
  return { scrollToBottom };
}
