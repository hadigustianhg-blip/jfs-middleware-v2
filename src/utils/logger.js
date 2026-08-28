"use strict";

const SENSITIVE_FIELDS = new Set([
  "token",
  "authtoken",
  "authorization",
  "cookie",
  "password",
  "secret",
  "session",
  "sessionid",
  "apikey"
]);

function normalizeFieldName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sanitize(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    return value.map(item => sanitize(item, seen));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[CIRCULAR]";
  }

  seen.add(value);

  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_FIELDS.has(normalizeFieldName(key))
      ? "[REDACTED]"
      : sanitize(item, seen);
  }

  seen.delete(value);
  return sanitized;
}

function write(level, message, context) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message
  };

  if (context !== undefined) {
    entry.context = sanitize(context);
  }

  const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
  console[method](JSON.stringify(entry));
}

function info(message, context) {
  write("info", message, context);
}

function warn(message, context) {
  write("warn", message, context);
}

function error(message, context) {
  write("error", message, context);
}

module.exports = {
  info,
  warn,
  error,
  sanitize
};
