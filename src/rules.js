// Malaysia e-Invoice (LHDN MyInvois) reference data and rules.
// Sources checked Oct 2026: LHDN MyInvois SDK code lists (via L&CO / ClearTax mirrors),
// malaysia4u.com e-invoicing + SST guides, jomeinvoice.my RM10k rule guide.
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
  EI00000000010: "General public (local buyer with no TIN / consolidated B2C)",
  EI00000000020: "Foreign buyer",
  EI00000000030: "Foreign supplier (self-billed)",
  EI00000000040: "Government / statutory body buyer",
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
  E: "Tax exemption",
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

// Keyword hints so the tool can suggest a code from a plain-language item description
const CODE_KEYWORDS = [
  ["030", ["repair", "maintenance", "servicing", "service charge for repair"]],
  ["028", ["car rental", "vehicle rental", "lorry rental"]],
  ["003", ["laptop", "computer", "smartphone", "phone", "tablet", "ipad", "pc"]],
  ["005", ["cement", "brick", "sand", "steel bar", "tiles", "construction material"]],
  ["008", ["shopee", "lazada", "tiktok shop", "online order", "e-commerce", "ecommerce"]],
  ["010", ["tuition", "course fee", "school fee", "education", "class fee"]],
  ["013", ["gym", "fitness membership"]],
  ["016", ["interest", "financing", "profit charge", "loan charge"]],
  ["017", ["internet", "broadband", "wifi", "fibre"]],
  ["018", ["land", "building", "property", "rent of premises", "office rental"]],
  ["025", ["car", "motorcycle", "motor vehicle", "lorry", "van"]],
  ["027", ["reimburse"]],
  ["031", ["research", "r&d"]],
  ["044", ["voucher", "gift card", "loyalty point"]],
  ["007", ["donation", "sumbangan", "derma"]],
  ["006", ["disbursement"]],
];

export function suggestClassification(description = "") {
  const d = description.toLowerCase();
  for (const [code, words] of CODE_KEYWORDS) {
    if (words.some((w) => d.includes(w))) return code;
  }
  return "022"; // Others
}

// TIN: individual IG + digits; non-individual prefixes C, CS, D, E, F, FA, PT, TA, TC, TN, TR, TP, J, LE + digits
export function checkTin(tin) {
  if (!tin) return { ok: false, msg: "TIN missing" };
  const t = String(tin).trim().toUpperCase();
  if (GENERAL_TINS[t]) return { ok: true, msg: `General TIN: ${GENERAL_TINS[t]}` };
  if (/^(IG|C|CS|D|E|F|FA|PT|TA|TC|TN|TR|TP|J|LE)\d{8,13}$/.test(t)) return { ok: true, msg: "Format looks valid (confirm via MyInvois TIN search)" };
  return { ok: false, msg: `"${tin}" does not look like an LHDN TIN (e.g. C2584563201 or IG1234567890)` };
}
