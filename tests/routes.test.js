"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAgingSignRoutes
} = require("../src/routes/aging-sign.routes");
const {
  createSensitiveRoutes
} = require("../src/routes/sensitive.routes");
const {
  createInventoryDetailRoutes
} = require("../src/routes/inventory-detail.routes");
const {
  createWaybillStatusRoutes
} = require("../src/routes/waybill-status.routes");
const { createModularRoutes } = require("../src/routes");

function routeSummary(router) {
  return router.stack
    .flatMap(layer => {
      if (layer.route) {
        return [{
          path: layer.route.path,
          methods: Object.keys(layer.route.methods)
        }];
      }

      if (layer.handle?.stack) {
        return routeSummary(layer.handle);
      }

      return [];
    });
}

test("individual routes preserve paths, GET methods, and handlers", () => {
  const agingHandler = () => {};
  const sensitiveHandler = () => {};
  const inventoryDetailHandler = () => {};
  const waybillStatusHandler = () => {};
  const agingRouter = createAgingSignRoutes({
    getAgingSign: agingHandler
  });
  const sensitiveRouter = createSensitiveRoutes({
    getSensitiveDetail: sensitiveHandler
  });
  const inventoryDetailRouter = createInventoryDetailRoutes({
    getInventoryDetail: inventoryDetailHandler
  });
  const waybillStatusRouter = createWaybillStatusRoutes({
    getWaybillStatusBatch: waybillStatusHandler
  });

  assert.deepEqual(routeSummary(agingRouter), [{
    path: "/jfs-aging-sign",
    methods: ["get"]
  }]);
  assert.strictEqual(agingRouter.stack[0].route.stack[0].handle, agingHandler);

  assert.deepEqual(routeSummary(sensitiveRouter), [{
    path: "/jfs-sensitive",
    methods: ["get"]
  }]);
  assert.strictEqual(
    sensitiveRouter.stack[0].route.stack[0].handle,
    sensitiveHandler
  );
  assert.deepEqual(routeSummary(inventoryDetailRouter), [{
    path: "/jfs-inventory-detail",
    methods: ["get"]
  }]);
  assert.strictEqual(
    inventoryDetailRouter.stack[0].route.stack[0].handle,
    inventoryDetailHandler
  );
  assert.deepEqual(routeSummary(waybillStatusRouter), [{
    path: "/jfs-waybill-status-batch",
    methods: ["post"]
  }]);
  assert.strictEqual(
    waybillStatusRouter.stack[0].route.stack[0].handle,
    waybillStatusHandler
  );
});

test("modular router has no prefixes or duplicate endpoints", () => {
  const router = createModularRoutes({
    getAuthToken: () => "TEST_TOKEN"
  });
  const routes = routeSummary(router);

  assert.deepEqual(routes, [
    { path: "/jfs-waybill-status-batch", methods: ["post"] },
    { path: "/jfs-aging-sign", methods: ["get"] },
    { path: "/jfs-sensitive", methods: ["get"] },
    { path: "/jfs-inventory-detail", methods: ["get"] }
  ]);
  assert.equal(
    new Set(routes.map(route => `${route.methods[0]} ${route.path}`)).size,
    routes.length
  );
});

test("legacy and modular registrations together expose all twelve endpoints", () => {
  const serverSource = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8"
  );
  const legacyPaths = [...serverSource.matchAll(
    /app\.get\("([^"]+)"/g
  )].map(match => match[1]);
  const modularPaths = routeSummary(createModularRoutes({
    getAuthToken: () => "TEST_TOKEN"
  })).map(route => route.path);
  const paths = [...legacyPaths, ...modularPaths];

  assert.equal(paths.length, 12);
  assert.equal(new Set(paths).size, 12);
  assert.ok(paths.includes("/"));
  assert.ok(paths.includes("/set-token"));
  assert.equal(paths.filter(pathValue => pathValue === "/jfs-aging-sign").length, 1);
  assert.equal(paths.filter(pathValue => pathValue === "/jfs-sensitive").length, 1);
  assert.equal(
    paths.filter(pathValue => pathValue === "/jfs-inventory-detail").length,
    1
  );
  assert.equal(
    paths.filter(pathValue => pathValue === "/jfs-waybill-status-batch").length,
    1
  );
});
