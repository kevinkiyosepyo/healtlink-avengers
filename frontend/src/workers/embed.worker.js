// Sentence embeddings off the main thread. The model (~23 MB, quantized) is
// fetched once from the Hugging Face CDN and then served from the browser cache.
import { env, pipeline } from "@huggingface/transformers";
// Self-host the ONNX runtime (same version transformers.js pins) instead of
// letting it fetch glue code from a CDN: works offline and under a strict CSP.
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

const MODEL = "Xenova/all-MiniLM-L6-v2";
env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };

let extractor;
function load() {
  extractor ??= pipeline("feature-extraction", MODEL, {
    dtype: "q8",
    progress_callback: (event) => {
      if (event.status === "progress") self.postMessage({ type: "progress", progress: event.progress ?? 0 });
    },
  });
  return extractor;
}

self.addEventListener("message", async ({ data }) => {
  try {
    if (data.type === "warmup") {
      await load();
      self.postMessage({ type: "ready" });
      return;
    }
    if (data.type === "embed") {
      const model = await load();
      const output = await model(data.texts, { pooling: "mean", normalize: true });
      self.postMessage({ type: "result", id: data.id, vectors: output.tolist() });
    }
  } catch (error) {
    self.postMessage({ type: "error", id: data.id, message: String(error?.message ?? error) });
  }
});
