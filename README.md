# MyInvois Helper — ChatGPT plugin for Malaysian e-Invoicing

Built by Mohamed Azman bin Mohamed Taufik (PintuNiaga). An MCP server + inline widget that works in ChatGPT (plugins / Apps SDK) and any MCP Apps host (Claude, VS Code).

## What it does

| Tool | User asks ChatGPT… | Returns |
|---|---|---|
| `check_einvoice_obligation` | "My kedai makes RM3m a year, do I need e-invoice?" | Phase, start date, exemption, consolidation rules, action list |
| `draft_einvoice` | "Make an invoice for ABC Sdn Bhd, 2 laptops RM4,200 each, 10% sales tax" | Invoice preview with SST totals + MyInvois readiness checklist (missing TIN/BRN/MSIC etc.) |
| `lookup_classification_code` | "Which LHDN classification code for car repair?" | Code 001–045 suggestion + tax type codes |

All tools are read-only. Nothing is sent to LHDN — it drafts and checks only.

## Run locally

```
npm install
npm start          # builds dist/widget.html, serves http://localhost:8787/mcp
node test.mjs      # calls all 3 tools via an MCP client (server must be running)
npm test           # unit tests: HTTP layer + rules (walk-in/foreign/B2B buyers, general TINs, tax types, 30 keyword queries)
```

## Rules baked in (as of Oct 2026 — re-check before launch)

Last verified against LHDN SDK: 2026-10-03 (tax types and classification codes; general TINs per LHDN e-Invoice Specific Guideline v4.9, published 7 Sep 2026, Appendix 1 / Appendix Table 1; Tables 3.3, 3.4, 3.5, 3.6, 8.2, 10.1, 10.2; Appendices 2 and 4).

- Exempt below RM1m turnover (raised from RM500k on 6 Dec 2025). Phase 4 (RM1m–5m) started 1 Jan 2026.
- Any single transaction ≥ RM10,000 needs its own e-invoice from 1 Jan 2026.
- Walk-in buyer: name "General Public", TIN EI00000000010, ID/SST/address/contact "NA" (LHDN e-Invoice Specific Guideline, Appendix 2).
- General TINs (v4.9 Appendix 1):
  - EI00000000010 General Public: individual who gives only MyKad/MyTentera (Malaysian) or MyPR/MyKAS (non-Malaysian), ID number in the ID field; buyer on a consolidated e-invoice; supplier on a consolidated self-billed e-invoice.
  - EI00000000020 Foreign Buyer / Foreign Shipping Recipient: passport-only individual buyer (passport in the ID field); export or foreign shipping recipient with no TIN.
  - EI00000000030 Foreign Supplier, self-billed only: passport-only individual supplier; import with no TIN.
  - EI00000000040 Buyer: Government; state government and state authority; exempt institutions not assigned a TIN; government authority; local authority; statutory authority and statutory body.
  - ID field: "000000000000" if an individual gives only a TIN; "NA" if a foreign party has no business registration number.
  - A 12-digit number that can't be a birth date (YYMMDD) is treated as an SSM registration number: no general TIN is applied and the user is told to get the business's TIN.
- SST: service tax 8% (6% for F&B, telco, parking, logistics); sales tax 10% / 5%.
- 45 classification codes and 7 tax type codes from the LHDN MyInvois SDK.

Sources disagree on when the Phase 4 relaxation ends (31 Dec 2027 vs mid-2026), so the tool says so and points to hasil.gov.my. Update `src/rules.js` when LHDN changes things.

## Files

- `src/rules.js` — LHDN reference data (edit here when rules change)
- `src/logic.js` — calculations and validation
- `src/server.js` — MCP server (Streamable HTTP, stateless)
- `widget/` — inline UI; `build.js` bundles it into `dist/widget.html`

## Use it in Claude

1. Claude → Settings → Connectors → **Add custom connector**.
2. URL: `https://myinvois-helper.onrender.com/mcp` → **Add** → **Connect** (approval is automatic; no account needed).
3. In a chat, switch MyInvois Helper on and ask, for example:
   - "Do I need to issue e-invoices? My company makes RM2.5 million a year, F&B, walk-in customers."
   - "Draft an e-invoice for ABC Logistics: car repair labour RM450, 2 brake pads RM120 each at 10% sales tax."
   - "Which LHDN classification code should I use for tuition fees?"

Free hosting sleeps when idle — the first request after a quiet spell can take up to a minute.

Support: pintuniaga.official@gmail.com · Privacy policy: [PRIVACY.md](PRIVACY.md)

## Deploy (Render, free)

1. Push this repo to GitHub.
2. On render.com: New → Blueprint → pick this repo (uses `render.yaml`). Or New → Web Service: build `npm install`, start `npm start`.
3. Your MCP URL is `https://<your-service>.onrender.com/mcp`.
4. Claude: Settings → Connectors → Add custom connector → paste the URL → Connect.
5. ChatGPT: Settings → Apps → Developer mode → Create app → paste the URL.

Test a live server: `MCP_URL=https://<your-service>.onrender.com/mcp node test.mjs`

## Login

Some hosts insist on an OAuth handshake. `src/server.js` includes an auto-approve OAuth shim: no accounts, no passwords, every client is approved instantly. The tool stores no data, so nothing is protected behind it.

## Privacy

No invoice data is stored. Logs record only the time, request path, status and MCP method name — never invoice contents.
