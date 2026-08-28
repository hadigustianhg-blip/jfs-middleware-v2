"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { mapRepaymentType } = require("../src/mappers/cod.mapper");

test("preserves null instead of coercing it to zero", () => {
  assert.deepEqual(mapRepaymentType({ repaymentType: null }), {
    repaymentType: null,
    repaymentTypeCode: null,
    repaymentTypeLabel: null
  });
});

for (const code of [1, 2, 3]) {
  test(`preserves repayment type code ${code}`, () => {
    assert.deepEqual(mapRepaymentType({ repaymentType: code }), {
      repaymentType: code,
      repaymentTypeCode: code,
      repaymentTypeLabel: null
    });
  });
}

test("preserves a real source zero", () => {
  assert.deepEqual(mapRepaymentType({ repaymentType: 0 }), {
    repaymentType: 0,
    repaymentTypeCode: 0,
    repaymentTypeLabel: null
  });
});

test("forwards the available repayment type label", () => {
  assert.deepEqual(mapRepaymentType({
    repaymentType: 2,
    repaymentTypeName: " QRIS COD "
  }), {
    repaymentType: 2,
    repaymentTypeCode: 2,
    repaymentTypeLabel: "QRIS COD"
  });
});

test("the COD-only patch does not alter other route implementations", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /app\.get\("\/jfs-cod"/);
  assert.match(server, /\.\.\.mapRepaymentType\(item\)/);
  assert.doesNotMatch(server, /repaymentType:\s*item\.repaymentType\s*\|\|\s*0/);
});
