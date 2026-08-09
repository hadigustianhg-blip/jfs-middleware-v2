"use strict";

class JfsNetworkMismatchError extends Error {
  constructor(expected, actual) {
    super(`JFS network mismatch: expected "${expected}", got "${actual || "empty"}"`);
    this.name = "JfsNetworkMismatchError";
    this.code = "JFS_NETWORK_MISMATCH";
    this.status = 400;
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Validates that an actual network code matches the expected outlet network code.
 * Strict exact match, no fuzzy matching, empty values rejected if expected is set.
 */
function assertExpectedNetworkCode(expected, actual) {
  if (!expected) {
    return true;
  }

  const normalizedExpected = String(expected).trim();
  const normalizedActual = actual ? String(actual).trim() : "";

  if (!normalizedActual || normalizedExpected !== normalizedActual) {
    throw new JfsNetworkMismatchError(normalizedExpected, normalizedActual);
  }

  return true;
}

module.exports = {
  assertExpectedNetworkCode,
  JfsNetworkMismatchError
};
