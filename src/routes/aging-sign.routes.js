"use strict";

const express = require("express");

function createAgingSignRoutes({ getAgingSign }) {
  const router = express.Router();
  router.get("/jfs-aging-sign", getAgingSign);
  return router;
}

module.exports = {
  createAgingSignRoutes
};
