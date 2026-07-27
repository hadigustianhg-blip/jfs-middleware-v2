"use strict";

const {
  createAbnormalPieceController
} = require("./abnormal-piece.controller");
const {
  createAgingSignController
} = require("./aging-sign.controller");
const {
  createSensitiveController
} = require("./sensitive.controller");
const {
  createInventoryDetailController
} = require("./inventory-detail.controller");

module.exports = {
  createAbnormalPieceController,
  createAgingSignController,
  createInventoryDetailController,
  createSensitiveController
};
