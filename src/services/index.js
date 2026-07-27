"use strict";

const {
  createAgingSignService
} = require("./aging-sign.service");
const {
  createSensitiveService
} = require("./sensitive.service");
const {
  createInventoryDetailService
} = require("./inventory-detail.service");
const {
  createWaybillStatusService
} = require("./waybill-status.service");

module.exports = {
  createAgingSignService,
  createInventoryDetailService,
  createSensitiveService,
  createWaybillStatusService
};
