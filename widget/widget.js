// Widget shown inside ChatGPT (and any MCP Apps host). Bundled by esbuild into widget.html.
import { App } from "@modelcontextprotocol/ext-apps";

const root = document.getElementById("root");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rm = (n) => Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function party(label, p) {
  return `<div class="party"><div class="lbl">${label}</div>
    <div class="nm">${esc(p.name || "—")}</div>
    <div class="kv">TIN <b>${esc(p.tin || "—")}</b> · BRN <b>${esc(p.brn || "—")}</b></div>
    <div class="kv">SST <b>${esc(p.sstNo || "NA")}</b>${p.msic ? ` · MSIC <b>${esc(p.msic)}</b>` : ""}</div>
    <div class="kv">${esc(p.address || "")}${p.phone ? " · " + esc(p.phone) : ""}</div></div>`;
}

function renderInvoice(d) {
  const inv = d.invoice, r = d.readiness;
  const badge = r.ready ? `<span class="badge ok">Ready</span>` : `<span class="badge bad">${r.errors} to fix</span>`;
  const rows = inv.lines.map((l) => `<tr><td>${l.no}</td><td>${esc(l.description)}<div class="sub">${l.classificationCode} · ${esc(l.classification)}</div></td>
    <td class="n">${l.quantity}</td><td class="n">${rm(l.unitPrice)}</td><td class="n">${rm(l.subtotal)}</td>
    <td class="n">${l.taxType} ${l.taxRate}%<div class="sub">${rm(l.taxAmount)}</div></td><td class="n">${rm(l.total)}</td></tr>`).join("");
  const issues = r.issues.map((i) => `<li class="${i.level}"><span>${i.level}</span>${esc(i.msg)}</li>`).join("");
  root.innerHTML = `
    <div class="head"><div><div class="title">e-Invoice draft ${badge}</div>
      <div class="kv">${esc(inv.type)} · No. <b>${esc(inv.invoiceNo)}</b> · ${esc(inv.issueDate)} · ${esc(inv.currency)}</div></div>
      <button id="print">Print / PDF</button></div>
    <div class="parties">${party("Supplier", inv.supplier)}${party("Buyer", inv.buyer)}</div>
    <table><thead><tr><th>#</th><th>Item</th><th class="n">Qty</th><th class="n">Unit</th><th class="n">Subtotal</th><th class="n">Tax</th><th class="n">Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="6">Total excl. tax</td><td class="n">${rm(inv.totals.excludingTax)}</td></tr>
      <tr><td colspan="6">Tax</td><td class="n">${rm(inv.totals.tax)}</td></tr>
      <tr class="grand"><td colspan="6">Total payable (${esc(inv.currency)})</td><td class="n">${rm(inv.totals.payable)}</td></tr></tfoot></table>
    <div class="check"><div class="lbl">MyInvois readiness — ${esc(r.summary)}</div><ul>${issues || "<li class='info'><span>ok</span>No issues found</li>"}</ul></div>
    <div class="foot">${esc(d.nextStep)} Rules as of ${esc(d.rulesAsOf)}.</div>`;
  document.getElementById("print").onclick = () => window.print();
}

function renderObligation(d) {
  const cls = d.status === "exempt" ? "ok" : "warn";
  root.innerHTML = `<div class="title">e-Invoice obligation <span class="badge ${cls}">${d.status === "exempt" ? "Exempt" : "Phase " + d.phase}</span></div>
    <p class="big">${esc(d.headline)}</p>
    <div class="lbl">What to do</div><ol>${d.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>
    <div class="foot">${esc(d.penalty)}<br>${esc(d.disclaimer)} Rules as of ${esc(d.rulesAsOf)}.</div>`;
}

function renderCodes(d) {
  root.innerHTML = `<div class="title">Classification codes${d.query ? ` for “${esc(d.query)}”` : ""}</div>
    ${d.suggested ? `<p class="big">Suggested: <b>${d.suggested.code}</b> — ${esc(d.suggested.description)}</p>` : ""}
    <table><tbody>${d.matches.map((m) => `<tr><td><b>${m.code}</b></td><td>${esc(m.description)}</td></tr>`).join("")}</tbody></table>
    <div class="foot">Source: LHDN MyInvois SDK code list.</div>`;
}

function render(data) {
  if (!data) return;
  if (data.invoice) renderInvoice(data);
  else if (data.status) renderObligation(data);
  else if (data.matches) renderCodes(data);
}

// ChatGPT legacy bridge (window.openai) — used if present
if (window.openai?.toolOutput) render(window.openai.toolOutput);
window.addEventListener("openai:set_globals", () => render(window.openai?.toolOutput));

// Standard MCP Apps bridge
const app = new App({ name: "MyInvois Helper", version: "1.0.0" }, {});
app.addEventListener("toolresult", (p) => render(p.structuredContent));
app.connect().catch(() => {});
