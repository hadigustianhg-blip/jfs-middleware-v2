"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAgingSignRoutes
} = require("../src/routes/aging-sign.routes");
const {
  createSensitiveRoutes
} = require("../src/routes/sensitive.routes");
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
  const agingRouter = createAgingSignRoutes({
    getAgingSign: agingHandler
  });
  const sensitiveRouter = createSensitiveRoutes({
    getSensitiveDetail: sensitiveHandler
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
});

test("modular router has no prefixes or duplicate endpoints", () => {
  const router = createModularRoutes({
    getAuthToken: () => "TEST_TOKEN"
  });
  const routes = routeSummary(router);

  assert.deepEqual(routes, [
    { path: "/jfs-aging-sign", methods: ["get"] },
    { path: "/jfs-sensitive", methods: ["get"] }
  ]);
  assert.equal(
    new Set(routes.map(route => `${route.methods[0]} ${route.path}`)).size,
    routes.length
  );
});
