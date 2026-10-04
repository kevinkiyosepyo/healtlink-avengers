// Opt-in cloud backup for signed-in researchers.
//   GET    /api/sync            → { items: [{ id, kind, updatedAt, fingerprint, data }] }
//   PUT    /api/sync/<itemId>   → store one item (a research record or the workspace snapshot)
//   DELETE /api/sync/<itemId>   → delete one item
//   DELETE /api/sync            → delete everything this user has synced
// Items are keyed by a hash of the account id (never the raw Google id), and
// research records are re-fingerprinted server-side: tampered or malformed
// records are rejected rather than stored.
import { createHash } from "node:crypto";
import { verifyRecord } from "../frontend/src/lib/records.js";
import { HttpError, json, readJson, requireSameOrigin } from "./security.js";

export const SYNC_BODY_LIMIT = 350 * 1024; // DynamoDB items max out at 400 KB
const ITEM_ID = /^(workspace|record:[A-Za-z0-9_-]{1,120})$/;
const MAX_ITEMS = 2000;

export function userKey(session, secret) {
  return createHash("sha256").update(`${secret}:${session.provider}:${session.id}`).digest("hex");
}

/** In-memory store for tests and local development. */
export function createMemoryStore() {
  const tables = new Map();
  const forUser = (user) => tables.get(user) ?? tables.set(user, new Map()).get(user);
  return {
    async list(user) {
      return [...forUser(user).values()];
    },
    async put(user, item) {
      forUser(user).set(item.id, item);
    },
    async remove(user, id) {
      forUser(user).delete(id);
    },
    async removeAll(user) {
      tables.delete(user);
    },
  };
}

/** DynamoDB store: partition key `user`, sort key `id`. Loaded lazily. */
export function createDynamoStore({ tableName, region }) {
  let clientPromise;
  const client = () =>
    (clientPromise ??= Promise.all([import("@aws-sdk/client-dynamodb"), import("@aws-sdk/lib-dynamodb")]).then(([base, lib]) => ({
      doc: lib.DynamoDBDocumentClient.from(new base.DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } }),
      lib,
    })));
  async function list(user) {
    const { doc, lib } = await client();
    const items = [];
    let ExclusiveStartKey;
    do {
      const page = await doc.send(new lib.QueryCommand({ TableName: tableName, KeyConditionExpression: "#u = :u", ExpressionAttributeNames: { "#u": "user" }, ExpressionAttributeValues: { ":u": user }, ExclusiveStartKey }));
      items.push(...(page.Items ?? []).map(({ user: _omit, ...item }) => ({ ...item, data: JSON.parse(item.data) })));
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }
  return {
    list,
    async put(user, item) {
      const { doc, lib } = await client();
      await doc.send(new lib.PutCommand({ TableName: tableName, Item: { user, ...item, data: JSON.stringify(item.data) } }));
    },
    async remove(user, id) {
      const { doc, lib } = await client();
      await doc.send(new lib.DeleteCommand({ TableName: tableName, Key: { user, id } }));
    },
    async removeAll(user) {
      const { doc, lib } = await client();
      const ids = (await list(user)).map((item) => item.id);
      for (let i = 0; i < ids.length; i += 25) {
        await doc.send(new lib.BatchWriteCommand({ RequestItems: { [tableName]: ids.slice(i, i + 25).map((id) => ({ DeleteRequest: { Key: { user, id } } })) } }));
      }
    },
  };
}

export function syncStoreFromEnv(env) {
  if (env.SYNC_TABLE) return createDynamoStore({ tableName: env.SYNC_TABLE, region: env.AWS_REGION || "us-west-2" });
  if (env.SYNC_MEMORY === "1") return createMemoryStore();
  return null;
}

async function validItem(id, body) {
  const data = body?.data;
  if (id === "workspace") {
    if (!data || data.version !== 1 || !Array.isArray(data.sessions)) throw new HttpError(400, "invalid_workspace", "The workspace snapshot is not valid.");
    return { kind: "workspace", fingerprint: null, data };
  }
  if (!data || typeof data !== "object" || `record:${data.runId}` !== id || !/^[0-9a-f]{64}$/.test(data.fingerprint ?? "")) {
    throw new HttpError(400, "invalid_record", "The research record is not valid.");
  }
  if (!(await verifyRecord(data))) throw new HttpError(422, "record_tampered", "The record's fingerprint doesn't match its contents.");
  return { kind: "record", fingerprint: data.fingerprint, data };
}

/**
 * Returns a handler for /api/sync*, or null when sync isn't configured.
 * `authenticate(request, config)` → session | null (from server/auth.js).
 */
export function createSyncHandler({ config, store, authenticate, now = () => new Date() }) {
  if (!config || !store) return null;
  return async function handleSync(request) {
    const session = await authenticate(request, config);
    if (!session) throw new HttpError(401, "not_signed_in", "Sign in to use cloud backup.");
    const user = userKey(session, config.secret);
    const pathname = new URL(request.url).pathname.replace(/\/$/, "");
    const id = decodeURIComponent(pathname.slice("/api/sync".length).replace(/^\//, ""));

    if (request.method === "GET" && !id) return json({ items: await store.list(user) });
    requireSameOrigin(request, config);
    if (request.method === "DELETE" && !id) {
      await store.removeAll(user);
      return json({ deleted: true });
    }
    if (!ITEM_ID.test(id)) throw new HttpError(400, "invalid_item", "Unknown sync item.");
    if (request.method === "DELETE") {
      await store.remove(user, id);
      return json({ deleted: true });
    }
    if (request.method === "PUT") {
      const item = await validItem(id, await readJson(request, SYNC_BODY_LIMIT));
      if ((await store.list(user)).length >= MAX_ITEMS && item.kind === "record") throw new HttpError(409, "sync_full", "Cloud backup is full; delete older records first.");
      const updatedAt = now().toISOString();
      await store.put(user, { id, ...item, updatedAt });
      return json({ id, updatedAt });
    }
    throw new HttpError(405, "method_not_allowed", "This request method is not supported.");
  };
}
