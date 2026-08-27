"use strict";

const crypto = require("node:crypto");

function safeKeyMatches(receivedKey, expectedKey) {
  if (!expectedKey || typeof expectedKey !== "string" || expectedKey.trim() === "") return false;
  if (typeof receivedKey !== "string" || receivedKey.trim() === "") return false;

  const recTrim = receivedKey.trim();
  const expTrim = expectedKey.trim();
  const received = Buffer.from(recTrim);
  const expected = Buffer.from(expTrim);
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
      } catch {
        return res.status(401).json({
          success: false,
          error: "JFS_LOGIN_FAILED"
        });
      }
    }
  };
}

module.exports = {
  createJfsAuthController,
  safeKeyMatches
};
