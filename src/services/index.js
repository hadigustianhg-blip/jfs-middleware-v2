"use strict";

const {
  createAbnormalPieceService
} = require("./abnormal-piece.service");
const {
  createAgingSignService
} = require("./aging-sign.service");
const {
  createSensitiveService
} = require("./sensitive.service");
const {
  createInventoryDetailService
} = require("./inventory-detail.service");

module.exports = {
  createAbnormalPieceService,
  createAgingSignService,
  createInventoryDetailService,
  createSensitiveService
};
