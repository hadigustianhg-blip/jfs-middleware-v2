"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getEnv,
  getRequiredEnv,
  getNumberEnv
} = require("../src/config/env");

test("getEnv returns a fallback for a missing value", () => {
  delete process.env.TEST_SHARED_MISSING;
  assert.equal(getEnv("TEST_SHARED_MISSING", "fallback"), "fallback");
});

test("getRequiredEnv identifies only the missing variable name", () => {
  delete process.env.TEST_SHARED_REQUIRED;
  assert.throws(
    () => getRequiredEnv("TEST_SHARED_REQUIRED"),
    /TEST_SHARED_REQUIRED/
  );
});

test("getNumberEnv accepts a valid number", () => {
  process.env.TEST_SHARED_NUMBER = "42";
  assert.equal(getNumberEnv("TEST_SHARED_NUMBER", 10), 42);
  delete process.env.TEST_SHARED_NUMBER;
});

test("getNumberEnv rejects an invalid number", () => {
  process.env.TEST_SHARED_NUMBER = "not-a-number";
  assert.throws(
    () => getNumberEnv("TEST_SHARED_NUMBER", 10),
    /must be a valid number/
  );
  delete process.env.TEST_SHARED_NUMBER;
});
