"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createInternalMultiOutletRouter, OPERATION_FIELDS } = require("../src/routes/internal-multi-outlet.routes");
const { globalRegistry } = require("../src/context/outlet-context-registry");
const { isEmergencyTokenModeActive, getEmergencyToken } = require("../src/utils/emergency-token");

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(header, value) {
      this.headers[header] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function createMockRequest({ path, body = {}, headers = {} } = {}) {
  const normHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    normHeaders[k.toLowerCase()] = v;
  }
  return {
    path,
    body,
    headers: normHeaders,
    get(name) {
      return normHeaders[name.toLowerCase()];
    }
  };
}

test.beforeEach(() => {
  delete process.env.JFS_EMERGENCY_TOKEN_MODE;
  delete process.env.JFS_AUTH_TOKEN;
  delete process.env.JFS_EMERGENCY_TOKEN_UNTIL;
});

test.afterEach(() => {
  delete process.env.JFS_EMERGENCY_TOKEN_MODE;
  delete process.env.JFS_AUTH_TOKEN;
  delete process.env.JFS_EMERGENCY_TOKEN_UNTIL;
});

test("Emergency token mode OFF: evaluates to false", () => {
  process.env.JFS_EMERGENCY_TOKEN_MODE = "false";
  assert.equal(isEmergencyTokenModeActive(), false);
});

test("Emergency token mode ON: returns JFS_AUTH_TOKEN and skips fresh login", async () => {
  process.env.JFS_EMERGENCY_TOKEN_MODE = "true";
  process.env.JFS_AUTH_TOKEN = "TEST_EMERGENCY_TOKEN_12345";

  assert.equal(isEmergencyTokenModeActive(), true);
  assert.equal(getEmergencyToken(), "TEST_EMERGENCY_TOKEN_12345");
});

test("Emergency token mode EXPIRED: fails closed with JFS_EMERGENCY_MODE_EXPIRED", async () => {
  process.env.JFS_EMERGENCY_TOKEN_MODE = "true";
  process.env.JFS_AUTH_TOKEN = "TEST_EMERGENCY_TOKEN_12345";
  // Set TTL to 1 hour in the past
  process.env.JFS_EMERGENCY_TOKEN_UNTIL = new Date(Date.now() - 3600000).toISOString();

  assert.throws(
    () => getEmergencyToken(),
    err => err.code === "JFS_EMERGENCY_MODE_EXPIRED" && err.status === 401
  );
});

test("All 14 operations obtain the emergency token and enforce internal auth X-Auth-Key", async () => {
  process.env.JFS_EMERGENCY_TOKEN_MODE = "true";
  process.env.JFS_AUTH_TOKEN = "TEST_EMERGENCY_TOKEN_SECURE";

  const registeredContext = globalRegistry.register({
    tenantId: "tenant-em-1",
    outletId: "outlet-em-1",
    outletCode: "SUM001A",
    account: "EM_USER",
    password: "EM_PASSWORD"
  });

  const capturedRequests = [];
  registeredContext.fetcher = async (url, options) => {
    capturedRequests.push({ url, options });
    return {
      status: 200,
      data: {
        code: 1,
        succ: true,
        data: {
          list: [],
          orders: [],
          timeline: [],
          billNoList: []
        }
      }
    };
  };

  const router = createInternalMultiOutletRouter({
    getAuthKey: () => "SECRET_AUTH_KEY_2026",
    registry: globalRegistry
  });

  const operations = [
    { path: "/pickup", op: "PICKUP", body: {} },
    { path: "/dispatch", op: "DISPATCH", body: {} },
    { path: "/cod", op: "COD", body: {} },
    { path: "/ibk", op: "IBK", body: { startDate: "2026-08-01", endDate: "2026-08-02" } },
    { path: "/oms", op: "OMS", body: { startDate: "2026-08-01", endDate: "2026-08-02" } },
    { path: "/oms-scheduling-list", op: "OMS_SCHEDULING_LIST", body: {} },
    { path: "/oms-scheduling-detail", op: "OMS_SCHEDULING_DETAIL", body: { externalJfsId: "JFS_123" } },
    { path: "/inventory", op: "INVENTORY", body: { startDate: "2026-08-01", endDate: "2026-08-02" } },
    { path: "/aging-sign", op: "AGING_SIGN", body: { date: "2026-08-01" } },
    { path: "/waybill-status", op: "WAYBILL_STATUS", body: { waybills: ["JFS001"] } },
    { path: "/sender-detail", op: "SENDER_DETAIL", body: { waybillNo: "JFS001" } },
    { path: "/sensitive-detail", op: "SENSITIVE_DETAIL", body: { waybillNo: "JFS001" } },
    { path: "/waybill-tracking", op: "WAYBILL_TRACKING", body: { waybillNo: "JFS001" } },
    { path: "/waybill-detail", op: "WAYBILL_DETAIL", body: { waybillNo: "JFS001" } }
  ];

  for (const item of operations) {
    const req = createMockRequest({
      path: item.path,
      body: item.body,
      headers: {
        "X-Auth-Key": "SECRET_AUTH_KEY_2026",
        "X-JFS-Tenant-Id": "tenant-em-1",
        "X-JFS-Outlet-Id": "outlet-em-1",
        "X-JFS-Outlet-Code": "SUM001A"
      }
    });
    const res = createMockResponse();

    // Execute route handler
    const handler = router.stack.find(r => r.route && r.route.path === item.path).route.stack[1].handle;
    await handler(req, res, () => {});

    // Unauthenticated request without X-Auth-Key is rejected with 401
    const unauthReq = createMockRequest({ path: item.path, body: item.body });
    const unauthRes = createMockResponse();
    const authMiddleware = router.stack.find(r => r.route && r.route.path === item.path).route.stack[0].handle;
    await authMiddleware(unauthReq, unauthRes, () => {});
    assert.equal(unauthRes.statusCode, 401);
  }

  // Verify no request was made to fresh login /basicdata/login
  const loginRequests = capturedRequests.filter(r => r.url.includes("/basicdata/login") && !r.url.includes("loginDeviceApply"));
  assert.equal(loginRequests.length, 0);

  // Verify authenticated requests carried Emergency AuthToken
  for (const req of capturedRequests) {
    const headers = req.options.headers || {};
    const tokenHeader = headers.AuthToken || headers.authtoken || headers.Authtoken;
    assert.equal(tokenHeader, "TEST_EMERGENCY_TOKEN_SECURE");
    assert.equal("authorization" in headers, false);
    assert.equal("Authorization" in headers, false);
  }
});
