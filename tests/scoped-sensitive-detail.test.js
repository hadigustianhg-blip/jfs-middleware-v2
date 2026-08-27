"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OPERATION_FIELDS,
  createInternalMultiOutletRouter,
  validateOperationOptions
} = require("../src/routes/internal-multi-outlet.routes");
const { executeMultiOutletScraper } = require("../src/services/jfs-multi-outlet-scrapers.service");

const WAYBILL_NO = "570570803375";

function scopedContext(token = "SCOPED_TOKEN") {
  const state = { token, clears: 0, refreshes: 0 };
  return {
    state,
    outletCode: "OUTLET-A",
    config: { networkCode: "NETWORK-A" },
    authManager: {
      async getAuthToken() { return state.token; },
      clearToken() { state.clears += 1; },
      async refreshLogin() {
        state.refreshes += 1;
        state.token = "REFRESHED_SCOPED_TOKEN";
        return state.token;
      }
    }
  };
}

test("registers only the scoped sensitive-detail operation contract", () => {
  assert.deepEqual(OPERATION_FIELDS.SENSITIVE_DETAIL, ["waybillNo"]);
  assert.doesNotThrow(() => validateOperationOptions("SENSITIVE_DETAIL", { waybillNo: WAYBILL_NO }));
  for (const field of ["tenantId", "outletId", "networkCode", "authToken", "cookie", "password"]) {
    assert.throws(
      () => validateOperationOptions("SENSITIVE_DETAIL", { waybillNo: WAYBILL_NO, [field]: "forbidden" }),
      error => error.code === "FORBIDDEN_RUNTIME_OPTION" && error.field === field
    );
  }
});

test("scoped sensitive-detail route requires trusted tenant/outlet context", async () => {
  const router = createInternalMultiOutletRouter({ getAuthKey: () => "EXPECTED_KEY" });
  const layer = router.stack.find(item => item.route?.path === "/sensitive-detail");
  assert.ok(layer);
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack.length, 2);
  const result = {};
  await layer.route.stack[0].handle(
    { headers: {}, get() { return undefined; } },
    {
      status(code) { result.status = code; return this; },
      json(body) { result.body = body; return this; }
    },
    () => { result.next = true; }
  );
  assert.equal(result.status, 401);
  assert.equal(result.body.error, "UNAUTHORIZED");
  assert.equal(result.next, undefined);
});

test("sensitive detail uses its scoped token and preserves the existing result contract", async () => {
  const context = scopedContext();
  let received;
  const result = await executeMultiOutletScraper(
    context,
    "SENSITIVE_DETAIL",
    { waybillNo: WAYBILL_NO },
    {
      requestFn: async options => {
        received = options;
        return {
          status: 200,
          headers: {},
          data: {
            code: 1,
            data: {
              waybillNo: WAYBILL_NO,
              receiverName: "Receiver Test",
              receiverMobilePhone: "08********90"
            }
          }
        };
      }
    }
  );
  assert.equal(received.headers.Authtoken, "SCOPED_TOKEN");
  assert.equal(result.data.waybillNo, WAYBILL_NO);
  assert.equal(result.data.receiverMobilePhone, "08********90");
  assert.equal(context.state.refreshes, 0);
});

test("sensitive auth failures fail closed after one scoped refresh", async () => {
  const context = scopedContext();
  const seen = [];
  await assert.rejects(() => executeMultiOutletScraper(
    context,
    "SENSITIVE_DETAIL",
    { waybillNo: WAYBILL_NO },
    {
      requestFn: async options => {
        seen.push(options.headers.Authtoken);
        return { status: 200, headers: {}, data: { code: 401 } };
      }
    }
  ));
  assert.deepEqual(seen, ["SCOPED_TOKEN", "REFRESHED_SCOPED_TOKEN"]);
  assert.equal(context.state.clears, 1);
  assert.equal(context.state.refreshes, 1);
});

test("scoped sensitive wiring has no global token, fallback, logging, or database path", () => {
  const files = [
    "src/routes/internal-multi-outlet.routes.js",
    "src/services/jfs-multi-outlet-scrapers.service.js"
  ];
  const source = files.map(file => fs.readFileSync(path.join(__dirname, "..", file), "utf8")).join("\n");
  const scopedCase = source.match(/case "SENSITIVE_DETAIL"[\s\S]*?case "WAYBILL_TRACKING"/)?.[0] || "";
  assert.match(scopedCase, /executeWithScopedAuth/);
  assert.match(scopedCase, /scopedRequestFn/);
  assert.doesNotMatch(scopedCase, /AUTH_TOKEN|fallbackToMock|mockData|console\.|logger\.|prisma|database/i);
});
