import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 8787;
const server = createApp().listen(port, () => {
  console.log(`lookahead on http://localhost:${port}`);
});

// Finish in-flight requests on deploy/restart instead of dropping them.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
