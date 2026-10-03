<script setup>
defineProps({ name: String, size: { type: Number, default: 18 } });
const paths = {
  search: ["M21 21l-5-5", "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"],
  plus: ["M5 12h14M12 5v14"],
  minus: ["M5 12h14"],
  fit: ["M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5", "M8 8h8v8H8Z"],
  expand: ["M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"],
  collapse: ["M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5"],
  close: ["m6 6 12 12M6 18 18 6"],
  refresh: ["M20 7a8 8 0 1 0 0 10", "M20 3v5h-5"],
  pause: ["M8 5v14M16 5v14"],
  play: ["m8 4 12 8-12 8V4Z"],
  pin: ["m8 3 8 0-1 6 4 5H5l4-5-1-6ZM12 14v7"],
  arrow: ["M4 12h16m-6-6 6 6-6 6"],
  network: [
    "M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM21 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
    "m11 7-5 10m7-10 5 10M7 19h10",
  ],
};
</script>
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      v-for="(path, index) in paths[name] || paths.network"
      :key="index"
      :d="path"
    />
  </svg>
</template>
