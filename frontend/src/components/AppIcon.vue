<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
});
const paths = {
  fish: [
    "M17 12c-3-6-9-6-14 0 5 6 11 6 14 0Z",
    "m17 12 4-5v10l-4-5Z",
    "M7.5 11.5h.01",
    "m10 7 3-3 1 4",
    "m10 17 3 3 1-4",
  ],
  plus: ["M12 5v14M5 12h14"],
  document: ["M14 2H5v20h14V7l-5-5Z", "M14 2v6h5M8 12h8M8 16h5"],
  "document-check": ["M14 2H5v20h14V7l-5-5Z", "M14 2v6h5m-11 7 2 2 5-5"],
  upload: ["M12 16V3m-5 5 5-5 5 5", "M4 15v6h16v-6"],
  download: ["M12 3v13m-5-5 5 5 5-5", "M4 17v4h16v-4"],
  chevron: ["m9 5 7 7-7 7"],
  question: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z", "M9 9a3 3 0 1 1 5 2c-2 1-2 1-2 3m0 3h.01"],
  timeline: ["M4 3v18M8 6h11M8 12h7M14 18h7", "M8 4v4m0 2v4m6 2v4"],
  calendar: ["M4 5h16v16H4V5Z", "M8 3v4m8-4v4M4 10h16"],
  flag: ["M5 21V3m0 1c5-3 9 3 14 0v10c-5 3-9-3-14 0"],
  clock: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z", "M12 6v6l4 2"],
  reset: ["M3 11a9 9 0 1 1 2 7", "M3 4v7h7"],
  "arrow-right": ["M4 12h16m-6-6 6 6-6 6"],
  alert: ["m12 3 10 18H2L12 3Z", "M12 9v5m0 3h.01"],
  search: ["M21 21l-5-5", "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"],
  chat: [
    "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
  ],
  more: ["M5 12h.01M12 12h.01M19 12h.01"],
  layers: ["m12 3 9 5-9 5-9-5 9-5Z", "m3 12 9 5 9-5", "m3 16 9 5 9-5"],
  split: [
    "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
    "M12 3v18",
  ],
  sidebar: [
    "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
    "M9 3v18",
  ],
  graph: [
    "M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
    "M7 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
    "M21 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
    "m11 7-5 10m7-10 5 10M7 19h10",
  ],
  close: ["m6 6 12 12M6 18 18 6"],
  edit: ["m16 3 5 5-12 12-6 1 1-6L16 3Z", "m13 6 5 5"],
  trash: ["M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"],
  lock: ["M6 10h12v11H6V10ZM8 10V6a4 4 0 0 1 8 0v4"],
  people: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  ],
  branch: ["M6 3v12a4 4 0 0 0 4 4h8M6 7h12", "m15 4 3 3-3 3m0 6 3 3-3 3"],
  spark: ["m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z"],
  "arrow-up-right": ["M7 17 17 7M7 7h10v10"],
  "arrow-up": ["M12 19V5m-6 6 6-6 6 6"],
  check: ["m5 12 4 4L19 6"],
  stop: ["M6 6h12v12H6V6Z"],
  info: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 11v6M12 7h.01"],
};
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="name === 'more' ? 3.5 : 1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      v-for="(path, index) in paths[name] || paths.spark"
      :key="index"
      :d="path"
    />
  </svg>
</template>
