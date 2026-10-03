// Unit tests for the HTTP layer: rate limits, body cap and /health. Run with `npm test`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, ALLOWED_ORIGINS } from "../src/server.js";

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

// ---- Directory-review checks ----
const rpc = (body, headers = {}) => fetch(base + "/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
  body: typeof body === "string" ? body : JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
});
const call = async (name, args, headers) => (await (await rpc({ method: "tools/call", params: { name, arguments: args } }, headers)).json()).result;

test("Origin allowlist is exactly claude.ai and claude.com", () => {
  assert.deepEqual(ALLOWED_ORIGINS, ["https://claude.ai", "https://claude.com"]);
});
for (const origin of ["https://evil.example", "http://claude.ai", "https://claude.ai.evil.example", "null"]) {
  test(`request with Origin ${origin} is rejected with 403 and a clear message`, async () => {
    const r = await rpc({ method: "tools/list" }, { origin });
    assert.equal(r.status, 403);
    const body = await r.json();
    assert.match(body.error.message, /Forbidden origin/);
    assert.match(body.error.message, /https:\/\/claude\.ai/);
  });
}
test("CORS preflight from a disallowed Origin is rejected with 403", async () => {
  const r = await fetch(base + "/mcp", { method: "OPTIONS", headers: { origin: "https://evil.example" } });
  assert.equal(r.status, 403);
});
for (const origin of ["https://claude.ai", "https://claude.com"]) {
  test(`request with Origin ${origin} is allowed`, async () => {
    const r = await rpc({ method: "tools/list" }, { origin });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).result.tools.length, 3);
  });
}
test("request with NO Origin header (server-to-server) is allowed", async () => {
  const r = await rpc({ method: "tools/list" });
  assert.equal(r.status, 200);
  await r.arrayBuffer();
});

test("works with no authentication: no Authorization header, every tool succeeds with valid input", async () => {
  const a = await call("check_einvoice_obligation", { annualTurnoverRM: 3000000, sellsToConsumers: true, industry: "F&B restaurant" });
  assert.equal(a.isError, undefined);
  assert.equal(a.structuredContent.phase, 4);
  const b = await call("draft_einvoice", {
    invoiceNo: "INV-1",
    supplier: { name: "Kedai Maju Sdn Bhd", tin: "C2584563201", brn: "202001012345", msic: "47910", activity: "Retail", address: "Kajang", phone: "0123456789" },
    buyer: { name: "Walk-in" },
    items: [{ description: "Laptop", unitPrice: 2500 }],
  });
  assert.equal(b.isError, undefined);
  assert.equal(b.structuredContent.readiness.ready, true);
  const c = await call("lookup_classification_code", { query: "tuition" });
  assert.equal(c.isError, undefined);
  assert.equal(c.structuredContent.suggested.code, "010");
});

test("every tool: name <= 64 chars, human-readable title, readOnlyHint true, no destructiveHint, says it does not submit to LHDN", async () => {
  const { tools } = (await (await rpc({ method: "tools/list" })).json()).result;
  assert.deepEqual(tools.map((t) => t.name).sort(), ["check_einvoice_obligation", "draft_einvoice", "lookup_classification_code"]);
  for (const t of tools) {
    assert.ok(t.name.length <= 64, t.name);
    assert.ok(t.title && /\s/.test(t.title), `${t.name} needs a human-readable title`);
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.destructiveHint, undefined, t.name);
    assert.match(t.description, /does not submit anything to LHDN/, t.name);
  }
});

test("invalid tool input: specific message naming the field", async () => {
  const r = await call("check_einvoice_obligation", { annualTurnoverRM: -5 });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /annualTurnoverRM/);
});
test("malformed JSON: parse error that says what is wrong and how to fix it", async () => {
  const r = await rpc("{bad");
  assert.equal(r.status, 400);
  const { error } = await r.json();
  assert.equal(error.code, -32700);
  assert.match(error.message, /not valid JSON/);
  assert.match(error.message, /Content-Type: application\/json/);
});
test("GET /mcp: 405 that explains to use POST", async () => {
  const r = await fetch(base + "/mcp");
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "POST");
  assert.match((await r.json()).error.message, /POST \/mcp/);
});
test("unknown path: JSON 404 naming the real endpoints, not an HTML page", async () => {
  const r = await fetch(base + "/nope");
  assert.equal(r.status, 404);
  assert.match(r.headers.get("content-type"), /json/);
  assert.match((await r.json()).error.message, /POST \/mcp/);
});
test("oversized body: 413 message gives the 100 KB limit", async () => {
  const r = await rpc({ method: "tools/list", params: { pad: "x".repeat(110_000) } });
  assert.equal(r.status, 413);
  assert.match((await r.json()).error.message, /under 100 KB/);
});
