import test from "node:test";
import assert from "node:assert/strict";
import { createApiHandler } from "../server/handlers.js";

const env = {
  AUTH_URL: "https://research.example",
  AUTH_SECRET: "test-only-secret-with-more-than-thirty-two-characters",
  AUTH_GOOGLE_ID: "google-client",
  AUTH_GOOGLE_SECRET: "google-secret",
  AUTH_OPENAI_ID: "oaiapp_previous_registration",
  AUTH_OPENAI_TOKEN_AUTH_METHOD: "none",
};

test("previous ChatGPT environment settings cannot enable removed OAuth routes", async () => {
  let providerCalls = 0;
  const api = createApiHandler({ env, fetchImpl: async () => { providerCalls++; throw new Error("unexpected provider request"); } });
  for (const method of ["GET", "POST"]) {
    for (const path of ["/api/auth/signin/chatgpt", "/api/auth/callback/chatgpt?code=unused"]) {
      const response = await api(new Request(`${env.AUTH_URL}${path}`, { method, headers: { Origin: env.AUTH_URL } }));
      assert.equal(response.status, 404);
      assert.equal((await response.json()).code, "not_found");
    }
  }
  const account = await (await api(new Request(`${env.AUTH_URL}/api/account`))).json();
  assert.deepEqual(account.providers, { google: true, chatgpt: false });
  assert.equal(account.openaiConnected, false);
  assert.equal(providerCalls, 0);
});
