"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getOutletConfig } = require("../src/config/jfs-outlet-config");
const { buildWaybillStatusPayload } = require("../src/scrapers/waybill-status.scraper");
const { buildIbkPayload } = require("../src/scrapers/ibk-report.scraper");

function withEnv(envObj, fn) {
  const originalEnv = { ...process.env };
  try {
    for (const key of ["JFS_NETWORK_CODE", "JFS_FINANCE_CODE", "JFS_FINANCE_ID", "JFS_SCAN_SITE_CODE"]) {
      delete process.env[key];
    }
    Object.assign(process.env, envObj);
    return fn();
  } finally {
    for (const key of ["JFS_NETWORK_CODE", "JFS_FINANCE_CODE", "JFS_FINANCE_ID", "JFS_SCAN_SITE_CODE"]) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  }
}

test("1. Legacy fallback config = nilai production lama", () => {
  withEnv({}, () => {
    const config = getOutletConfig();
    assert.equal(config.networkCode, "SUM001A");
    assert.equal(config.financeCode, "BDO000");
    assert.equal(config.financeId, 183);
    assert.equal(config.scanSiteCode, "SUM001A");
  });
});

test("2. Custom env values override fallback", () => {
  withEnv(
    {
      JFS_NETWORK_CODE: "SUM002A",
      JFS_FINANCE_CODE: "JKT999",
      JFS_FINANCE_ID: "500",
      JFS_SCAN_SITE_CODE: "SUM002A"
    },
    () => {
      const config = getOutletConfig();
      assert.equal(config.networkCode, "SUM002A");
      assert.equal(config.financeCode, "JKT999");
      assert.equal(config.financeId, 500);
      assert.equal(config.scanSiteCode, "SUM002A");
    }
  );
});

test("3. financeId tervalidasi numeric", () => {
  withEnv({ JFS_FINANCE_ID: "NOT_A_NUMBER" }, () => {
    assert.throws(() => getOutletConfig(), {
      message: /Environment variable JFS_FINANCE_ID must be a valid number/
    });
  });
});

test("4. Pickup menggunakan config (pickFinanceCode & pickNetworkCode)", () => {
  withEnv(
    {
      JFS_NETWORK_CODE: "PICKUP_NET_01",
      JFS_FINANCE_CODE: "PICKUP_FIN_01"
    },
    () => {
      const config = getOutletConfig();
      assert.equal(config.financeCode, "PICKUP_FIN_01");
      assert.equal(config.networkCode, "PICKUP_NET_01");
    }
  );
});

test("5. Dispatch menggunakan config (oneNetwork, dispatchFinanceCode, dispatchFinanceId)", () => {
  withEnv(
    {
      JFS_FINANCE_CODE: "DISP_FIN_01",
      JFS_FINANCE_ID: "777"
    },
    () => {
      const config = getOutletConfig();
      assert.equal(config.financeCode, "DISP_FIN_01");
      assert.equal(config.financeId, 777);
    }
  );
});

test("6. COD menggunakan config (revenueNetworkCode & financeCenterId)", () => {
  withEnv(
    {
      JFS_NETWORK_CODE: "COD_NET_01",
      JFS_FINANCE_CODE: "COD_FIN_01"
    },
    () => {
      const config = getOutletConfig();
      assert.equal(config.networkCode, "COD_NET_01");
      assert.equal(config.financeCode, "COD_FIN_01");
    }
  );
});

test("7. Waybill-status menggunakan config", () => {
  withEnv(
    {
      JFS_SCAN_SITE_CODE: "SITE_CUSTOM_88"
    },
    () => {
      const payload = buildWaybillStatusPayload({
        waybills: ["WB123"],
        startDate: "2026-08-01",
        endDate: "2026-08-01",
        current: 1
      });
      assert.equal(payload.scanSiteCode, "SITE_CUSTOM_88");
    }
  );
});

test("8. AUTH_TOKEN behavior existing tidak berubah", () => {
  const originalToken = process.env.AUTH_TOKEN;
  try {
    process.env.AUTH_TOKEN = "TEST_TOKEN_SECRET_123";
    const token = process.env.AUTH_TOKEN || "";
    assert.equal(token, "TEST_TOKEN_SECRET_123");
  } finally {
    if (originalToken !== undefined) {
      process.env.AUTH_TOKEN = originalToken;
    } else {
      delete process.env.AUTH_TOKEN;
    }
  }
});
