"use strict";

const {
  createAgingSignService
} = require("./aging-sign.service");
const {
  createSensitiveService
} = require("./sensitive.service");

module.exports = {
  createAgingSignService,
  createSensitiveService
};
