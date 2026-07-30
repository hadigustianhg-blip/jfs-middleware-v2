"use strict";

const express = require("express");

function createOrderSchedulingRoutes(controller) {
  const router = express.Router();
  router.get("/jfs-order-list-sync", controller.list);
  router.get("/jfs-order-detail", controller.detail);
  return router;
}

module.exports = { createOrderSchedulingRoutes };
