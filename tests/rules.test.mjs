// Rule tests. Run: npm test  (uses Node's built-in test runner, no extra packages)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { draftInvoice, lookupCodes, checkObligation, blockedIndustry, isWalkIn } from "../src/logic.js";
import { GENERAL_TINS, TAX_TYPES, checkTin, classify } from "../src/rules.js";

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
  test("named buyer without TIN gets the general TIN and a warning", () => {
    const r = draft({ name: "ABC Sdn Bhd", address: "KL" });
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
  assert.equal(QUERIES.length, 30);
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
