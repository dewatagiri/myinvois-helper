import {
  PHASES, EXEMPTION_THRESHOLD, SINGLE_TXN_LIMIT, NO_CONSOLIDATION_INDUSTRIES,
  CLASSIFICATION_CODES, TAX_TYPES, SST_HINTS, GENERAL_TINS, OFFICIAL_LINKS, RULES_AS_OF,
  suggestClassification, checkTin,
} from "./rules.js";

const rm = (n) => "RM" + Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ---------- Tool 1: Am I required to issue e-invoices? ----------
export function checkObligation({ annualTurnoverRM, sellsToConsumers = false, industry = "", sstRegistered = false }) {
  const t = Number(annualTurnoverRM);
  const actions = [];
  let status, phase = null, startDate = null, headline;

  if (t < EXEMPTION_THRESHOLD) {
    status = "exempt";
    headline = `Not required (yet). Turnover ${rm(t)} is below the ${rm(EXEMPTION_THRESHOLD)} exemption threshold.`;
    actions.push(
      "You may still opt in voluntarily — useful if big B2B customers ask for validated e-invoices.",
      "Keep issuing normal invoices/receipts. Buyers who are mandated may need to self-bill for purchases from you.",
      "Re-check every year: if turnover crosses RM1m, you move into scope.",
    );
  } else {
    const p = PHASES.find((x) => t >= x.min && t < x.max);
    phase = p.phase; startDate = p.start;
    status = "mandatory";
    headline = `Mandatory. You fall under Phase ${p.phase} (start ${p.start}).`;
    actions.push(
      "Register on the MyInvois Portal and get your TIN, BRN, MSIC code and (if any) SST number ready.",
      `Any single transaction of ${rm(SINGLE_TXN_LIMIT)} or more needs its own e-invoice — it cannot go into a monthly consolidated e-invoice.`,
      "Collect buyer TIN + BRN for B2B sales. Validation returns a UIN and QR code; buyer has 72 hours to reject, after that use credit/debit notes.",
    );
    if (p.phase === 4) actions.push(p.note);
  }

  const ind = industry.toLowerCase();
  const BLOCK_WORDS = { automotive: ["car", "motor", "vehicle", "automotive"], aviation: ["airline", "aviation", "flight"], luxury: ["luxury", "jewel", "jewellery", "watch"], construction: ["construction", "contractor", "builder"] };
  const hit = Object.entries(BLOCK_WORDS).find(([, ws]) => ind && ws.some((w) => new RegExp(`\\b${w}`).test(ind)));
  const blocked = hit ? NO_CONSOLIDATION_INDUSTRIES.find((x) => x.startsWith(hit[0])) : null;
  if (status === "mandatory" && sellsToConsumers) {
    actions.push(
      blocked
        ? `Your industry (${blocked}) generally cannot use consolidated e-invoices — issue individual e-invoices even to walk-in customers.`
        : "For walk-in customers who don't ask for an e-invoice, you can submit one consolidated e-invoice per month (buyer TIN EI00000000010) by the 7th of the following month.",
    );
  }
  if (sstRegistered) actions.push("Show your SST registration number and correct tax type/rate on every line (Service Tax 8% / 6%, Sales Tax 10% / 5%).");

  return {
    status, phase, startDate, headline, actions,
    penalty: "Non-compliance: RM200–RM20,000 per offence and/or up to 6 months jail (ITA 1967 s.120(1)(d)); each invoice can be a separate offence.",
    rulesAsOf: RULES_AS_OF,
    confirmAt: OFFICIAL_LINKS.einvoice,
    disclaimer: "General guidance, not tax advice. Confirm with LHDN or your tax agent.",
  };
}

// ---------- Tool 2: Draft an e-invoice and check it ----------
const SUPPLIER_REQUIRED = ["name", "tin", "brn", "msic", "activity", "address", "phone"];
const BUYER_REQUIRED = ["name", "address"];

export function draftInvoice(input) {
  const { supplier = {}, buyer = {}, items = [], invoiceNo, issueDate, currency = "MYR", notes = "" } = input;
  const issues = []; // {level: 'error'|'warn'|'info', field, msg}
  const add = (level, field, msg) => issues.push({ level, field, msg });

  for (const f of SUPPLIER_REQUIRED) if (!supplier[f]) add("error", `supplier.${f}`, `Supplier ${f.toUpperCase()} is required`);
  if (supplier.tin) { const c = checkTin(supplier.tin); if (!c.ok) add("error", "supplier.tin", c.msg); }
  if (supplier.msic && !/^\d{5}$/.test(String(supplier.msic))) add("error", "supplier.msic", "MSIC code must be 5 digits (e.g. 47910)");
  if (!supplier.sstNo) add("info", "supplier.sstNo", 'No SST number — will show "NA" (fine if not SST-registered)');

  for (const f of BUYER_REQUIRED) if (!buyer[f]) add("error", `buyer.${f}`, `Buyer ${f.toUpperCase()} is required`);
  let buyerTin = buyer.tin;
  if (!buyerTin) { buyerTin = "EI00000000010"; add("warn", "buyer.tin", "No buyer TIN — using general public TIN EI00000000010. For B2B, get the buyer's real TIN."); }
  else { const c = checkTin(buyerTin); if (!c.ok) add("error", "buyer.tin", c.msg); }
  if (!buyer.brn && !GENERAL_TINS[String(buyerTin).toUpperCase()]) add("warn", "buyer.brn", "Buyer BRN / IC / passport number missing");

  if (!invoiceNo) add("error", "invoiceNo", "Invoice number is required");
  if (!items.length) add("error", "items", "At least one line item is required");

  const lines = items.map((it, i) => {
    const qty = Number(it.quantity ?? 1);
    const unit = Number(it.unitPrice ?? 0);
    const discount = Number(it.discount ?? 0);
    const subtotal = round2(qty * unit - discount);
    const taxType = it.taxType || (supplier.sstNo ? "02" : "06");
    const rate = taxType === "06" || taxType === "E" ? 0 : Number(it.taxRate ?? (taxType === "01" ? 10 : 8));
    const tax = round2(subtotal * rate / 100);
    const code = it.classificationCode || suggestClassification(it.description);
    if (!it.classificationCode) add("info", `items[${i}].classificationCode`, `Suggested classification ${code} (${CLASSIFICATION_CODES[code]}) — confirm`);
    if (!CLASSIFICATION_CODES[code]) add("error", `items[${i}].classificationCode`, `Unknown classification code ${code}`);
    if (!TAX_TYPES[taxType]) add("error", `items[${i}].taxType`, `Unknown tax type ${taxType}`);
    if (taxType !== "06" && taxType !== "E" && !supplier.sstNo) add("warn", `items[${i}].taxType`, "SST charged but supplier has no SST number");
    if (!it.description) add("error", `items[${i}].description`, "Item description is required");
    return {
      no: i + 1, description: it.description || "", classificationCode: code,
      classification: CLASSIFICATION_CODES[code] || "?", quantity: qty, unit: it.unit || "unit",
      unitPrice: round2(unit), discount: round2(discount), subtotal,
      taxType, taxTypeName: TAX_TYPES[taxType] || "?", taxRate: rate, taxAmount: tax, total: round2(subtotal + tax),
    };
  });

  const totals = {
    excludingTax: round2(lines.reduce((s, l) => s + l.subtotal, 0)),
    tax: round2(lines.reduce((s, l) => s + l.taxAmount, 0)),
  };
  totals.payable = round2(totals.excludingTax + totals.tax);

  if (totals.payable >= 10_000) add("info", "totals", "RM10,000 or more: must be issued as an individual e-invoice (cannot be consolidated).");
  if (currency !== "MYR") add("warn", "currency", "Non-MYR invoice: include the exchange rate to MYR.");

  const errors = issues.filter((x) => x.level === "error").length;
  const warnings = issues.filter((x) => x.level === "warn").length;

  return {
    invoice: {
      type: "01 - Invoice",
      invoiceNo: invoiceNo || "(missing)",
      issueDate: issueDate || new Date().toISOString().slice(0, 10),
      currency,
      supplier: { ...supplier, sstNo: supplier.sstNo || "NA" },
      buyer: { ...buyer, tin: buyerTin, sstNo: buyer.sstNo || "NA" },
      lines, totals, notes,
    },
    readiness: {
      ready: errors === 0,
      errors, warnings,
      summary: errors === 0
        ? (warnings ? `Ready to key into MyInvois, with ${warnings} warning(s) to review.` : "All mandatory fields present. Ready to key into MyInvois.")
        : `${errors} missing/invalid field(s) must be fixed before submission.`,
      issues,
    },
    sstHints: SST_HINTS,
    nextStep: "This is a draft for checking — it is NOT submitted to LHDN. Submit via the MyInvois Portal or your e-invoicing software to get the UIN + QR code.",
    confirmAt: OFFICIAL_LINKS.myinvoisPortal,
    rulesAsOf: RULES_AS_OF,
  };
}

// ---------- Tool 3: Look up classification codes ----------
export function lookupCodes({ query = "" }) {
  const q = query.toLowerCase().trim();
  const all = Object.entries(CLASSIFICATION_CODES).map(([code, desc]) => ({ code, description: desc }));
  const matches = q ? all.filter((x) => x.code === q || x.description.toLowerCase().includes(q)) : [];
  let suggested = q ? suggestClassification(q) : null;
  if (suggested === "022" && matches.length) suggested = null; // a real match beats "Others"
  return {
    query,
    matches: matches.length ? matches : (suggested && suggested !== "022" ? [{ code: suggested, description: CLASSIFICATION_CODES[suggested] }] : all),
    suggested: suggested ? { code: suggested, description: CLASSIFICATION_CODES[suggested] } : null,
    taxTypes: TAX_TYPES,
    source: OFFICIAL_LINKS.sdkCodes,
  };
}
