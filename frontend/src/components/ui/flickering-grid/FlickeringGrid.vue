<script setup>
import { cn } from "@/lib/utils";
import { computed, onBeforeUnmount, onMounted, ref, toRefs } from "vue";

const props = defineProps({
  squareSize: { type: Number, required: false, default: 4 },
  gridGap: { type: Number, required: false, default: 6 },
  flickerChance: { type: Number, required: false, default: 0.3 },
  color: { type: String, required: false, default: "rgb(0, 0, 0)" },
  width: { type: Number, required: false },
  height: { type: Number, required: false },
  class: { type: String, required: false },
  maxOpacity: { type: Number, required: false, default: 0.3 },
});

const { squareSize, gridGap, flickerChance, color, maxOpacity, width, height } =
  toRefs(props);

const containerRef = ref();
const canvasRef = ref();
const context = ref();

const isInView = ref(false);
const canvasSize = ref({ width: 0, height: 0 });

const computedColor = computed(() => {
  if (!context.value) return "rgba(255, 0, 0,";

  const hex = color.value.replace(/^#/, "");
  const bigint = Number.parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b},`;
});

function setupCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const cols = Math.floor(width / (squareSize.value + gridGap.value));
  const rows = Math.floor(height / (squareSize.value + gridGap.value));

  const squares = new Float32Array(cols * rows);
  for (let i = 0; i < squares.length; i++) {
    squares[i] = Math.random() * maxOpacity.value;
  }
  return { cols, rows, squares, dpr };
}

function updateSquares(squares, deltaTime) {
  for (let i = 0; i < squares.length; i++) {
    if (Math.random() < flickerChance.value * deltaTime) {
      squares[i] = Math.random() * maxOpacity.value;
    }
  }
}

function drawGrid(ctx, width, height, cols, rows, squares, dpr) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "transparent";
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const opacity = squares[i * rows + j];
      ctx.fillStyle = `${computedColor.value}${opacity})`;
      ctx.fillRect(
        i * (squareSize.value + gridGap.value) * dpr,
        j * (squareSize.value + gridGap.value) * dpr,
        squareSize.value * dpr,
        squareSize.value * dpr,
      );
    }
  }
}

const gridParams = ref();

function updateCanvasSize() {
  const newWidth = width.value || containerRef.value.clientWidth;
  const newHeight = height.value || containerRef.value.clientHeight;

  canvasSize.value = { width: newWidth, height: newHeight };
  gridParams.value = setupCanvas(canvasRef.value, newWidth, newHeight);
}

let animationFrameId;
let resizeObserver;
let intersectionObserver;
let lastTime = 0;

function animate(time) {
  if (!isInView.value) return;

  const deltaTime = (time - lastTime) / 1000;
  lastTime = time;

  updateSquares(gridParams.value.squares, deltaTime);
  drawGrid(
    context.value,
    canvasRef.value.width,
    canvasRef.value.height,
    gridParams.value.cols,
    gridParams.value.rows,
    gridParams.value.squares,
    gridParams.value.dpr,
  );
  animationFrameId = requestAnimationFrame(animate);
}

onMounted(() => {
  if (!canvasRef.value || !containerRef.value) return;
  context.value = canvasRef.value.getContext("2d");
  if (!context.value) return;

  updateCanvasSize();

  resizeObserver = new ResizeObserver(() => {
    updateCanvasSize();
  });
  intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      isInView.value = entry.isIntersecting;
      animationFrameId = requestAnimationFrame(animate);
    },
    { threshold: 0 },
  );

  resizeObserver.observe(containerRef.value);
  intersectionObserver.observe(canvasRef.value);
});

onBeforeUnmount(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
});
</script>

<template>
  <div ref="containerRef" :class="cn(`h-full w-full`, props.class)">
    <canvas
      ref="canvasRef"
      class="pointer-events-none"
      :width="canvasSize.width"
      :height="canvasSize.height"
    />
  </div>
</template>
