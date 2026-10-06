// Rule tests. Run: npm test  (uses Node's built-in test runner, no extra packages)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { draftInvoice, lookupCodes, checkObligation, blockedIndustry, isWalkIn, GENERAL_TIN_NOTE } from "../src/logic.js";
import { GENERAL_TINS, TAX_TYPES, checkTin, classify, generalTinFor, idKind, GOVERNMENT_BUYER_CATEGORIES, ID_TIN_ONLY } from "../src/rules.js";

const SUPPLIER = { name: "Kedai Maju Sdn Bhd", tin: "C2584563201", brn: "202001012345", msic: "47910", activity: "Retail", address: "Kajang, Selangor", phone: "0123456789", sstNo: "W10-1808-32000001" };
const ITEM = { description: "Laptop", unitPrice: 100 };
const draft = (buyer, items = [ITEM], supplier = SUPPLIER) => draftInvoice({ invoiceNo: "INV-1", supplier, buyer, items });
const issue = (r, field, level) => r.readiness.issues.find((i) => i.field === field && (!level || i.level === level));

describe("walk-in / general public buyer (LHDN Specific Guideline, Appendix 2)", () => {
  const expected = { name: "General Public", tin: "EI00000000010", brn: "NA", sstNo: "NA", address: "NA", phone: "NA" };

  for (const buyer of [{}, { name: "Walk-in" }, { name: "walk in customer" }, { name: "Orang Awam" }, { name: "General Public" }, { name: "Pelanggan tunai" }, { name: "Cash sale" }, { name: "N/A" }, { tin: "EI00000000010" }, { name: "", tin: "ei00000000010", brn: "NA" }]) {
    test(`buyer ${JSON.stringify(buyer)} is a walk-in and needs no address`, () => {
      assert.equal(isWalkIn(buyer), true);
      const r = draft(buyer);
      assert.deepEqual({ ...r.invoice.buyer, email: undefined }, { ...expected, email: undefined });
      assert.equal(issue(r, "buyer.address"), undefined, "must not demand an address");
      assert.equal(issue(r, "buyer.name", "error"), undefined);
      assert.equal(r.readiness.ready, true);
    });
  }

  test("a walk-in's email is kept if given", () => {
    assert.equal(draft({ name: "Walk-in", email: "a@b.my" }).invoice.buyer.email, "a@b.my");
  });

  test("a named buyer with a real TIN or IC is not a walk-in", () => {
    assert.equal(isWalkIn({ name: "Walk-in", tin: "C2584563201" }), false);
    assert.equal(isWalkIn({ name: "Ahmad bin Ali", brn: "900101145678" }), false);
    assert.equal(isWalkIn({ name: "Ahmad bin Ali" }), false);
    assert.equal(isWalkIn({ name: "Public Bank Berhad" }), false);
    assert.equal(isWalkIn({ name: "General Trading Enterprise" }), false);
  });

  test("individual with MyKad but no TIN: general TIN + IC kept, address still needed", () => {
    const r = draft({ name: "Ahmad bin Ali", brn: "900101-14-5678" });
    assert.equal(r.invoice.buyer.tin, "EI00000000010");
    assert.equal(r.invoice.buyer.brn, "900101-14-5678");
    assert.equal(issue(r, "buyer.tin").level, "info");
    assert.ok(issue(r, "buyer.address", "error"));
  });
});

describe("foreign buyer (EI00000000020)", () => {
  test("with passport and address: ready, no BRN warning", () => {
    const r = draft({ name: "John Smith", tin: "EI00000000020", brn: "A12345678", address: "Singapore" });
    assert.equal(r.readiness.ready, true);
    assert.equal(issue(r, "buyer.brn"), undefined);
    assert.equal(r.invoice.buyer.tin, "EI00000000020");
  });
  test("without passport: warns for passport / foreign registration number", () => {
    const r = draft({ name: "John Smith", tin: "EI00000000020", address: "Singapore" });
    assert.match(issue(r, "buyer.brn", "warn").msg, /passport/i);
  });
  test("without address: error (not a walk-in)", () => {
    assert.ok(issue(draft({ name: "John Smith", tin: "EI00000000020", brn: "A1" }), "buyer.address", "error"));
  });
});

describe("normal B2B buyer", () => {
  const b2b = { name: "ABC Logistics Sdn Bhd", tin: "C1234567890", brn: "201901000123", address: "Shah Alam", phone: "0355551234" };
  test("complete buyer: ready with no buyer issues", () => {
    const r = draft(b2b);
    assert.equal(r.readiness.ready, true);
    assert.equal(r.readiness.issues.filter((i) => i.field.startsWith("buyer")).length, 0);
    assert.equal(r.invoice.buyer.name, b2b.name);
    assert.equal(r.invoice.buyer.sstNo, "NA");
  });
  test("missing address is an error", () => {
    assert.ok(issue(draft({ ...b2b, address: "" }), "buyer.address", "error"));
  });
  test("missing BRN is a warning", () => {
    assert.ok(issue(draft({ ...b2b, brn: "" }), "buyer.brn", "warn"));
  });
  test("bad TIN is an error", () => {
    assert.ok(issue(draft({ ...b2b, tin: "12345" }), "buyer.tin", "error"));
  });
  test("business buyer without TIN is an error, not the general TIN", () => {
    for (const name of ["ABC Sdn Bhd", "XYZ Enterprise", "Maju Trading", "Kedai Ali"]) {
      const r = draft({ name, address: "KL" });
      assert.notEqual(r.invoice.buyer.tin, "EI00000000010");
      assert.equal(issue(r, "buyer.tin").level, "error");
      assert.equal(r.readiness.ready, false);
    }
  });
  test("named individual buyer without TIN or ID still gets the general TIN with a warning", () => {
    const r = draft({ name: "Ahmad bin Ali", address: "KL" });
    assert.equal(r.invoice.buyer.tin, "EI00000000010");
    assert.equal(issue(r, "buyer.tin").level, "warn");
  });
});

describe("general TINs", () => {
  for (const tin of Object.keys(GENERAL_TINS)) {
    test(`${tin} passes the TIN check`, () => {
      const c = checkTin(tin);
      assert.equal(c.ok, true);
      assert.match(c.msg, /General TIN/);
      assert.equal(checkTin(tin.toLowerCase()).ok, true);
    });
  }
  test("EI00000000010 as buyer = walk-in", () => {
    assert.equal(draft({ tin: "EI00000000010" }).invoice.buyer.name, "General Public");
  });
  test("EI00000000020 as buyer = foreign buyer", () => {
    assert.equal(draft({ name: "X", tin: "EI00000000020", brn: "P1", address: "Jakarta" }).readiness.ready, true);
  });
  test("EI00000000030 as buyer is rejected (it is for foreign suppliers)", () => {
    assert.match(issue(draft({ name: "X", tin: "EI00000000030", address: "Y" }), "buyer.tin", "error").msg, /SUPPLIER/);
  });
  test("EI00000000040 as buyer = government, no BRN warning", () => {
    const r = draft({ name: "Majlis Perbandaran Kajang", tin: "EI00000000040", address: "Kajang" });
    assert.equal(r.readiness.ready, true);
    assert.equal(issue(r, "buyer.brn"), undefined);
  });
});

describe("tax types", () => {
  const buyer = { name: "ABC Sdn Bhd", tin: "C1234567890", brn: "1", address: "KL" };
  const cases = { "01": [undefined, 10], "02": [undefined, 8], "03": [10, 10], "04": [5, 5], "05": [10, 10], "06": [8, 0], E: [8, 0] };
  assert.deepEqual(Object.keys(cases).sort(), Object.keys(TAX_TYPES).sort(), "every tax type is covered");
  for (const [taxType, [taxRate, rate]] of Object.entries(cases)) {
    test(`tax type ${taxType} (${TAX_TYPES[taxType]}) -> ${rate}%`, () => {
      const r = draft(buyer, [{ description: "Item", quantity: 2, unitPrice: 50, taxType, taxRate }]);
      const l = r.invoice.lines[0];
      assert.equal(l.taxType, taxType);
      assert.equal(l.taxTypeName, TAX_TYPES[taxType]);
      assert.equal(l.taxRate, rate);
      assert.equal(l.taxAmount, rate);
      assert.equal(r.invoice.totals.payable, 100 + rate);
      assert.equal(issue(r, "items[0].taxType", "error"), undefined);
    });
  }
  test("charging SST without an SST number warns; 06 / E do not", () => {
    const noSst = { ...SUPPLIER, sstNo: "" };
    assert.ok(issue(draft(buyer, [{ description: "x", unitPrice: 1, taxType: "01" }], noSst), "items[0].taxType", "warn"));
    assert.equal(issue(draft(buyer, [{ description: "x", unitPrice: 1, taxType: "06" }], noSst), "items[0].taxType"), undefined);
    assert.equal(issue(draft(buyer, [{ description: "x", unitPrice: 1, taxType: "E" }], noSst), "items[0].taxType"), undefined);
  });
  test("default tax type: 02 if SST-registered, 06 if not", () => {
    assert.equal(draft(buyer).invoice.lines[0].taxType, "02");
    assert.equal(draft(buyer, [ITEM], { ...SUPPLIER, sstNo: "" }).invoice.lines[0].taxType, "06");
  });
});

// [query, expected code] or [query, [candidates...]] when genuinely unclear, plus expected tax-type hint.
const QUERIES = [
  ["servis kereta", "030"],
  ["service tax", "022", "02"],
  ["web design", "022"],
  ["Website development services", "022"],
  ["IT consulting", "022"],
  ["graphic design", "022"],
  ["reka bentuk web", "022"],
  ["servis aircond rumah", "030"],
  ["repair laptop", "030"],
  ["beli laptop baru", "003"],
  ["telefon bimbit Samsung", "003"],
  ["headphone wireless", "022"],
  ["sewa kedai", "018"],
  ["sewa kereta", "028"],
  ["sewa lori 3 tan", "028"],
  ["sewa", ["018", "028", "022"]],
  ["sewa gelanggang futsal", "038"],
  ["yuran tuisyen", "010"],
  ["yuran tadika", "002"],
  ["yuran gym bulanan", "013"],
  ["yuran", ["010", "002", "013"]],
  ["komisen ejen hartanah", ["022", "037"]],
  ["komisen jualan", ["022", "037"]],
  ["gift card", "044"],
  ["baucar makan", "044"],
  ["carpet cleaning", "022"],
  ["advance payment", "022"],
  ["team building program", "022"],
  ["island hopping tour", "022"],
  ["insurans kereta", "022"],
  ["jual kereta terpakai", "025"],
  ["faedah pinjaman", "016"],
  ["pasir dan simen", "005"],
  ["cukai jualan", "022", "01"],
  ["rawatan gigi", "041"],
];

describe("lookup_classification_code keyword queries", () => {
  assert.equal(QUERIES.length, 35);
  for (const [query, expected, tax] of QUERIES) {
    test(`"${query}" -> ${Array.isArray(expected) ? "unclear: " + expected.join("/") : expected}${tax ? " + tax " + tax : ""}`, () => {
      const r = lookupCodes({ query });
      if (Array.isArray(expected)) {
        assert.equal(r.suggested, null, "unclear queries must not give one confident answer");
        assert.equal(r.confident, false);
        assert.deepEqual(r.candidates.map((c) => c.code), expected);
        assert.match(r.note, /confirm with LHDN/i);
      } else {
        assert.equal(r.suggested?.code, expected);
      }
      assert.equal(r.taxTypeHint?.code, tax);
    });
  }

  test("exact code and official wording still work", () => {
    assert.equal(lookupCodes({ query: "025" }).suggested.code, "025");
    assert.equal(lookupCodes({ query: "motor vehicle" }).suggested.code, "025");
    assert.equal(lookupCodes({ query: "tuition" }).suggested.code, "010");
  });
  test("empty query lists all 45 codes", () => {
    assert.equal(lookupCodes({ query: "" }).matches.length, 45);
    // a query with no keyword hit must not dump the whole list
    const none = lookupCodes({ query: "zzz widget" });
    assert.deepEqual(none.matches.map((m) => m.code), ["022"]);
    assert.equal(lookupCodes({ query: "web design" }).suggested.code, "022");
  });
  test("draft_einvoice uses the same matching and flags unclear items", () => {
    const r = draft({}, [{ description: "Sewa", unitPrice: 500 }, { description: "Baucar makan", unitPrice: 50 }]);
    assert.equal(r.invoice.lines[0].classificationCode, classify("sewa").code);
    assert.match(issue(r, "items[0].classificationCode").msg, /unclear/i);
    assert.equal(r.invoice.lines[1].classificationCode, "044");
  });
});

describe("check_einvoice_obligation industry keywords", () => {
  const cases = [
    ["car dealer", "automotive"], ["used car showroom", "automotive"], ["jual kereta terpakai", "automotive"],
    ["car repair workshop", null], ["bengkel kereta", null], ["car wash", null], ["cargo logistics", null],
    ["carpet shop", null], ["childcare", null], ["F&B restaurant", null], ["catering", null],
    ["airline ticketing", "aviation"], ["kedai emas", "luxury"], ["jewellery retail", "luxury"],
    ["kontraktor binaan", "construction"], ["building contractor", "construction"],
  ];
  for (const [industry, want] of cases) {
    test(`"${industry}" -> ${want ?? "can consolidate"}`, () => {
      const got = blockedIndustry(industry);
      if (want) assert.ok(got?.startsWith(want), String(got)); else assert.equal(got, null);
    });
  }
  test("blocked industry changes the walk-in advice", () => {
    const a = checkObligation({ annualTurnoverRM: 3_000_000, sellsToConsumers: true, industry: "car dealer" });
    assert.ok(a.actions.some((x) => /cannot use consolidated/.test(x)));
    const b = checkObligation({ annualTurnoverRM: 3_000_000, sellsToConsumers: true, industry: "bengkel kereta" });
    assert.ok(b.actions.some((x) => /EI00000000010/.test(x)));
  });
});

describe("general TINs — LHDN Specific Guideline v4.9, Appendix 1", () => {
  // Item 2: EI00000000010
  for (const idType of ["mykad", "mytentera"]) {
    for (const role of ["buyer", "supplier", "shippingRecipient"]) {
      test(`010: Malaysian ${role} with only ${idType} -> EI00000000010, ID kept`, () => {
        const g = generalTinFor(role, { idType, id: "900101145678" });
        assert.equal(g.tin, "EI00000000010");
        assert.equal(g.id, "900101145678");
      });
    }
  }
  for (const idType of ["mypr", "mykas"]) {
    test(`010: non-Malaysian individual with only ${idType} -> EI00000000010, NOT EI00000000020`, () => {
      const g = generalTinFor("buyer", { idType, id: "850505105555" });
      assert.equal(g.tin, "EI00000000010");
      assert.notEqual(g.tin, "EI00000000020");
      assert.equal(g.id, "850505105555");
      assert.match(g.rule, /MyPR\/MyKAS/);
    });
  }
  test("010: consolidated e-invoice buyer -> EI00000000010 with ID NA", () => {
    assert.deepEqual(generalTinFor("buyer", { consolidated: true }), { tin: "EI00000000010", id: "NA", rule: "Buyer on a consolidated e-Invoice" });
  });
  test("010: consolidated self-billed e-invoice supplier -> EI00000000010", () => {
    assert.equal(generalTinFor("supplier", { consolidated: true, selfBilled: true }).tin, "EI00000000010");
  });
  test("010 in the draft tool: buyer with only a 12-digit MyPR/MyKAS number gets 010, ID in the ID field", () => {
    const r = draft({ name: "Li Wei", brn: "850505-10-5555", address: "Penang" });
    assert.equal(r.invoice.buyer.tin, "EI00000000010");
    assert.equal(r.invoice.buyer.brn, "850505-10-5555");
    assert.match(issue(r, "buyer.tin", "info").msg, /MyPR\/MyKAS/);
  });
  test("010 vs 020: a 12-digit MyPR/MyKAS number with EI00000000020 is an error", () => {
    const r = draft({ name: "Li Wei", tin: "EI00000000020", brn: "850505105555", address: "Penang" });
    assert.match(issue(r, "buyer.tin", "error").msg, /EI00000000010, not EI00000000020/);
  });

  // Item 3: EI00000000020
  test("020: passport-only buyer -> EI00000000020, passport in ID field", () => {
    const g = generalTinFor("buyer", { id: "A12345678" });
    assert.equal(g.tin, "EI00000000020");
    assert.equal(g.id, "A12345678");
  });
  test("020 in the draft tool: buyer with only a passport and no TIN gets 020", () => {
    const r = draft({ name: "John Smith", brn: "A12345678", address: "Singapore" });
    assert.equal(r.invoice.buyer.tin, "EI00000000020");
    assert.equal(r.invoice.buyer.brn, "A12345678");
  });
  test("020: passport ID with EI00000000010 is flagged", () => {
    const r = draft({ name: "John Smith", tin: "EI00000000010", brn: "A12345678", address: "Singapore" });
    assert.match(issue(r, "buyer.tin", "warn").msg, /EI00000000020/);
  });
  test("020: export, foreign buyer's TIN not available -> EI00000000020, BRN NA", () => {
    assert.deepEqual(generalTinFor("buyer", { export: true }), { tin: "EI00000000020", id: "NA", rule: "Export: foreign buyer's TIN not available" });
  });
  test("020: foreign shipping recipient without TIN -> EI00000000020", () => {
    assert.equal(generalTinFor("shippingRecipient", { foreign: true }).tin, "EI00000000020");
  });
  test("020 in the draft tool: foreign buyer without registration number -> ID NA", () => {
    const r = draft({ name: "Acme Pte Ltd", tin: "EI00000000020", address: "Singapore" });
    assert.equal(r.invoice.buyer.brn, "NA");
  });

  // Item 4: EI00000000030 (self-billed only)
  test("030: passport-only supplier on a self-billed e-invoice -> EI00000000030", () => {
    const g = generalTinFor("supplier", { id: "E1234567X", selfBilled: true });
    assert.equal(g.tin, "EI00000000030");
    assert.equal(g.id, "E1234567X");
  });
  test("030: passport-only supplier on a normal invoice -> no general TIN", () => {
    assert.equal(generalTinFor("supplier", { idType: "passport" }).tin, null);
  });
  test("030: import, foreign supplier's TIN not available -> EI00000000030, BRN NA", () => {
    assert.deepEqual(generalTinFor("supplier", { import: true }), { tin: "EI00000000030", id: "NA", rule: "Import: foreign supplier's TIN not available (self-billed)" });
  });
  test("030 is never for a buyer", () => {
    assert.equal(generalTinFor("buyer", { idType: "passport" }).tin, "EI00000000020");
  });
  test("030 as supplier in the draft tool (a normal invoice) is an error", () => {
    const r = draft({ name: "X", tin: "C1234567890", brn: "201901000123", address: "Y" }, [ITEM], { ...SUPPLIER, tin: "EI00000000030" });
    assert.match(issue(r, "supplier.tin", "error").msg, /SELF-BILLED/);
  });

  // Item 5: EI00000000040
  test("040 lists exactly the six buyer categories", () => {
    assert.deepEqual(GOVERNMENT_BUYER_CATEGORIES, [
      "Government", "State government and state authority", "Exempt institution not assigned a TIN",
      "Government authority", "Local authority", "Statutory authority and statutory body",
    ]);
    for (const w of ["Government;", "state government and state authority", "exempt institutions not assigned a TIN", "government authority", "local authority", "statutory authority and statutory body"]) {
      assert.ok(GENERAL_TINS.EI00000000040.includes(w), w);
    }
  });
  for (const category of GOVERNMENT_BUYER_CATEGORIES) {
    test(`040: buyer category "${category}" -> EI00000000040`, () => {
      assert.equal(generalTinFor("buyer", { governmentCategory: category }).tin, "EI00000000040");
    });
  }
  test("040 is buyer-only: as supplier it is an error", () => {
    const r = draft({ name: "X", tin: "C1234567890", brn: "201901000123", address: "Y" }, [ITEM], { ...SUPPLIER, tin: "EI00000000040" });
    assert.ok(issue(r, "supplier.tin", "error"));
  });

  // Item 6: ID fill-ins
  test("individual buyer who gives only a TIN -> ID 000000000000", () => {
    const r = draft({ name: "Ahmad bin Ali", tin: "IG12345678901", address: "Kajang" });
    assert.equal(r.invoice.buyer.brn, ID_TIN_ONLY);
    assert.equal(ID_TIN_ONLY, "000000000000");
    assert.equal(issue(r, "buyer.brn", "warn"), undefined);
  });
  test("individual supplier who gives only a TIN -> ID 000000000000, no BRN error", () => {
    const r = draft({ name: "ABC", tin: "C1234567890", brn: "201901000123", address: "Y" }, [ITEM], { ...SUPPLIER, tin: "IG12345678901", brn: "" });
    assert.equal(r.invoice.supplier.brn, "000000000000");
    assert.equal(issue(r, "supplier.brn", "error"), undefined);
  });
  test("a company with no BRN is not given 000000000000", () => {
    const r = draft({ name: "ABC Sdn Bhd", tin: "C1234567890", address: "Y" });
    assert.equal(r.invoice.buyer.brn, undefined);
    assert.ok(issue(r, "buyer.brn", "warn"));
  });
  test("consolidated / walk-in buyer: General Public, ID/address/contact/SST NA", () => {
    const b = draft({ name: "Walk-in" }).invoice.buyer;
    assert.deepEqual([b.name, b.tin, b.brn, b.address, b.phone, b.sstNo], ["General Public", "EI00000000010", "NA", "NA", "NA", "NA"]);
  });

  test("ID kinds", () => {
    assert.equal(idKind("900101-14-5678"), "nric");
    assert.equal(idKind("A12345678"), "passport");
    assert.equal(idKind("E1234567X"), "passport");
    assert.equal(idKind("NA"), "na");
    assert.equal(idKind(""), "none");
    assert.equal(idKind("123456-A"), "other");
  });
  test("no source reference to v4.8 and no 'still to check' note remains", async () => {
    const { readFile } = await import("node:fs/promises");
    for (const f of ["src/rules.js", "src/logic.js", "README.md"]) {
      const t = await readFile(new URL("../" + f, import.meta.url), "utf8");
      assert.ok(!/v4\.8/.test(t), f + " still mentions v4.8");
      assert.ok(!/still to check/i.test(t), f + " still has a 'still to check' note");
    }
  });
});

describe("12-digit ID: individual (MyKad/MyTentera/MyPR/MyKAS) vs SSM company number", () => {
  // a. digits 3-4 not a month -> SSM number
  for (const n of ["202001012345", "201901000123", "199701001234", "202503067890"]) {
    test(`a: ${n} (digits 3-4 not 01-12) is an SSM number, not an individual ID`, () => {
      assert.equal(idKind(n), "company");
    });
  }
  test("a: an impossible birth date (31 Feb, 29 Feb in a non-leap year) is not an individual ID", () => {
    assert.equal(idKind("900231145678"), "company");
    assert.equal(idKind("010229145678"), "company");
    assert.equal(idKind("000229145678"), "nric"); // 29 Feb 2000 is real
  });
  test("a valid birth date not starting 19/20 is an individual ID", () => {
    assert.equal(idKind("900101-14-5678"), "nric");
    assert.equal(idKind("850505105555"), "nric");
  });

  // c. company number + no TIN -> no EI00000000010, warn
  test("c: buyer with an SSM number and no TIN does NOT get EI00000000010 and is an error", () => {
    const r = draft({ name: "ABC Trading Sdn Bhd", brn: "202001012345", address: "Shah Alam" });
    assert.notEqual(r.invoice.buyer.tin, "EI00000000010");
    assert.equal(r.invoice.buyer.tin, "");
    assert.equal(r.invoice.buyer.brn, "202001012345");
    assert.match(issue(r, "buyer.tin", "error").msg, /^Malaysian businesses must provide their TIN and business registration number\./);
  });
  test("c: generalTinFor gives no general TIN for an SSM number", () => {
    const g = generalTinFor("buyer", { id: "201901000123" });
    assert.equal(g.tin, null);
    assert.equal(g.rule, "Malaysian businesses must provide their TIN and business registration number.");
  });

  // d. ambiguous -> keep EI00000000010 but say it was assumed
  test("d: 200101145678 could be an IC (born 1 Jan 2020) or an SSM number (2001, type 01)", () => {
    assert.equal(idKind("200101145678"), "nric-or-company");
  });
  test("d: ambiguous number + no TIN: EI00000000010 kept, with an 'assumed individual' note", () => {
    const r = draft({ name: "Aiman", brn: "200101145678", address: "Kajang" });
    assert.equal(r.invoice.buyer.tin, "EI00000000010");
    assert.equal(r.invoice.buyer.brn, "200101145678");
    assert.match(issue(r, "buyer.brn", "info").msg, /assumed to be an individual ID/);
  });
  test("a clear individual ID gets no 'assumed' note", () => {
    const r = draft({ name: "Ahmad", brn: "900101145678", address: "Kajang" });
    assert.equal(issue(r, "buyer.brn"), undefined);
  });
  test("ambiguous number with EI00000000020 is still an error", () => {
    assert.ok(issue(draft({ name: "X", tin: "EI00000000020", brn: "200101145678", address: "Y" }), "buyer.tin", "error"));
  });
});

describe("drafting tool output: general TIN note", () => {
  test("every draft carries the self-billed / export / import / government note", () => {
    const r = draft({ name: "Walk-in" });
    assert.equal(r.generalTinNote, GENERAL_TIN_NOTE);
    assert.equal(GENERAL_TIN_NOTE, "Self-billed, export, import and government invoices use different general TINs (EI00000000030, EI00000000020, EI00000000040) — see LHDN e-Invoice Specific Guideline v4.9, Appendix 1.");
  });
});

describe("RM10,000 single-transaction rule (Specific Guideline v4.9, Table 3.6 item 7: \"exceeding RM10,000\")", () => {
  const at = (amount) => draft({ name: "Walk-in" }, [{ description: "Laptop", unitPrice: amount, taxType: "06" }]);
  test("RM10,000.00 -> consolidation still allowed", () => {
    const r = at(10000);
    assert.equal(r.invoice.totals.payable, 10000);
    assert.equal(issue(r, "totals"), undefined);
  });
  test("RM10,000.01 -> individual e-invoice required", () => {
    const r = at(10000.01);
    assert.equal(r.invoice.totals.payable, 10000.01);
    assert.match(issue(r, "totals", "info").msg, /^Above RM10,000: must be issued as an individual e-invoice/);
  });
  test("user-facing wording says 'above RM10,000', not 'or more'", () => {
    const text = JSON.stringify([at(10000.01), checkObligation({ annualTurnoverRM: 3000000, sellsToConsumers: true })]);
    assert.ok(!/or more/.test(text), "found 'or more'");
    assert.match(text, /above RM10,000/i);
  });
});
