"use strict";

const crypto = require("node:crypto");

function safeKeyMatches(receivedKey, expectedKey) {
  if (!expectedKey || expectedKey.trim() === "") return true;
  if (
    typeof receivedKey !== "string" ||
    typeof expectedKey !== "string" ||
    !expectedKey
  ) {
    return false;
  }

  const received = Buffer.from(receivedKey);
  const expected = Buffer.from(expectedKey);
  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected)
  );
}

function createJfsAuthController({
  authManager,
  getAuthKey = () => process.env.JFS_AUTH_KEY || process.env.JFS_MIDDLEWARE_AUTH_KEY || ""
}) {
  if (!authManager) {
    throw new TypeError("authManager is required");
  }

  return {
    async login(req, res) {
      if (!safeKeyMatches(req.get("X-Auth-Key"), getAuthKey())) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED"
        });
      }

      try {
        const result = await authManager.loginWithCredentials(
          req.body?.account,
          req.body?.password
        );
        return res.json({
          success: true,
          message: "Login JFS berhasil",
          networkCode: result.networkCode,
          name: result.name
        });
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: err?.message || "JFS_LOGIN_FAILED",
          code: err?.code || "JFS_LOGIN_FAILED"
        });
      }
    }
  };
}

module.exports = {
  createJfsAuthController,
  safeKeyMatches
};
