"use strict";

const express = require("express");
const {
  createAgingSignController,
  createInventoryDetailController,
  createIbkReportController,
  createJfsAuthController,
  createSenderDetailController,
  createSensitiveController,
  createWaybillStatusController
} = require("../controllers");
const {
  createAgingSignService,
  createInventoryDetailService,
  createIbkReportService,
  createSenderDetailService,
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
const { createJfsAuthRoutes } = require("./jfs-auth.routes");
const { createOrderSchedulingRoutes } = require("./order-scheduling.routes");
const { createOrderSchedulingController } = require("../controllers/order-scheduling.controller");
const { createOrderSchedulingService } = require("../services/order-scheduling.service");
const { createIbkReportRoutes } = require("./ibk-report.routes");
const { createSenderDetailRoutes } = require("./sender-detail.routes");

function createModularRoutes({ getAuthToken, authManager } = {}) {
  const router = express.Router();
  const refreshAuth = authManager
    ? () => authManager.refreshLogin()
    : undefined;
  const agingSignService = createAgingSignService({
    getAuthToken,
    refreshAuth
  });
  const inventoryDetailService = createInventoryDetailService({
    getAuthToken,
    refreshAuth
  });
  const ibkReportService = createIbkReportService({
    getAuthToken,
    refreshAuth
  });
  const sensitiveService = createSensitiveService({
    getAuthToken,
    refreshAuth
  });
  const senderDetailService = createSenderDetailService({
    getAuthToken,
    refreshAuth
  });
  const waybillStatusService = createWaybillStatusService({
    getAuthToken,
    refreshAuth
  });
  const orderSchedulingService = createOrderSchedulingService({ getAuthToken });
  const orderSchedulingController = createOrderSchedulingController({
    service: orderSchedulingService
  });
  const agingSignController = createAgingSignController({
    agingSignService
  });
  const sensitiveController = createSensitiveController({
    sensitiveService
  });
  const senderDetailController = createSenderDetailController({
    senderDetailService
  });
  const inventoryDetailController = createInventoryDetailController({
    inventoryDetailService
  });
  const ibkReportController = createIbkReportController({
    ibkReportService
  });
  const waybillStatusController = createWaybillStatusController({
    waybillStatusService
  });

  if (authManager) {
    const jfsAuthController = createJfsAuthController({ authManager });
    router.use(createJfsAuthRoutes({
      login: jfsAuthController.login
    }));
  }
  router.use(createWaybillStatusRoutes({
    getWaybillStatusBatch: waybillStatusController.getWaybillStatusBatch
  }));
  router.use(createAgingSignRoutes({
    getAgingSign: agingSignController.getAgingSign
  }));
  router.use(createSensitiveRoutes({
    getSensitiveDetail: sensitiveController.getSensitiveDetail
  }));
  router.use(createSenderDetailRoutes({
    getSenderDetail: senderDetailController.getSenderDetail
  }));
  router.use(createInventoryDetailRoutes({
    getInventoryDetail: inventoryDetailController.getInventoryDetail
  }));
  router.use(createIbkReportRoutes({
    getIbkReport: ibkReportController.getIbkReport
  }));
  router.use(createOrderSchedulingRoutes(orderSchedulingController));

  return router;
}

module.exports = {
  createModularRoutes
};
