# MyInvois Helper — Launch kit

## 1. Paste-ready prompt for Claude Code / Nyrobrain

Unzip `myinvois-helper.zip` into a folder (e.g. `D:\myinvois-helper`), open Claude Code in that folder, and paste:

```
This folder is an MCP server called MyInvois Helper (Node 20+). Do the following and stop to ask me only when you need a login or a click from me:
1. Run `npm install`, then `npm start` in the background, then `node test.mjs`. Confirm all 3 tools return results. Stop the server.
2. Create a private GitHub repo named myinvois-helper, commit everything except node_modules and dist (add a .gitignore), and push.
3. Deploy it to Render.com as a free Web Service from that repo: build command `npm install`, start command `npm start`, Node 20. Give me the public URL.
4. Check that https://<render-url>/mcp answers an MCP initialize request (POST JSON-RPC). Show me the result.
5. Give me the exact URL to paste into ChatGPT: https://<render-url>/mcp
Explain each step in one plain sentence. I am not IT-trained.
```

## 2. Test inside ChatGPT (you, ~5 minutes — menu names may differ slightly)

1. ChatGPT → Settings → Apps → Advanced → turn on **Developer mode**.
2. Settings → Apps → **Create app** → name "MyInvois Helper", MCP URL = your `/mcp` URL, auth = none.
3. New chat → pick the app → try the test prompts below. Check the invoice card renders.

Test prompts:
- "My company makes RM2.5 million a year, sells to walk-in customers, F&B. Do I need e-invoice?"
- "Draft an e-invoice: supplier Bengkel Maju Sdn Bhd, TIN C2584563201, BRN 202301012345, MSIC 45201, SST B16-2508-32000123. Buyer ABC Logistics, TIN C1098765432. Car repair labour RM450, 2 brake pads RM120 each at 10% sales tax."
- "Which LHDN classification code for tuition fees?"

## 3. Directory submission

Submit from the OpenAI Platform dashboard (apps/plugins submission). Expect to need: verified developer identity, public MCP URL, privacy policy URL, support email, test prompts with expected results, screenshots. Note: Render free tier sleeps after idle — upgrade to a paid instance (~USD 7/month) before submitting so reviewers don't hit a cold start.

Privacy policy one-liner (host on the PintuNiaga site): "MyInvois Helper does not store invoice data. Inputs are processed in memory to return a draft. Invoice contents are never logged, sold or shared; server logs record only request time, path and status."

## 4. Listing copy (SEO — bottom-of-funnel keywords)

**Name:** MyInvois Helper — Malaysia e-Invoice

**Short description (≤ 80 chars):**
Draft LHDN e-invoices, check SST and MyInvois readiness for Malaysian SMEs.

**Long description:**
Create LHDN e-Invoice-ready invoices for Malaysia in seconds. MyInvois Helper drafts your invoice with correct SST (sales tax 10%/5%, service tax 8%/6%), suggests the right LHDN classification code, and checks every mandatory field — TIN, BRN, MSIC code, SST number — before you submit to the MyInvois Portal. Also tells you if your business must issue e-invoices, which phase applies (RM1 million exemption threshold), when you can use consolidated e-invoices, and the RM10,000 single-transaction rule. Built for Malaysian SMEs, sole proprietors, accountants and bookkeepers. Draft only — does not submit to LHDN.

**Keywords to repeat naturally:** e-invoice Malaysia, LHDN e-invoice, MyInvois, invoice generator Malaysia, SST invoice, TIN number, MSIC code, classification code, consolidated e-invoice, e-invois.

## 5. Funnel to PintuNiaga

Once live, add one line to the widget footer: "Need automatic e-invoicing for your shop? PintuNiaga sets it up." with your link. Do this after approval — directory reviewers are strict about promotional content, so check current OpenAI app guidelines first.

## 6. Disclaimer

General guidance, not tax advice. Rules as of Oct 2026. Re-check hasil.gov.my/en/e-invoice before launch and whenever LHDN updates guidelines; edit `src/rules.js`.
