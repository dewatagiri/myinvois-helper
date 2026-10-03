// Unit tests for the HTTP layer: rate limits, body cap and /health. Run with `npm test`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const listTools = (sessionId) => fetch(base + "/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(sessionId && { "mcp-session-id": sessionId }) },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});

test("61st request in a minute on one session gets 429", async () => {
  for (let i = 1; i <= 60; i++) {
    const r = await listTools("session-a");
    assert.notEqual(r.status, 429, `request ${i} should not be limited`);
    await r.arrayBuffer();
  }
  const r = await listTools("session-a");
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) > 0, "Retry-After header present");
  const body = await r.json();
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.error.message, "Too many requests, please wait a minute and try again.");

  // Another session from the same IP is unaffected.
  const other = await listTools("session-b");
  assert.equal(other.status, 200);
  await other.arrayBuffer();
});

test("/health always returns 200, even past the IP limit", async () => {
  const { version } = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (let i = 0; i < 700; i++) {
    const r = await fetch(base + "/health");
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { status: "ok", version });
  }
});

test("bodies over 100kb are rejected with 413", async () => {
  const r = await fetch(base + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(110_000) } }),
  });
  assert.equal(r.status, 413);
  assert.equal((await r.json()).jsonrpc, "2.0");
});
