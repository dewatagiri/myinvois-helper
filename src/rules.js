// Malaysia e-Invoice (LHDN MyInvois) reference data and rules.
// Last verified: 2026-10-03
// - TAX_TYPES: https://sdk.myinvois.hasil.gov.my/codes/tax-types/
// - CLASSIFICATION_CODES (001-045): https://sdk.myinvois.hasil.gov.my/codes/classification-codes/ (page dated 25 Sep 2026)
// - Code list index: https://sdk.myinvois.hasil.gov.my/codes/
// - GENERAL_TINS: from Thomson Reuters / Pagero docs and LHDN SDK release notes —
//   pending check against LHDN e-Invoice Specific Guideline (https://www.hasil.gov.my/en/e-invoice/)
// Phases, thresholds and SST rates: malaysia4u.com e-invoicing + SST guides, jomeinvoice.my RM10k rule guide
// (not yet checked against LHDN).
// Rules change. Every output tells the user to confirm on https://www.hasil.gov.my/en/e-invoice/

export const RULES_AS_OF = "2026-10";

export const OFFICIAL_LINKS = {
  einvoice: "https://www.hasil.gov.my/en/e-invoice/",
  sdkCodes: "https://sdk.myinvois.hasil.gov.my/codes/",
  myinvoisPortal: "https://myinvois.hasil.gov.my/",
};

// Implementation phases (annual turnover / revenue, RM)
export const PHASES = [
  { phase: 1, min: 100_000_000, max: Infinity, start: "2024-08-01", note: "Fully enforced." },
  { phase: 2, min: 25_000_000, max: 100_000_000, start: "2025-01-01", note: "Fully enforced." },
  { phase: 3, min: 5_000_000, max: 25_000_000, start: "2025-07-01", note: "Fully enforced." },
  {
    phase: 4, min: 1_000_000, max: 5_000_000, start: "2026-01-01",
    note: "Relaxation period reported to run to 31 Dec 2027 (consolidated monthly e-invoices allowed, penalties not enforced while you show compliance effort). Some guides cite a shorter grace period — confirm with LHDN.",
  },
];
export const EXEMPTION_THRESHOLD = 1_000_000; // raised from RM500k on 6 Dec 2025
export const SINGLE_TXN_LIMIT = 10_000; // from 1 Jan 2026: any single txn >= RM10k needs its own e-invoice

export const GENERAL_TINS = {
  EI00000000010: "General public (Malaysian buyer/seller with no TIN; consolidated)",
  EI00000000020: "Foreign buyer / foreign shipping recipient",
  EI00000000030: "Foreign supplier",
  EI00000000040: "Buyer is government or local authority",
};

// Industries that cannot use consolidated e-invoices even for B2C
export const NO_CONSOLIDATION_INDUSTRIES = [
  "automotive (sale of motor vehicles)",
  "aviation (airline tickets)",
  "luxury goods and jewellery",
  "construction",
];

export const TAX_TYPES = {
  "01": "Sales Tax",
  "02": "Service Tax",
  "03": "Tourism Tax",
  "04": "High-Value Goods Tax",
  "05": "Sales Tax on Low Value Goods",
  "06": "Not Applicable",
  E: "Tax exemption (where applicable)",
};

// Common SST rates (Malaysia, after 1 Jul 2025 changes)
export const SST_HINTS = [
  { taxType: "02", rate: 8, applies: "Most taxable services: professional, IT, advertising, hotels, leasing, financial services" },
  { taxType: "02", rate: 6, applies: "F&B, telecommunications, parking, logistics" },
  { taxType: "01", rate: 10, applies: "Most manufactured / imported goods" },
  { taxType: "01", rate: 5, applies: "Selected goods (e.g. some building materials, petroleum)" },
  { taxType: "06", rate: 0, applies: "Not SST-registered, or item outside SST scope" },
];

export const CLASSIFICATION_CODES = {
  "001": "Breastfeeding equipment",
  "002": "Child care centres and kindergartens fees",
  "003": "Computer, smartphone or tablet",
  "004": "Consolidated e-Invoice",
  "005": "Construction materials (Fourth Schedule, CIDB Act 1994)",
  "006": "Disbursement",
  "007": "Donation",
  "008": "e-Commerce - e-Invoice to buyer / purchaser",
  "009": "e-Commerce - Self-billed e-Invoice to seller, logistics, etc.",
  "010": "Education fees",
  "011": "Goods on consignment (Consignor)",
  "012": "Goods on consignment (Consignee)",
  "013": "Gym membership",
  "014": "Insurance - Education and medical benefits",
  "015": "Insurance - Takaful or life insurance",
  "016": "Interest and financing expenses",
  "017": "Internet subscription",
  "018": "Land and building",
  "019": "Medical examination for learning disabilities and early intervention or rehabilitation",
  "020": "Medical examination or vaccination expenses",
  "021": "Medical expenses for serious diseases",
  "022": "Others",
  "023": "Petroleum operations (Petroleum (Income Tax) Act 1967)",
  "024": "Private retirement scheme or deferred annuity scheme",
  "025": "Motor vehicle",
  "026": "Subscription of books / journals / magazines / newspapers / similar publications",
  "027": "Reimbursement",
  "028": "Rental of motor vehicle",
  "029": "EV charging facilities (installation, rental, sale/purchase or subscription)",
  "030": "Repair and maintenance",
  "031": "Research and development",
  "032": "Foreign income",
  "033": "Self-billed - Betting and gaming",
  "034": "Self-billed - Importation of goods",
  "035": "Self-billed - Importation of services",
  "036": "Self-billed - Others",
  "037": "Self-billed - Monetary payment to agents, dealers or distributors",
  "038": "Sports equipment, sports facility rental/entry, competition registration or training fees",
  "039": "Supporting equipment for disabled person",
  "040": "Voluntary contribution to approved provident fund",
  "041": "Dental examination or treatment",
  "042": "Fertility treatment",
  "043": "Treatment and home care nursing, daycare centres and residential care centres",
  "044": "Vouchers, gift cards, loyalty points, etc.",
  "045": "Self-billed - Non-monetary payment to agents, dealers or distributors",
};

// Walk-in / general public buyer. LHDN e-Invoice Specific Guideline, Section 3 (Consolidated
// e-Invoice) and Appendix 2 (Buyer's details in consolidated e-Invoice): these exact values.
export const GENERAL_PUBLIC_BUYER = {
  name: "General Public", tin: "EI00000000010", brn: "NA", sstNo: "NA", address: "NA", phone: "NA",
};

// Text helpers: lower-case, punctuation to spaces, so "e-commerce" -> "e commerce".
export const normalize = (s = "") => " " + String(s).toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim() + " ";
// Whole-word / whole-phrase match on normalized text ("car" never matches "baucar" or "carpet").
// A trailing English plural "s" is allowed ("laptops", "repairs").
export function hasPhrase(norm, phrase) {
  const p = normalize(phrase).trim();
  return norm.includes(` ${p} `) || norm.includes(` ${p}s `);
}

// Keyword hints so the tool can suggest a code from a plain-language item description (BM + English).
// Matching: whole words only. The longest matching phrase wins ("sewa kereta" beats "sewa");
// on a tie the rule listed first wins. Rules with `candidates` mean "genuinely unclear".
const CODE_RULES = [
  { candidates: ["022", "037"], words: ["komisen", "komisyen", "commission"],
    note: "Commission you RECEIVE (you invoice the payer): usually 022 Others. Commission you PAY to agents/dealers: 037 self-billed. Confirm with LHDN." },
  { code: "022", words: ["team building", "insurans kereta", "insurans motor", "car insurance", "motor insurance", "general insurance", "insurans am", "service charge", "caj perkhidmatan"] },
  { code: "029", words: ["ev charging", "ev charger", "pengecas ev", "caj ev"] },
  { code: "030", words: ["repair", "maintenance", "servicing", "servis", "baiki", "membaiki", "pembaikan", "penyelenggaraan", "selenggara", "overhaul",
    "car service", "aircond service", "aircon service", "service aircond", "service aircon", "service kereta", "tukar minyak hitam"] },
  { code: "028", words: ["car rental", "vehicle rental", "lorry rental", "van rental", "rent a car", "sewa kereta", "kereta sewa", "sewa lori", "sewa van", "sewa kenderaan", "sewa motosikal"] },
  { code: "038", words: ["futsal", "badminton", "sewa gelanggang", "gelanggang", "sports equipment", "peralatan sukan", "competition registration", "yuran pertandingan", "sports training", "latihan sukan", "sukan", "sport"] },
  { code: "002", words: ["tadika", "taska", "kindergarten", "childcare", "child care", "nursery", "pusat jagaan kanak kanak"] },
  { code: "010", words: ["tuition", "tuisyen", "course fee", "yuran kursus", "school fee", "yuran sekolah", "education", "pendidikan", "class fee", "yuran kelas", "kelas tambahan", "yuran pengajian"] },
  { code: "013", words: ["gym", "gim", "fitness membership", "keahlian gim"] },
  { code: "041", words: ["dental", "dentist", "gigi", "doktor gigi"] },
  { code: "020", words: ["vaccination", "vaccine", "vaksin", "medical checkup", "medical check up", "pemeriksaan perubatan"] },
  { code: "015", words: ["takaful", "life insurance", "insurans hayat"] },
  { code: "003", words: ["laptop", "computer", "komputer", "smartphone", "handphone", "mobile phone", "phone", "telefon bimbit", "telefon pintar", "tablet", "ipad", "iphone", "pc", "desktop"] },
  { code: "005", words: ["cement", "simen", "brick", "bata", "sand", "pasir", "steel bar", "besi bar", "tiles", "jubin", "construction material", "bahan binaan"] },
  { code: "008", words: ["shopee", "lazada", "tiktok shop", "online order", "e commerce", "ecommerce", "jualan online"] },
  { code: "016", words: ["interest", "financing", "profit charge", "loan charge", "faedah", "pembiayaan", "caj pinjaman", "faedah pinjaman"] },
  { code: "017", words: ["internet", "broadband", "wifi", "fibre", "unifi"] },
  { code: "044", words: ["voucher", "baucar", "gift card", "kad hadiah", "loyalty point", "mata ganjaran"] },
  { code: "018", words: ["land", "tanah", "building", "bangunan", "property", "hartanah", "premis", "rent of premises", "office rental", "shop rental",
    "sewa kedai", "sewa pejabat", "sewa premis", "sewa rumah", "sewa bilik", "sewa tanah", "rumah kedai"] },
  { code: "025", words: ["car", "kereta", "motorcycle", "motosikal", "motor vehicle", "kenderaan", "lorry", "lori", "van"] },
  { code: "027", words: ["reimburse", "reimbursement", "tuntutan balik"] },
  { code: "031", words: ["research", "r&d", "penyelidikan"] },
  { code: "007", words: ["donation", "sumbangan", "derma"] },
  { code: "006", words: ["disbursement"] },
  // Generic words: only used when nothing more specific matched.
  { candidates: ["015", "014", "022"], words: ["insurans", "insurance"],
    note: "Life/takaful: 015. Education or medical insurance: 014. General insurance (car, fire, etc.): 022. Confirm with LHDN." },
  { candidates: ["018", "028", "022"], words: ["sewa", "sewaan", "rent", "rental"],
    note: "Renting premises/land: 018. Renting a vehicle: 028. Renting equipment or other things: 022. Confirm with LHDN." },
  { candidates: ["010", "002", "013"], words: ["yuran"],
    note: "Tuition/course: 010. Kindergarten/childcare: 002. Gym: 013 (sports fees: 038; anything else: 022). Confirm with LHDN." },
];

// Words that describe a TAX, not the item. Classification codes don't cover these.
const TAX_WORDS = [
  ["02", ["service tax", "cukai perkhidmatan"]],
  ["01", ["sales tax", "cukai jualan"]],
  ["03", ["tourism tax", "cukai pelancongan"]],
  ["04", ["high value goods tax"]],
];

// Full answer: { code, candidates, confident, keyword, note, taxType }
export function classify(description = "") {
  const d = normalize(description);
  let best = null;
  CODE_RULES.forEach((rule, order) => {
    const hits = rule.words.filter((w) => hasPhrase(d, w));
    if (!hits.length) return;
    const keyword = hits.reduce((a, b) => (normalize(b).split(" ").length > normalize(a).split(" ").length ? b : a));
    const len = normalize(keyword).trim().split(" ").length;
    if (!best || len > best.len) best = { rule, keyword, len, order };
  });
  const tax = TAX_WORDS.find(([, ws]) => ws.some((w) => hasPhrase(d, w)));
  const taxType = tax ? tax[0] : null;
  const taxNote = taxType ? `"${description}" is a tax, not an item: use tax type ${taxType}. Pick the classification code from what you are selling.` : null;
  if (!best) {
    return { code: "022", candidates: ["022"], confident: false, keyword: null, taxType,
      note: taxNote || "No keyword matched, so 022 Others is the fallback. Check the full list or confirm with LHDN." };
  }
  const { rule, keyword } = best;
  if (rule.candidates) {
    return { code: rule.candidates[0], candidates: rule.candidates, confident: false, keyword, taxType, note: [rule.note, taxNote].filter(Boolean).join(" ") };
  }
  return { code: rule.code, candidates: [rule.code], confident: true, keyword, taxType, note: taxNote };
}

// Single best code (first candidate when unclear). Kept for callers that need one code.
export function suggestClassification(description = "") {
  return classify(description).code;
}

// TIN: individual IG + digits; non-individual prefixes C, CS, D, E, F, FA, PT, TA, TC, TN, TR, TP, J, LE + digits
export function checkTin(tin) {
  if (!tin) return { ok: false, msg: "TIN missing" };
  const t = String(tin).trim().toUpperCase();
  if (GENERAL_TINS[t]) return { ok: true, msg: `General TIN: ${GENERAL_TINS[t]}` };
  if (/^(IG|C|CS|D|E|F|FA|PT|TA|TC|TN|TR|TP|J|LE)\d{8,13}$/.test(t)) return { ok: true, msg: "Format looks valid (confirm via MyInvois TIN search)" };
  return { ok: false, msg: `"${tin}" does not look like an LHDN TIN (e.g. C2584563201 or IG1234567890)` };
}
