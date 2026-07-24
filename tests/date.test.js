"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
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
