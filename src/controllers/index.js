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

module.exports = {
  createAgingSignController,
  createInventoryDetailController,
  createJfsAuthController,
  createSensitiveController,
  createWaybillStatusController
};
