"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createJfsOutletContext, stableDeviceNo } = require("../src/context/jfs-outlet-context");
const axios = require("axios");
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

test("stable device identity is deterministic per scope and distinct across outlets", () => {
  assert.equal(stableDeviceNo("tenant-a", "outlet-a"), stableDeviceNo("tenant-a", "outlet-a"));
  assert.notEqual(stableDeviceNo("tenant-a", "outlet-a"), stableDeviceNo("tenant-a", "outlet-b"));
  const first = createJfsOutletContext({ tenantId: "tenant-a", outletId: "outlet-a", outletCode: "A" });
  const recreated = createJfsOutletContext({ tenantId: "tenant-a", outletId: "outlet-a", outletCode: "A" });
  assert.equal(first.deviceNo, recreated.deviceNo);
});

test("scoped context owns an axios client with no global response interceptors", () => {
  const context = createJfsOutletContext({ tenantId: "tenant-a", outletId: "outlet-a", outletCode: "A" });
  assert.notEqual(context.axiosClient, axios);
  assert.equal(context.axiosClient.interceptors.response.handlers.filter(Boolean).length, 0);
});

test("scoped reconnect refreshes only its context and preserves global AUTH_TOKEN", async () => {
  const original = process.env.AUTH_TOKEN;
  process.env.AUTH_TOKEN = "GLOBAL_UNCHANGED";
  let callsA = 0;
  let callsB = 0;
  const makeFetcher = counter => async () => {
    counter();
    return { status: 200, data: { code: 1, data: { token: "SCOPED", networkCode: "NET" } } };
  };
  const a = createJfsOutletContext({ tenantId: "t", outletId: "a", outletCode: "A", account: "a", password: "p", fetcher: makeFetcher(() => { callsA += 1; }) });
  createJfsOutletContext({ tenantId: "t", outletId: "b", outletCode: "B", account: "b", password: "p", fetcher: makeFetcher(() => { callsB += 1; }) });
  assert.equal((await a.authManager.reconnect()).connected, true);
  assert.equal(callsA, 1);
  assert.equal(callsB, 0);
  assert.equal(process.env.AUTH_TOKEN, "GLOBAL_UNCHANGED");
  if (original === undefined) delete process.env.AUTH_TOKEN; else process.env.AUTH_TOKEN = original;
});

test("scoped reconnect delegates login contract to the shared auth engine", async () => {
  let loginRequest;
  const context = createJfsOutletContext({
    tenantId: "tenant-shared",
    outletId: "outlet-shared",
    outletCode: "SUM001A",
    account: "ACCOUNT",
    password: "PASSWORD",
    fetcher: async (url, options) => {
      loginRequest = { url, options };
      return {
        status: 200,
        data: {
          code: 1,
          succ: true,
          fail: false,
          data: { token: "SHARED_TOKEN", networkCode: "SUM001A", name: "Shared Network" }
        }
      };
    }
  });

  const reconnect = await context.authManager.reconnect();
  assert.equal(reconnect.connected, true);
  assert.equal(reconnect.networkCode, "SUM001A");
  assert.equal(reconnect.name, "Shared Network");
  assert.equal((await context.authManager.testConnection()).connected, true);
  assert.equal(context.getState().hasToken, true);
  assert.equal(loginRequest.options.data.deviceNo, context.deviceNo);
  assert.equal(loginRequest.options.headers["User-Agent"], "Mozilla/5.0");
});

test("new scoped credentials invalidate an in-flight login and win the reconnect", async () => {
  let releaseOld;
  const oldPending = new Promise(resolve => { releaseOld = resolve; });
  const requests = [];
  const context = createJfsOutletContext({
    tenantId: "tenant-refresh",
    outletId: "outlet-refresh",
    outletCode: "SUM001A",
    account: "OLD_ACCOUNT",
    password: "OLD_PASSWORD",
    fetcher: async (_url, options) => {
      requests.push(options.data.account);
      if (options.data.account === "OLD_ACCOUNT") {
        await oldPending;
        return { status: 200, data: { data: { token: "OLD_TOKEN" } } };
      }
      return { status: 200, data: { data: { token: "NEW_TOKEN", networkCode: "SUM001A" } } };
    }
  });

  const staleLogin = context.authManager.getAuthToken();
  context.authManager.setCredentials("NEW_ACCOUNT", "NEW_PASSWORD");
  const reconnect = await context.authManager.reconnect();
  releaseOld();
  await assert.rejects(staleLogin, error => error.code === "JFS_STALE_CREDENTIAL_LOGIN");

  assert.equal(reconnect.connected, true);
  assert.deepEqual(requests, ["OLD_ACCOUNT", "NEW_ACCOUNT"]);
  assert.equal(await context.authManager.getAuthToken(), "NEW_TOKEN");
});

test("JfsOutletContext contains no duplicate HTTP login implementation", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/context/jfs-outlet-context.js"), "utf8");
  assert.match(source, /performJfsLogin/);
  assert.doesNotMatch(source, /basicdata\/login|createHash\("md5"\)|Routename:\s*"login"|User-Agent/);
});

test("shared login failures stay classified and fail closed", async () => {
  const context = createJfsOutletContext({
    tenantId: "tenant-failure",
    outletId: "outlet-failure",
    outletCode: "SUM001A",
    account: "ACCOUNT",
    password: "PASSWORD",
    fetcher: async () => ({ status: 200, data: { code: 405, data: {} } })
  });
  await assert.rejects(
    context.authManager.reconnect(),
    error => error.code === "JFS_LOGIN_FAILED" && error.message === "JFS login failed"
  );
  assert.equal(context.getState().hasToken, false);
  assert.equal(context.getState().lastFailure.message, "JFS login failed");
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

    await assert.rejects(
      ctx.authManager.getAuthToken(),
      error => error.code === "JFS_LOGIN_FAILED" && error.message === "JFS login failed"
    );
    assert.equal(ctx.getState().hasToken, false);
  });
}

test("scoped login rejects responses without the DEV login token path", async () => {
  for (const data of [null, {}, { data: { token: "" } }]) {
    const ctx = createJfsOutletContext({
      tenantId: "t-login",
      outletId: "o-malformed",
      outletCode: "DEV001",
      account: "TEST_ACCOUNT",
      password: "TEST_PASSWORD",
      fetcher: async () => ({ status: 200, data })
    });
    await assert.rejects(
      ctx.authManager.getAuthToken(),
      error => error.code === "JFS_LOGIN_FAILED" && error.message === "JFS login failed"
    );
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
  await assert.rejects(
    ctxB.authManager.getAuthToken(),
    error => error.code === "JFS_LOGIN_FAILED" && error.message === "JFS login failed"
  );
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
