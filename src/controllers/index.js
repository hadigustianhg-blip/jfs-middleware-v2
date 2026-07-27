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

module.exports = {
  createAgingSignController,
  createInventoryDetailController,
  createSensitiveController
};
