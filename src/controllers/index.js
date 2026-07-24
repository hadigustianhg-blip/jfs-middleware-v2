"use strict";

const {
  createAgingSignController
} = require("./aging-sign.controller");
const {
  createSensitiveController
} = require("./sensitive.controller");

module.exports = {
  createAgingSignController,
  createSensitiveController
};
