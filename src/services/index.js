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
const {
  createIbkReportService
} = require("./ibk-report.service");
const {
  createSenderDetailService
} = require("./sender-detail.service");

module.exports = {
  createAgingSignService,
  createIbkReportService,
  createInventoryDetailService,
  createSenderDetailService,
  createSensitiveService,
  createWaybillStatusService
};
