"use strict";

const express = require("express");

function createSensitiveRoutes({ getSensitiveDetail }) {
  const router = express.Router();
  router.get("/jfs-sensitive", getSensitiveDetail);
  return router;
}

module.exports = {
  createSensitiveRoutes
};
