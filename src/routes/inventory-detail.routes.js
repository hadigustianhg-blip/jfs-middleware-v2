"use strict";

const express = require("express");

function createInventoryDetailRoutes({ getInventoryDetail }) {
  const router = express.Router();
  router.get("/jfs-inventory-detail", getInventoryDetail);
  return router;
}

module.exports = {
  createInventoryDetailRoutes
};
