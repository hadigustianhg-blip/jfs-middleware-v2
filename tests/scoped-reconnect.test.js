"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createInternalMultiOutletRouter } = require("../src/routes/internal-multi-outlet.routes");

function routeRequest(headers) {
  return {
    headers,
    get(name) { return headers[name.toLowerCase()] || headers[name] || undefined; }
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function invokeRoute(router, path, request, response) {
  const layer = router.stack.find(item => item.route?.path === path);
  assert.ok(layer);
  const middleware = layer.route.stack[0].handle;
  const handler = layer.route.stack[1].handle;
  await middleware(request, response, async () => handler(request, response));
}

test("scoped reconnect returns the shared context connection result", async () => {
  const context = {
    authManager: {
      setCredentials() {},
      async reconnect() {
        return { connected: true, networkCode: "SUM001A", name: "Network", sessionStatus: "ACTIVE" };
      }
    }
  };
  const registry = { get: () => context };
  const router = createInternalMultiOutletRouter({ getAuthKey: () => "KEY", registry });
  const req = routeRequest({
    "x-auth-key": "KEY",
    "x-jfs-tenant-id": "tenant",
    "x-jfs-outlet-id": "outlet",
    "x-jfs-outlet-code": "SUM001A",
    "x-jfs-account": "hidden",
    "x-jfs-password": "hidden"
  });
  const res = responseRecorder();
  await invokeRoute(router, "/scoped/reconnect", req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, {
    connected: true,
    networkCode: "SUM001A",
    name: "Network",
    sessionStatus: "ACTIVE"
  });
});

test("scoped connection test returns the shared context connection result", async () => {
  const context = {
    authManager: {
      setCredentials() {},
      async testConnection() {
        return { connected: true, networkCode: "SUM001A", name: "Network", sessionStatus: "ACTIVE" };
      }
    }
  };
  const router = createInternalMultiOutletRouter({
    getAuthKey: () => "KEY",
    registry: { get: () => context }
  });
  const req = routeRequest({
    "x-auth-key": "KEY",
    "x-jfs-tenant-id": "tenant",
    "x-jfs-outlet-id": "outlet",
    "x-jfs-outlet-code": "SUM001A",
    "x-jfs-account": "hidden",
    "x-jfs-password": "hidden"
  });
  const res = responseRecorder();
  await invokeRoute(router, "/scoped/test-connection", req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.connected, true);
});

test("scoped reconnect emits one sanitized classified log and response", async () => {
  const failure = Object.assign(new Error("raw upstream detail must not escape"), {
    code: "JFS_LOGIN_FAILED",
    status: 502,
    token: "SECRET_TOKEN"
  });
  const context = {
    authManager: {
      setCredentials() {},
      async reconnect() { throw failure; }
    }
  };
  const registry = { get: () => context };
  const router = createInternalMultiOutletRouter({ getAuthKey: () => "KEY", registry });
  const req = routeRequest({
    "x-auth-key": "KEY",
    "x-jfs-tenant-id": "tenant",
    "x-jfs-outlet-id": "outlet",
    "x-jfs-outlet-code": "SUM001A",
    "x-jfs-account": "ACCOUNT_MUST_NOT_LOG",
    "x-jfs-password": "PASSWORD_MUST_NOT_LOG"
  });
  const res = responseRecorder();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await invokeRoute(router, "/scoped/reconnect", req, res);
  } finally {
    console.error = originalError;
  }

  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "[JFS][SCOPED_RECONNECT] failed");
  assert.deepEqual(logs[0][1], {
    errorType: "Error",
    errorCode: "JFS_LOGIN_FAILED",
    stage: "SCOPED_AUTH",
    upstreamStatus: 502
  });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    success: false,
    error: "JFS_SCOPED_RECONNECT_FAILED",
    message: "Scoped JFS reconnect failed."
  });
  const serialized = JSON.stringify({ logs, response: res.body });
  for (const forbidden of ["ACCOUNT_MUST_NOT_LOG", "PASSWORD_MUST_NOT_LOG", "SECRET_TOKEN", "raw upstream detail"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
});

test("scoped connection test emits one sanitized classified log and response", async () => {
  const failure = Object.assign(new Error("private upstream failure"), {
    code: "JFS_LOGIN_FAILED",
    response: { status: 503, data: { token: "SECRET_TOKEN" } }
  });
  const context = {
    authManager: {
      setCredentials() {},
      async testConnection() { throw failure; }
    }
  };
  const router = createInternalMultiOutletRouter({
    getAuthKey: () => "KEY",
    registry: { get: () => context }
  });
  const req = routeRequest({
    "x-auth-key": "KEY",
    "x-jfs-tenant-id": "tenant",
    "x-jfs-outlet-id": "outlet",
    "x-jfs-outlet-code": "SUM001A",
    "x-jfs-account": "ACCOUNT_MUST_NOT_LOG",
    "x-jfs-password": "PASSWORD_MUST_NOT_LOG"
  });
  const res = responseRecorder();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await invokeRoute(router, "/scoped/test-connection", req, res);
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(logs, [["[JFS][SCOPED_TEST_CONNECTION] failed", {
    errorType: "Error",
    errorCode: "JFS_LOGIN_FAILED",
    stage: "SCOPED_AUTH",
    upstreamStatus: 503
  }]]);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    success: false,
    error: "JFS_SCOPED_TEST_FAILED",
    message: "Scoped JFS connection test failed."
  });
  assert.doesNotMatch(
    JSON.stringify({ logs, response: res.body }),
    /ACCOUNT_MUST_NOT_LOG|PASSWORD_MUST_NOT_LOG|SECRET_TOKEN|private upstream failure/
  );
});
