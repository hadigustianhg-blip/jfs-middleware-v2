"use strict";

const express = require("express");
const {
  createAbnormalPieceController,
  createAgingSignController,
  createInventoryDetailController,
  createSensitiveController
} = require("../controllers");
const {
  createAbnormalPieceService,
  createAgingSignService,
  createInventoryDetailService,
  createSensitiveService
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
const {
  createAbnormalPieceRoutes
} = require("./abnormal-piece.routes");

function createModularRoutes({ getAuthToken } = {}) {
  const router = express.Router();
  const abnormalPieceService = createAbnormalPieceService({ getAuthToken });
  const agingSignService = createAgingSignService({ getAuthToken });
  const inventoryDetailService = createInventoryDetailService({ getAuthToken });
  const sensitiveService = createSensitiveService({ getAuthToken });
  const agingSignController = createAgingSignController({
    agingSignService
  });
  const sensitiveController = createSensitiveController({
    sensitiveService
  });
  const inventoryDetailController = createInventoryDetailController({
    inventoryDetailService
  });
  const abnormalPieceController = createAbnormalPieceController({
    abnormalPieceService
  });

  router.use(createAbnormalPieceRoutes({
    getAbnormalPieceBatch: abnormalPieceController.getAbnormalPieceBatch
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
