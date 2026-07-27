"use strict";

const express = require("express");

function createAbnormalPieceRoutes({ getAbnormalPieceBatch }) {
  const router = express.Router();
  router.post("/jfs-abnormal-piece-batch", getAbnormalPieceBatch);
  return router;
}

module.exports = {
  createAbnormalPieceRoutes
};
