// Quick manual check of the three tools. Run: node scripts/try.mjs
import { checkObligation, draftInvoice, lookupCodes } from "../src/logic.js";

const show = (title, v) => console.log(`\n=== ${title} ===\n` + JSON.stringify(v, null, 2));

// 1. Obligation: RM3.2m turnover
const o = checkObligation({ annualTurnoverRM: 3_200_000 });
show("1. Obligation (RM3.2m)", { status: o.status, phase: o.phase, headline: o.headline });

// 2. Code lookups: services must go to 022, never the full list
for (const q of ["web design", "IT consulting", "reka bentuk web", "zzz widget"]) {
  const r = lookupCodes({ query: q });
  show(`2. Lookup "${q}"`, { suggested: r.suggested, matches: r.matches.length, note: r.note });
}

// 3. Draft invoice: business buyer, no TIN -> must be an ERROR, not EI00000000010
const d = draftInvoice({
  supplier: { name: "ABC Sdn Bhd" },
  buyer: { name: "XYZ Enterprise" },
  items: [{ description: "Item A", quantity: 10, unitPrice: 50, classificationCode: "022" }],
});
show("3. Draft invoice", {
  buyerTin: d.invoice.buyer.tin,
  payable: d.invoice.totals.payable,
  ready: d.readiness.ready,
  buyerTinIssue: d.readiness.issues.find((i) => i.field === "buyer.tin"),
});

// Individual buyer still gets the general TIN (warning only)
const ind = draftInvoice({ buyer: { name: "Ahmad bin Ali", address: "KL" }, items: [] });
show("3b. Individual buyer", { tin: ind.invoice.buyer.tin, issue: ind.readiness.issues.find((i) => i.field === "buyer.tin") });
