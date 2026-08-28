"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const logger = require("../src/utils/logger");

test("redacts sensitive fields and keeps ordinary context", () => {
  const sanitized = logger.sanitize({
    token: "token-value",
    cookie: "cookie-value",
    Authorization: "authorization-value",
    nested: {
      api_key: "api-key-value",
      outlet: "SUM001A"
    }
  });

  assert.equal(sanitized.token, "[REDACTED]");
  assert.equal(sanitized.cookie, "[REDACTED]");
  assert.equal(sanitized.Authorization, "[REDACTED]");
  assert.equal(sanitized.nested.api_key, "[REDACTED]");
  assert.equal(sanitized.nested.outlet, "SUM001A");
});

test("logger writes an ISO timestamp and sanitized context", () => {
  const originalLog = console.log;
  let output = "";
  console.log = value => {
    output = value;
  };

  try {
    logger.info("test message", {
      sessionId: "session-value",
      status: "ok"
    });
  } finally {
    console.log = originalLog;
  }

  const entry = JSON.parse(output);
  assert.equal(entry.message, "test message");
  assert.equal(entry.context.sessionId, "[REDACTED]");
  assert.equal(entry.context.status, "ok");
  assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("nested headers and common secret variants are fully redacted", () => {
  const secrets = {
    headers: {
      authorization: "Bearer SECRET_TOKEN",
      cookie: "session=SECRET_SESSION"
    },
    password: "password-secret",
    apiKey: "api-key-secret",
    safe: "visible"
  };
  const sanitized = logger.sanitize(secrets);
  const output = JSON.stringify(sanitized);

  assert.equal(sanitized.headers.authorization, "[REDACTED]");
  assert.equal(sanitized.headers.cookie, "[REDACTED]");
  assert.equal(sanitized.password, "[REDACTED]");
  assert.equal(sanitized.apiKey, "[REDACTED]");
  assert.equal(sanitized.safe, "visible");
  assert.doesNotMatch(
    output,
    /SECRET_TOKEN|SECRET_SESSION|password-secret|api-key-secret/
  );
});
