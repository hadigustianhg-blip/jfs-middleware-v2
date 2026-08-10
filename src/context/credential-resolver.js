"use strict";

const logger = require("../utils/logger");

class CredentialResolverError extends Error {
  constructor(message, code = "INVALID_CREDENTIAL_REFERENCE", status = 400) {
    super(message);
    this.name = "CredentialResolverError";
    this.code = code;
    this.status = status;
  }
}

const CREDENTIAL_REF_REGEX = /^[A-Z0-9_-]+$/i;
const ENV_PREFIX = "JFS_CONTEXT_TOKEN_";

/**
 * Resolves context secret token from environment variables using controlled prefix.
 * Strictly rejects arbitrary env variable names and enforces controlled prefix matching.
 */
function resolveContextCredential(credentialRef, env = process.env) {
  if (!credentialRef || typeof credentialRef !== "string" || !credentialRef.trim()) {
    throw new CredentialResolverError(
      "credentialRef is required in context definition",
      "MISSING_CREDENTIAL_REFERENCE",
      400
    );
  }

  const sanitizedRef = credentialRef.trim().toUpperCase();

  if (!CREDENTIAL_REF_REGEX.test(sanitizedRef)) {
    throw new CredentialResolverError(
      "credentialRef contains invalid characters (allowed: alphanumeric, underscore, hyphen)",
      "INVALID_CREDENTIAL_REFERENCE",
      400
    );
  }

  const envKey = `${ENV_PREFIX}${sanitizedRef}`;
  const token = env[envKey];

  if (!token || typeof token !== "string" || !token.trim()) {
    logger.error("Failed to resolve secret token for credentialRef", {
      operation: "CREDENTIAL_RESOLUTION",
      credentialRef: sanitizedRef
    });
    throw new CredentialResolverError(
      `Secret token for credentialRef "${sanitizedRef}" is not configured in environment`,
      "MISSING_CONTEXT_CREDENTIAL",
      500
    );
  }

  return token.trim();
}

module.exports = {
  resolveContextCredential,
  CredentialResolverError,
  ENV_PREFIX
};
