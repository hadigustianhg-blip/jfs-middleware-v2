"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  formatDateJakarta,
  getStartOfDayJakarta,
  getEndOfDayJakarta,
  parseDateInput,
  validateDateRange
} = require("../src/utils/date");

test("formats an ISO timestamp as a Jakarta date", () => {
  assert.equal(
    formatDateJakarta("2026-07-23T18:00:00Z"),
    "2026-07-24"
  );
});

test("formats start and end of day", () => {
  assert.equal(
    getStartOfDayJakarta("2026-07-24"),
    "2026-07-24 00:00:00"
  );
  assert.equal(
    getEndOfDayJakarta("2026-07-24"),
    "2026-07-24 23:59:59"
  );
});

test("rejects an invalid date", () => {
  assert.throws(() => parseDateInput("2026-02-30"), /Invalid date/);
});

test("rejects a reversed date range", () => {
  assert.throws(
    () => validateDateRange("2026-07-25", "2026-07-24"),
    /must not be after/
  );
});

test("handles WIB day rollover and an ISO timezone offset", () => {
  assert.equal(
    formatDateJakarta("2026-01-31T17:30:00Z"),
    "2026-02-01"
  );
  assert.equal(
    formatDateJakarta("2026-07-24T00:30:00+09:00"),
    "2026-07-23"
  );
});

test("handles month boundaries and leap years", () => {
  assert.equal(
    getEndOfDayJakarta("2026-01-31"),
    "2026-01-31 23:59:59"
  );
  assert.equal(
    getStartOfDayJakarta("2026-02-01"),
    "2026-02-01 00:00:00"
  );
  assert.equal(formatDateJakarta("2024-02-29"), "2024-02-29");
  assert.throws(() => parseDateInput("2025-02-29"), /Invalid date/);
});

test("accepts a date range with the same begin and end", () => {
  assert.deepEqual(
    validateDateRange("2026-07-24", "2026-07-24"),
    {
      beginDate: "2026-07-24 00:00:00",
      endDate: "2026-07-24 00:00:00"
    }
  );
});

test("Jakarta output does not depend on the machine timezone", () => {
  const modulePath = path.resolve(__dirname, "../src/utils/date.js");
  const script =
    `const d=require(${JSON.stringify(modulePath)});` +
    `process.stdout.write(d.formatDateJakarta("2026-07-23T18:00:00Z"));`;
  const output = execFileSync(process.execPath, ["-e", script], {
    env: {
      ...process.env,
      TZ: "America/New_York"
    },
    encoding: "utf8"
  });

  assert.equal(output, "2026-07-24");
});
