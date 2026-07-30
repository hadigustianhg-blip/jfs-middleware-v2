"use strict";

const {
  createAgingSignController
} = require("./aging-sign.controller");
const {
  createSensitiveController
} = require("./sensitive.controller");
const {
  createInventoryDetailController
} = require("./inventory-detail.controller");
const {
  createJfsAuthController
} = require("./jfs-auth.controller");
const {
  createWaybillStatusController
} = require("./waybill-status.controller");
const {
  createIbkReportController
} = require("./ibk-report.controller");

module.exports = {
  createAgingSignController,
  createIbkReportController,
  createInventoryDetailController,
  createJfsAuthController,
  createSensitiveController,
  createWaybillStatusController
};
