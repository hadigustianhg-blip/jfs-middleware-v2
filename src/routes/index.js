"use strict";

const express = require("express");
const {
  createAgingSignController,
  createSensitiveController
} = require("../controllers");
const {
  createAgingSignService,
  createSensitiveService
} = require("../services");
const {
  createAgingSignRoutes
} = require("./aging-sign.routes");
const {
  createSensitiveRoutes
} = require("./sensitive.routes");

function createModularRoutes({ getAuthToken } = {}) {
  const router = express.Router();
  const agingSignService = createAgingSignService({ getAuthToken });
  const sensitiveService = createSensitiveService({ getAuthToken });
  const agingSignController = createAgingSignController({
    agingSignService
  });
  const sensitiveController = createSensitiveController({
    sensitiveService
  });

  router.use(createAgingSignRoutes({
    getAgingSign: agingSignController.getAgingSign
  }));
  router.use(createSensitiveRoutes({
    getSensitiveDetail: sensitiveController.getSensitiveDetail
  }));

  return router;
}

module.exports = {
  createModularRoutes
};
