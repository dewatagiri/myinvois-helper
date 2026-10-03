import {
  PHASES, EXEMPTION_THRESHOLD, SINGLE_TXN_LIMIT, NO_CONSOLIDATION_INDUSTRIES,
  CLASSIFICATION_CODES, TAX_TYPES, SST_HINTS, GENERAL_TINS, OFFICIAL_LINKS, RULES_AS_OF,
  GENERAL_PUBLIC_BUYER, ID_TIN_ONLY, ID_NOT_AVAILABLE, idKind, generalTinFor, classify, normalize, hasPhrase, checkTin,
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
      `Any single transaction above ${rm(SINGLE_TXN_LIMIT)} needs its own e-invoice — it cannot go into a monthly consolidated e-invoice.`,
      "Collect buyer TIN + BRN for B2B sales. Validation returns a UIN and QR code; buyer has 72 hours to reject, after that use credit/debit notes.",
    );
    if (p.phase === 4) actions.push(p.note);
  }

  const blocked = blockedIndustry(industry);
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

// Which no-consolidation industry (if any) the free-text industry falls into. Whole words only,
// BM + English. Car repair / rental / wash / parts are NOT "sale of motor vehicles".
const BLOCK_WORDS = {
  aviation: ["airline", "aviation", "flight", "penerbangan", "air ticket", "tiket penerbangan"],
  luxury: ["luxury", "jewellery", "jewelry", "jeweller", "jeweler", "barang kemas", "kedai emas", "emas", "luxury watch"],
  construction: ["construction", "contractor", "kontraktor", "builder", "pembinaan"],
};
const VEHICLE_WORDS = ["car", "kereta", "motor vehicle", "vehicle", "kenderaan", "automotive", "automobile", "motorcycle", "motosikal"];
const VEHICLE_SALE_WORDS = ["car dealer", "used car", "jual kereta", "kereta terpakai", "pengedar kereta", "showroom", "dealer", "pengedar"];
const VEHICLE_SERVICE_WORDS = ["repair", "workshop", "bengkel", "servis", "service", "wash", "cuci", "rental", "sewa", "parts", "spare parts", "alat ganti", "tyre", "tayar", "accessories", "aksesori"];
export function blockedIndustry(industry = "") {
  const d = normalize(industry);
  const any = (ws) => ws.some((w) => hasPhrase(d, w));
  let hit = Object.keys(BLOCK_WORDS).find((k) => any(BLOCK_WORDS[k]));
  if (!hit && any(VEHICLE_WORDS) && (any(VEHICLE_SALE_WORDS) || !any(VEHICLE_SERVICE_WORDS))) hit = "automotive";
  return hit ? NO_CONSOLIDATION_INDUSTRIES.find((x) => x.startsWith(hit)) : null;
}

// ---------- Tool 2: Draft an e-invoice and check it ----------
const SUPPLIER_REQUIRED = ["name", "tin", "brn", "msic", "activity", "address", "phone"];
const BUYER_REQUIRED = ["name", "address"];
// A buyer name made only of these words is a placeholder ("Walk-in customer", "Pelanggan tunai", "N/A").
const WALK_IN_WORDS = new Set(["walk", "in", "walkin", "general", "public", "umum", "orang", "awam", "ramai", "cash", "customer", "customers",
  "sale", "sales", "pelanggan", "tunai", "jualan", "consolidated", "buyer", "buyers", "n", "a", "na", "tiada", "none", "nil"]);
const blank = (v) => v === undefined || v === null || String(v).trim() === "";

// Walk-in = no real identity given: no TIN (or the general public TIN) AND no IC/BRN AND the name is
// blank or a placeholder like "Walk-in" / "Orang awam".
export function isWalkIn(buyer = {}) {
  const tin = String(buyer.tin || "").trim().toUpperCase();
  if (tin && tin !== GENERAL_PUBLIC_BUYER.tin) return false;
  if (!blank(buyer.brn) && String(buyer.brn).trim().toUpperCase() !== "NA") return false;
  const words = normalize(buyer.name).trim().split(" ").filter(Boolean);
  return words.every((w) => WALK_IN_WORDS.has(w));
}

// This tool drafts normal invoices only (no self-billed / export / import / government inputs yet).
export const GENERAL_TIN_NOTE = "Self-billed, export, import and government invoices use different general TINs (EI00000000030, EI00000000020, EI00000000040) — see LHDN e-Invoice Specific Guideline v4.9, Appendix 1.";

const isIndividualTin = (tin) => /^IG\d/.test(tin);

export function draftInvoice(input) {
  const { buyer = {}, items = [], invoiceNo, issueDate, currency = "MYR", notes = "" } = input;
  const issues = []; // {level: 'error'|'warn'|'info', field, msg}
  const add = (level, field, msg) => issues.push({ level, field, msg });

  // Supplier. This tool drafts a normal (not self-billed) invoice, so the supplier is the issuer.
  const supplier = { ...(input.supplier || {}) };
  const supTin = String(supplier.tin || "").trim().toUpperCase();
  if (isIndividualTin(supTin) && blank(supplier.brn)) {
    supplier.brn = ID_TIN_ONLY; // v4.9 Appendix 1 (Table 8.2 for self-billed): individual who gives only a TIN
    add("info", "supplier.brn", `Individual supplier gave only a TIN — ID field set to ${ID_TIN_ONLY} (LHDN Specific Guideline v4.9, Appendix 1).`);
  }
  for (const f of SUPPLIER_REQUIRED) if (!supplier[f]) add("error", `supplier.${f}`, `Supplier ${f.toUpperCase()} is required`);
  if (supplier.tin) { const c = checkTin(supplier.tin); if (!c.ok) add("error", "supplier.tin", c.msg); }
  if (supTin === "EI00000000030") add("error", "supplier.tin", "EI00000000030 (foreign supplier) is only used on a SELF-BILLED e-invoice, where you the buyer issue it. This tool drafts normal invoices — the issuing supplier needs its own TIN.");
  else if (supTin === "EI00000000020" || supTin === "EI00000000040") add("error", "supplier.tin", `${supTin} is a buyer-side general TIN and cannot be used for the supplier.`);
  else if (supTin === "EI00000000010") add("warn", "supplier.tin", "EI00000000010 for a supplier is only for an individual who gives only a MyKad/MyTentera/MyPR/MyKAS number (put it in BRN), or on a consolidated self-billed e-invoice. A business issuing its own invoice needs its own TIN.");
  if (supplier.msic && !/^\d{5}$/.test(String(supplier.msic))) add("error", "supplier.msic", "MSIC code must be 5 digits (e.g. 47910)");
  if (!supplier.sstNo) add("info", "supplier.sstNo", 'No SST number — will show "NA" (fine if not SST-registered)');

  let outBuyer;
  const walkIn = isWalkIn(buyer);
  if (walkIn) {
    // LHDN Specific Guideline v4.9, Appendix 2 and Table 3.5: General Public / EI00000000010 / NA for ID, SST, address, contact.
    outBuyer = { ...buyer, ...GENERAL_PUBLIC_BUYER };
    if (!blank(buyer.email)) outBuyer.email = buyer.email;
    add("info", "buyer", 'Walk-in / general public buyer: filled as LHDN Specific Guideline v4.9 Appendix 2 / Table 3.5 requires (name "General Public", TIN EI00000000010, ID/SST/address/contact "NA"). No buyer address needed.');
    add("info", "buyer", "If this customer doesn't ask for an e-invoice, you can include the sale in your monthly consolidated e-invoice (classification 004) instead, unless it is above RM10,000 or your industry cannot consolidate.");
  } else {
    for (const f of BUYER_REQUIRED) if (blank(buyer[f])) add("error", `buyer.${f}`, `Buyer ${f.toUpperCase()} is required`);
    // General TINs and ID fill-ins: LHDN e-Invoice Specific Guideline v4.9, Appendix 1, Table 3.3, Table 10.2, Appendix 4.
    let tin = String(buyer.tin || "").trim().toUpperCase();
    let id = String(buyer.brn || "").trim();
    const kind = idKind(id);
    if (!tin) {
      const g = generalTinFor("buyer", { id });
      if (kind === "company") {
        // An SSM number, not a birth-date ID: never give a business the general public TIN.
        add("warn", "buyer.tin", "Malaysian businesses must provide their TIN and business registration number. This ID looks like an SSM registration number, so EI00000000010 was not applied — get the buyer's TIN.");
      } else if (g.tin === "EI00000000010") {
        tin = g.tin;
        add("info", "buyer.tin", "Individual buyer gave only a 12-digit MyKad/MyTentera/MyPR/MyKAS number — using general TIN EI00000000010 with that number in the ID field (Specific Guideline v4.9, Table 3.3 / Table 10.2).");
        if (kind === "nric-or-company") add("info", "buyer.brn", "This 12-digit number could be an IC or an SSM registration number; it was assumed to be an individual ID. If the buyer is a business, get its TIN instead.");
      } else if (g.tin === "EI00000000020") {
        tin = g.tin;
        add("warn", "buyer.tin", "Buyer gave what looks like a passport number and no TIN — using EI00000000020 (foreign buyer) with the passport in the ID field (v4.9 Table 10.2). If this is actually a Malaysian business, get its real TIN instead.");
      } else {
        tin = GENERAL_PUBLIC_BUYER.tin;
        add("warn", "buyer.tin", "No buyer TIN — using general TIN EI00000000010. For a business buyer, get their real TIN; for an individual, add their 12-digit MyKad/MyTentera/MyPR/MyKAS number as BRN; for a foreigner with only a passport, use EI00000000020 with the passport number.");
      }
    } else {
      const c = checkTin(tin); if (!c.ok) add("error", "buyer.tin", c.msg);
    }
    if (tin === "EI00000000030") add("error", "buyer.tin", "EI00000000030 is for a foreign SUPPLIER in a self-billed e-invoice, not for a buyer. Use EI00000000020 for a foreign buyer.");
    if (tin === "EI00000000020" && (kind === "nric" || kind === "nric-or-company")) add("error", "buyer.tin", "A 12-digit MyKad/MyTentera/MyPR/MyKAS number takes EI00000000010, not EI00000000020 (v4.9 Table 10.2). EI00000000020 is for passport-only buyers and export buyers.");
    if (tin === "EI00000000010" && kind === "passport") add("warn", "buyer.tin", "This ID looks like a passport number. A non-Malaysian buyer who gives only a passport takes EI00000000020, not EI00000000010 (v4.9 Table 10.2).");
    if (tin === "EI00000000020" && blank(id)) {
      id = ID_NOT_AVAILABLE;
      add("warn", "buyer.brn", `Foreign buyer with no registration number: ID field set to "${ID_NOT_AVAILABLE}". If the buyer is an individual, put their passport number instead.`);
    } else if (isIndividualTin(tin) && blank(id)) {
      id = ID_TIN_ONLY;
      add("info", "buyer.brn", `Individual buyer gave only a TIN — ID field set to ${ID_TIN_ONLY} (v4.9 Table 3.3 / Appendix 4).`);
    } else if (blank(id) && !GENERAL_TINS[tin]) add("warn", "buyer.brn", "Buyer BRN / IC / passport number missing");
    outBuyer = { ...buyer, tin, sstNo: buyer.sstNo || "NA" };
    if (!blank(id)) outBuyer.brn = id;
  }

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
    const guess = it.classificationCode ? null : classify(it.description);
    const code = it.classificationCode || guess.code;
    if (guess) add("info", `items[${i}].classificationCode`, guess.confident
      ? `Suggested classification ${code} (${CLASSIFICATION_CODES[code]}) — confirm`
      : `Classification unclear — using ${code} (${CLASSIFICATION_CODES[code]}) for now; other candidates: ${guess.candidates.filter((c) => c !== code).join(", ") || "see full list"}. ${guess.note}`);
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

  // Table 3.6 item 7: "exceeding RM10,000" — exactly RM10,000.00 can still be consolidated.
  if (totals.payable > SINGLE_TXN_LIMIT) add("info", "totals", "Above RM10,000: must be issued as an individual e-invoice (cannot be consolidated).");
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
      buyer: outBuyer,
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
    generalTinNote: GENERAL_TIN_NOTE,
    nextStep: "This is a draft for checking — it is NOT submitted to LHDN. Submit via the MyInvois Portal or your e-invoicing software to get the UIN + QR code.",
    confirmAt: OFFICIAL_LINKS.myinvoisPortal,
    rulesAsOf: RULES_AS_OF,
  };
}

// ---------- Tool 3: Look up classification codes ----------
export function lookupCodes({ query = "" }) {
  const q = query.trim();
  const entry = (code) => ({ code, description: CLASSIFICATION_CODES[code] });
  const all = Object.keys(CLASSIFICATION_CODES).map(entry);
  if (!q) return { query, matches: all, suggested: null, candidates: [], confident: false, note: null, taxTypeHint: null, taxTypes: TAX_TYPES, source: OFFICIAL_LINKS.sdkCodes };

  // Exact code ("025") or a whole-phrase hit on an official description ("motor vehicle").
  const direct = all.filter((x) => x.code === q || hasPhrase(normalize(x.description), normalize(q).trim()));
  const g = classify(q);
  let suggested, candidates, confident = g.confident, note = g.note;
  if (g.keyword) {
    candidates = g.candidates.map(entry);
    suggested = g.confident ? entry(g.code) : null; // unclear -> no single answer, show candidates
  } else if (direct.length) {
    candidates = direct;
    suggested = direct.length === 1 ? direct[0] : null;
    confident = direct.length === 1;
    note = g.taxType ? g.note : (confident ? null : "Several official codes match — pick the one that fits, or confirm with LHDN.");
  } else {
    candidates = [entry("022")];
    suggested = entry("022");
  }

  return {
    query,
    suggested,
    candidates,
    confident,
    note,
    matches: g.keyword || direct.length ? candidates : all,
    taxTypeHint: g.taxType ? { code: g.taxType, name: TAX_TYPES[g.taxType] } : null,
    taxTypes: TAX_TYPES,
    source: OFFICIAL_LINKS.sdkCodes,
  };
}
