"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sendJson,
  sendSuccess,
  sendError
} = require("../src/utils/response");

function createResponseDouble() {
  return {
    statusCode: undefined,
    payload: undefined,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

test("sendJson preserves the supplied payload shape", () => {
  const res = createResponseDouble();
  const payload = { total: 0, data: [] };
  sendJson(res, 202, payload);
  assert.equal(res.statusCode, 202);
  assert.strictEqual(res.payload, payload);
});

test("success and error helpers do not impose a response schema", () => {
  const successResponse = createResponseDouble();
  const errorResponse = createResponseDouble();

  sendSuccess(successResponse, { data: [] });
  sendError(errorResponse, 401, { error: "TOKEN EXPIRED" });

  assert.deepEqual(successResponse.payload, { data: [] });
  assert.deepEqual(errorResponse.payload, { error: "TOKEN EXPIRED" });
});
