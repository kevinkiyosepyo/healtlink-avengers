<script setup>
import { Motion } from "motion-v";
import { onMounted, ref, useSlots, watchEffect } from "vue";

const props = defineProps({
  duration: { type: Number, required: false, default: 1 },
  delay: { type: Number, required: false, default: 2 },
  blur: { type: String, required: false, default: "20px" },
  yOffset: { type: Number, required: false, default: 20 },
  class: { type: String, required: false },
});

const container = ref(null);
const childElements = ref([]);
const slots = useSlots();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const children = ref([]);

onMounted(() => {
  // This will reactively capture all content provided in the default slot
  watchEffect(() => {
    children.value = slots.default ? slots.default() : [];
  });
});

function getInitial() {
  return {
    opacity: 0,
    filter: `blur(${props.blur})`,
    y: props.yOffset,
  };
}

function getAnimate() {
  return {
    opacity: 1,
    filter: `blur(0px)`,
    y: 0,
  };
}
</script>

<template>
  <div ref="container" :class="props.class">
    <Motion
      v-for="(child, index) in children"
      :key="index"
      ref="childElements"
      as="div"
      :initial="getInitial()"
      :animate="getAnimate()"
      :transition="{
        duration: props.duration,
        easing: 'easeInOut',
        delay: props.delay * index,
      }"
    >
      <component :is="child" />
    </Motion>
  </div>
</template>
