// MyInvois Helper — MCP server for ChatGPT (Apps SDK / MCP Apps) and other MCP hosts.
import express from "express";
import rateLimit from "express-rate-limit";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { checkObligation, draftInvoice, lookupCodes } from "./logic.js";

const WIDGET_URI = "ui://myinvois-helper/view-v1.html";
const WIDGET_HTML = readFileSync(new URL("../dist/widget.html", import.meta.url), "utf8");
const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const ui = (invoking, invoked) => ({
  ui: { resourceUri: WIDGET_URI },
  "openai/outputTemplate": WIDGET_URI,
  "openai/toolInvocation/invoking": invoking,
  "openai/toolInvocation/invoked": invoked,
});
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };

export function buildServer() {
  const server = new McpServer({ name: "myinvois-helper", version: "1.0.0" });

  registerAppResource(server, "MyInvois Helper view", WIDGET_URI, { description: "Invoice preview and e-invoice checklist" }, async () => ({
    contents: [{ uri: WIDGET_URI, mimeType: RESOURCE_MIME_TYPE, text: WIDGET_HTML,
      _meta: { ui: { prefersBorder: true }, "openai/widgetDescription": "Shows a Malaysian e-invoice draft with totals, SST and an LHDN MyInvois readiness checklist." } }],
  }));

  registerAppTool(server, "check_einvoice_obligation", {
    title: "Check Malaysia e-Invoice obligation",
    description: "Use when a Malaysian business owner asks whether they must issue LHDN e-invoices (MyInvois), which phase or deadline applies, whether they are exempt, or whether they can use consolidated e-invoices. Takes annual turnover in RM.",
    inputSchema: {
      annualTurnoverRM: z.number().nonnegative().describe("Annual turnover / revenue in Malaysian Ringgit"),
      sellsToConsumers: z.boolean().optional().describe("True if the business sells to walk-in / retail consumers (B2C)"),
      industry: z.string().optional().describe("Industry, e.g. 'F&B', 'car dealer', 'IT services'"),
      sstRegistered: z.boolean().optional().describe("True if registered for SST"),
    },
    annotations: readOnly,
    _meta: ui("Checking e-invoice rules…", "Obligation checked"),
  }, async (args) => {
    const r = checkObligation(args);
    return { structuredContent: r, content: [{ type: "text", text: `${r.headline}\n- ${r.actions.join("\n- ")}\n${r.disclaimer}` }] };
  });

  const party = {
    name: z.string().optional(), tin: z.string().optional().describe("LHDN Tax Identification Number, e.g. C2584563201 or IG..."),
    brn: z.string().optional().describe("SSM business registration number, or IC/passport for individuals"),
    sstNo: z.string().optional().describe("SST registration number, blank if not registered"),
    address: z.string().optional(), phone: z.string().optional(), email: z.string().optional(),
  };
  // TODO: add optional id_type and invoice_type inputs after directory review.
  registerAppTool(server, "draft_einvoice", {
    title: "Draft Malaysia e-Invoice (MyInvois-ready)",
    description: "Use when the user wants to create, prepare or check an invoice for Malaysia's LHDN e-Invoice / MyInvois system. Builds the invoice with SST (sales tax / service tax) totals, suggests classification codes, and lists missing mandatory fields (TIN, BRN, MSIC, SST no.). Does not submit to LHDN.",
    inputSchema: {
      invoiceNo: z.string().optional(),
      issueDate: z.string().optional().describe("YYYY-MM-DD"),
      currency: z.string().optional().describe("ISO currency, default MYR"),
      supplier: z.object({ ...party, msic: z.string().optional().describe("5-digit MSIC code"), activity: z.string().optional().describe("Business activity description") }).optional(),
      buyer: z.object(party).optional(),
      items: z.array(z.object({
        description: z.string(), quantity: z.number().optional(), unit: z.string().optional(),
        unitPrice: z.number(), discount: z.number().optional(),
        classificationCode: z.string().optional().describe("LHDN 3-digit classification code; leave blank to auto-suggest"),
        taxType: z.enum(["01", "02", "03", "04", "05", "06", "E"]).optional().describe("01 Sales Tax, 02 Service Tax, 06 Not applicable, E exempt"),
        taxRate: z.number().optional().describe("Percent, e.g. 8, 6, 10, 5"),
      })).optional(),
      notes: z.string().optional(),
    },
    annotations: readOnly,
    _meta: ui("Drafting e-invoice…", "e-Invoice draft ready"),
  }, async (args) => {
    const r = draftInvoice(args);
    const t = r.invoice.totals;
    return { structuredContent: r, content: [{ type: "text", text: `${r.readiness.summary} Total payable ${r.invoice.currency} ${t.payable.toFixed(2)} (tax ${t.tax.toFixed(2)}). Issues: ${r.readiness.issues.map((i) => `[${i.level}] ${i.msg}`).join("; ") || "none"}. ${r.generalTinNote} ${r.nextStep}` }] };
  });

  registerAppTool(server, "lookup_classification_code", {
    title: "Find LHDN e-Invoice classification code",
    description: "Use when the user asks which LHDN e-invoice classification code (001–045) or tax type code to use for a product or service.",
    inputSchema: { query: z.string().describe("Item or service, e.g. 'laptop', 'car repair', 'tuition'") },
    annotations: readOnly,
    _meta: ui("Looking up codes…", "Codes found"),
  }, async (args) => {
    const r = lookupCodes(args);
    const head = r.suggested ? `Suggested ${r.suggested.code} ${r.suggested.description}.` : "Unclear — top candidates (confirm with LHDN):";
    return { structuredContent: r, content: [{ type: "text", text: `${head} ${r.note ? r.note + " " : ""}Matches: ${r.matches.slice(0, 8).map((m) => m.code + " " + m.description).join("; ")}` }] };
  });

  return server;
}

// ---- HTTP (stateless Streamable HTTP) ----
export const app = express();
// Render sits behind one proxy: take the client IP from the last X-Forwarded-For hop it added.
app.set("trust proxy", 1);

// Cheap liveness probe: registered first so it skips body parsing, logging and rate limits.
app.get("/health", (_req, res) => res.json({ status: "ok", version: VERSION }));

app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
  res.on("finish", () => {
    const line = `${new Date().toISOString()} ${req.method} ${req.originalUrl} -> ${res.statusCode} auth=${req.headers.authorization ? "yes" : "no"} rpc=${req.body && req.body.method ? req.body.method : ""}\n`;
    process.stdout.write(line);
  });
  next();
});
app.use((req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*"); res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id"); if (req.method === "OPTIONS") return res.sendStatus(204); next(); });

// ---- Auto-approve OAuth shim ----
// Some hosts (e.g. Claude custom connectors) insist on an OAuth handshake.
// This tool holds no user data, so we approve every request instantly.
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
const base = (req) => `${req.get("x-forwarded-proto") || req.protocol}://${req.get("x-forwarded-host") || req.get("host")}`;
const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const protectedResource = (req, res) => res.json({ resource: base(req) + "/mcp", authorization_servers: [base(req)], bearer_methods_supported: ["header"] });
app.get("/.well-known/oauth-protected-resource", protectedResource);
app.get("/.well-known/oauth-protected-resource/mcp", protectedResource);
const asMeta = (req, res) => {
  const b = base(req);
  res.json({ issuer: b, authorization_endpoint: b + "/authorize", token_endpoint: b + "/token", registration_endpoint: b + "/register",
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"], scopes_supported: ["mcp"] });
};
app.get("/.well-known/oauth-authorization-server", asMeta);
app.get("/.well-known/openid-configuration", asMeta);
app.post("/register", (req, res) => {
  const b = req.body || {};
  res.status(201).json({ client_id: "c_" + rid(), client_id_issued_at: Math.floor(Date.now() / 1000), client_name: b.client_name || "client",
    redirect_uris: b.redirect_uris || [], grant_types: b.grant_types || ["authorization_code", "refresh_token"],
    response_types: ["code"], token_endpoint_auth_method: b.token_endpoint_auth_method || "none" });
});
app.get("/authorize", (req, res) => {
  const { redirect_uri, state } = req.query;
  if (!redirect_uri) return res.status(400).send("missing redirect_uri");
  const u = new URL(redirect_uri);
  u.searchParams.set("code", "code_" + rid());
  if (state) u.searchParams.set("state", state);
  res.redirect(302, u.toString());
});
app.post("/token", (_req, res) => {
  res.json({ access_token: "at_" + rid(), token_type: "Bearer", expires_in: 60 * 60 * 24 * 30, refresh_token: "rt_" + rid(), scope: "mcp" });
});
app.get("/", (_req, res) => res.type("text/plain").send("MyInvois Helper MCP server. Endpoint: /mcp"));

// ---- Rate limits on /mcp ----
// Claude's servers share IPs, so the per-IP backstop is loose; the per-session limit does the real work.
const tooMany = (kind) => (req, res, _next, options) => {
  const key = kind === "session" ? req.get("mcp-session-id") : req.ip;
  process.stdout.write(`${new Date().toISOString()} 429 rate-limit ${kind}=${key}\n`);
  res.status(options.statusCode).json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests, please wait a minute and try again." }, id: null });
};
const ipLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: "draft-7", handler: tooMany("ip") });
const sessionLimiter = rateLimit({
  windowMs: 60_000, limit: 60, standardHeaders: "draft-7",
  skip: (req) => !req.get("mcp-session-id"),
  keyGenerator: (req) => "sid:" + req.get("mcp-session-id"),
  handler: tooMany("session"),
});
app.use("/mcp", ipLimiter, sessionLimiter);

app.post("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.all("/mcp", (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }));

// Oversized bodies (>100kb) and malformed JSON get a short JSON-RPC error instead of an HTML page.
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message: status === 413 ? "Request too large" : status < 500 ? "Bad request" : "Internal error" }, id: null });
});

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 8787;
  app.listen(PORT, () => console.log(`MyInvois Helper listening on :${PORT}/mcp`));
}
