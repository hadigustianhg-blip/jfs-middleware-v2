"use strict";

const express = require("express");
const {
  createAgingSignController,
  createInventoryDetailController,
  createSensitiveController,
  createWaybillStatusController
} = require("../controllers");
const {
  createAgingSignService,
  createInventoryDetailService,
  createSensitiveService,
  createWaybillStatusService
} = require("../services");
const {
  createAgingSignRoutes
} = require("./aging-sign.routes");
const {
  createSensitiveRoutes
} = require("./sensitive.routes");
const {
  createInventoryDetailRoutes
} = require("./inventory-detail.routes");
const { createWaybillStatusRoutes } = require("./waybill-status.routes");

function createModularRoutes({ getAuthToken } = {}) {
  const router = express.Router();
  const agingSignService = createAgingSignService({ getAuthToken });
  const inventoryDetailService = createInventoryDetailService({ getAuthToken });
  const sensitiveService = createSensitiveService({ getAuthToken });
  const waybillStatusService = createWaybillStatusService({ getAuthToken });
  const agingSignController = createAgingSignController({
    agingSignService
  });
  const sensitiveController = createSensitiveController({
    sensitiveService
  });
  const inventoryDetailController = createInventoryDetailController({
    inventoryDetailService
  });
  const waybillStatusController = createWaybillStatusController({
    waybillStatusService
  });

  router.use(createWaybillStatusRoutes({
    getWaybillStatusBatch: waybillStatusController.getWaybillStatusBatch
  }));
  router.use(createAgingSignRoutes({
    getAgingSign: agingSignController.getAgingSign
  }));
  router.use(createSensitiveRoutes({
    getSensitiveDetail: sensitiveController.getSensitiveDetail
  }));
  router.use(createInventoryDetailRoutes({
    getInventoryDetail: inventoryDetailController.getInventoryDetail
  }));

  return router;
}

module.exports = {
  createModularRoutes
};
