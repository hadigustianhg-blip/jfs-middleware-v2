"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJfsOutletContext } = require("../src/context/jfs-outlet-context");
const { OutletContextRegistry } = require("../src/context/outlet-context-registry");
const { trustedOutletContextMiddleware } = require("../src/middleware/trusted-outlet-context.middleware");

test("OutletContextRegistry registers and retrieves context by tenantId and outletId", () => {
  const registry = new OutletContextRegistry();
  const ctx = registry.register({
    tenantId: "t-1",
    outletId: "o-1",
    outletCode: "SUM001A",
    account: "ACC1",
    password: "PASS1"
  });

  assert.equal(registry.has("t-1", "o-1"), true);
  assert.equal(registry.get("t-1", "o-1"), ctx);
  assert.equal(ctx.tenantId, "t-1");
  assert.equal(ctx.outletCode, "SUM001A");
});

test("Single-flight refresh mutex in JfsOutletContext triggers exactly 1 upstream login on 20 concurrent calls", async () => {
  let loginCount = 0;
  const mockFetcher = async (url) => {
    if (url.includes("/basicdata/login")) {
      loginCount++;
      await new Promise((r) => setTimeout(r, 15));
      return {
        status: 200,
        data: { code: 0, data: { token: `TOKEN_LOGIN_${loginCount}` } }
      };
    }
    return { status: 200, data: { code: 0 } };
  };

  const ctx = createJfsOutletContext({
    tenantId: "t-1",
    outletId: "o-1",
    outletCode: "SUM001A",
    account: "USER1",
    password: "PWD1",
    fetcher: mockFetcher
  });

  // Call 20 concurrent getAuthToken()
  const tokens = await Promise.all(Array.from({ length: 20 }, () => ctx.authManager.getAuthToken()));

  assert.equal(loginCount, 1);
  assert.equal(tokens[0], "TOKEN_LOGIN_1");
  for (const token of tokens) {
    assert.equal(token, "TOKEN_LOGIN_1");
  }
});

for (const applicationCode of [0, 1]) {
  test(`scoped login accepts application code ${applicationCode} when a valid token is present`, async () => {
    const ctx = createJfsOutletContext({
      tenantId: "t-login",
      outletId: `o-code-${applicationCode}`,
      outletCode: "DEV001",
      account: "TEST_ACCOUNT",
      password: "TEST_PASSWORD",
      fetcher: async () => ({
        status: 200,
        data: { code: applicationCode, data: { token: `TOKEN_${applicationCode}`, networkCode: "TEST_NET" } }
      })
    });

    assert.equal(await ctx.authManager.getAuthToken(), `TOKEN_${applicationCode}`);
    assert.equal(ctx.getState().hasToken, true);
  });
}

for (const applicationCode of [1, 401, 405]) {
  test(`scoped login rejects application code ${applicationCode} when token is missing`, async () => {
    const ctx = createJfsOutletContext({
      tenantId: "t-login",
      outletId: `o-missing-${applicationCode}`,
      outletCode: "DEV001",
      account: "TEST_ACCOUNT",
      password: "TEST_PASSWORD",
      fetcher: async () => ({ status: 200, data: { code: applicationCode, data: {} } })
    });

    await assert.rejects(ctx.authManager.getAuthToken(), /JFS_LOGIN_FAILED/);
    assert.equal(ctx.getState().hasToken, false);
  });
}

test("scoped login rejects malformed and empty-token responses", async () => {
  for (const data of [null, {}, { data: { token: "" } }, { data: { token: "   " } }, { data: { token: {} } }]) {
    const ctx = createJfsOutletContext({
      tenantId: "t-login",
      outletId: "o-malformed",
      outletCode: "DEV001",
      account: "TEST_ACCOUNT",
      password: "TEST_PASSWORD",
      fetcher: async () => ({ status: 200, data })
    });
    await assert.rejects(ctx.authManager.getAuthToken(), /JFS_LOGIN_FAILED/);
    assert.equal(ctx.getState().hasToken, false);
  }
});

test("scoped login stores a token only in its own outlet context without global fallback", async () => {
  const originalGlobalToken = process.env.AUTH_TOKEN;
  process.env.AUTH_TOKEN = "GLOBAL_TOKEN_MUST_NOT_BE_USED";
  const ctxA = createJfsOutletContext({
    tenantId: "t-a", outletId: "o-a", outletCode: "DEV001",
    account: "ACCOUNT_A", password: "PASSWORD_A",
    fetcher: async () => ({ status: 200, data: { code: 1, data: { token: "TOKEN_A" } } })
  });
  const ctxB = createJfsOutletContext({
    tenantId: "t-b", outletId: "o-b", outletCode: "DEV002",
    account: "ACCOUNT_B", password: "PASSWORD_B",
    fetcher: async () => ({ status: 200, data: { code: 405, data: {} } })
  });

  assert.equal(await ctxA.authManager.getAuthToken(), "TOKEN_A");
  await assert.rejects(ctxB.authManager.getAuthToken(), /JFS_LOGIN_FAILED/);
  assert.equal(ctxA.getState().hasToken, true);
  assert.equal(ctxB.getState().hasToken, false);
  assert.notEqual(await ctxA.authManager.getAuthToken(), process.env.AUTH_TOKEN);

  if (originalGlobalToken === undefined) delete process.env.AUTH_TOKEN;
  else process.env.AUTH_TOKEN = originalGlobalToken;
});

test("Context A and Context B are completely isolated", async () => {
  let loginCountA = 0;
  let loginCountB = 0;

  const fetcherA = async (url) => {
    if (url.includes("/login")) {
      loginCountA++;
      return { status: 200, data: { code: 0, data: { token: "TOKEN_A" } } };
    }
    return { status: 200, data: { code: 0 } };
  };

  const fetcherB = async (url) => {
    if (url.includes("/login")) {
      loginCountB++;
      return { status: 200, data: { code: 0, data: { token: "TOKEN_B" } } };
    }
    return { status: 200, data: { code: 0 } };
  };

  const ctxA = createJfsOutletContext({
    tenantId: "t-a",
    outletId: "o-a",
    outletCode: "SUM001A",
    account: "USER_A",
    password: "PWD_A",
    fetcher: fetcherA
  });

  const ctxB = createJfsOutletContext({
    tenantId: "t-b",
    outletId: "o-b",
    outletCode: "SUM002A",
    account: "USER_B",
    password: "PWD_B",
    fetcher: fetcherB
  });

  const tokenA = await ctxA.authManager.getAuthToken();
  const tokenB = await ctxB.authManager.getAuthToken();

  assert.equal(tokenA, "TOKEN_A");
  assert.equal(tokenB, "TOKEN_B");
  assert.equal(loginCountA, 1);
  assert.equal(loginCountB, 1);
});

test("trustedOutletContextMiddleware rejects invalid X-Auth-Key", async () => {
  const middleware = trustedOutletContextMiddleware({ getAuthKey: () => "SECRET_KEY" });

  let statusCode = 0;
  let jsonBody = null;

  const req = {
    get(header) {
      if (header === "X-Auth-Key") return "WRONG_KEY";
      return null;
    }
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return this;
    }
  };

  await middleware(req, res, () => {});

  assert.equal(statusCode, 401);
  assert.equal(jsonBody.error, "UNAUTHORIZED");
});
