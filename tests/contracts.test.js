"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const manifestPath = path.join(
  __dirname,
  "contracts",
  "endpoints.contract.json"
);

function readManifestText() {
  return fs.readFileSync(manifestPath, "utf8");
}

function readManifest() {
  return JSON.parse(readManifestText());
}

test("contract manifest is valid JSON without duplicate endpoint entries", () => {
  const text = readManifestText();
  const manifest = JSON.parse(text);
  const rawEndpointEntries = text.match(
    /^\s+"(?:GET|POST) \/[^\"]*": \{/gm
  ) || [];
  const names = Object.keys(manifest.contracts);

  assert.equal(rawEndpointEntries.length, names.length);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.length, 15);
});

test("contract manifest records every source endpoint", () => {
  const manifest = readManifest();
  const serverSource = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8"
  );
  const routesDirectory = path.join(__dirname, "..", "src", "routes");
  const routeSources = fs.readdirSync(routesDirectory)
    .filter(file => file.endsWith(".routes.js"))
    .map(file => fs.readFileSync(path.join(routesDirectory, file), "utf8"))
    .join("\n");
  const combined = `${serverSource}\n${routeSources}`;
  const discovered = [...combined.matchAll(
    /(?:app|router)\.(get|post)\("([^"]+)"/g
  )].map(match => `${match[1].toUpperCase()} ${match[2]}`);

  assert.equal(new Set(discovered).size, discovered.length);
  assert.deepEqual(
    [...discovered].sort(),
    Object.keys(manifest.contracts).sort()
  );
});

test("contract entries use valid methods, paths, statuses, and response keys", () => {
  const manifest = readManifest();

  for (const [endpoint, contract] of Object.entries(manifest.contracts)) {
    assert.match(endpoint, /^(?:GET|POST) \/[a-z0-9/-]*$/);
    assert.ok(["legacy", "modular"].includes(contract.status));
    assert.equal(contract.successStatus, 200);
    assert.equal(contract.sourceAnalyzed, true);
    assert.ok(Array.isArray(contract.queryParameters));
    assert.ok(Array.isArray(contract.successTopLevelKeys));
    assert.ok(Array.isArray(contract.errorTopLevelKeys));
    assert.ok(Array.isArray(contract.errorVariants));

    if (contract.successResponseType === "json") {
      assert.ok(contract.successTopLevelKeys.length > 0);
    }
  }
});

test("modular and sensitive endpoints are classified accurately", () => {
  const { contracts } = readManifest();

  assert.equal(contracts["GET /jfs-aging-sign"].status, "modular");
  assert.equal(contracts["GET /jfs-sensitive"].status, "modular");
  assert.equal(contracts["GET /jfs-inventory-detail"].status, "modular");
  assert.equal(
    contracts["POST /jfs-waybill-status-batch"].status,
    "modular"
  );
  assert.ok(
    contracts["POST /jfs-auth/login"].classifications.includes(
      "security-sensitive"
    )
  );
  assert.equal(contracts["GET /jfs-pickup"].status, "legacy");
  assert.equal(contracts["GET /jfs-inventory"].status, "legacy");
  assert.ok(
    contracts["GET /set-token"].classifications.includes(
      "security-sensitive"
    )
  );
  assert.ok(
    contracts["GET /jfs-sensitive"].classifications.includes(
      "security-sensitive"
    )
  );
});

test("manifest contains no credential-looking values", () => {
  const manifest = readManifest();
  const serialized = JSON.stringify(manifest);

  assert.doesNotMatch(serialized, /Bearer\s+[A-Za-z0-9._-]+/i);
  assert.doesNotMatch(serialized, /session=[A-Za-z0-9._-]+/i);
  assert.doesNotMatch(serialized, /[A-Fa-f0-9]{32,}/);

  const setToken = manifest.contracts["GET /set-token"];
  assert.deepEqual(setToken.successTopLevelKeys, ["message", "token"]);
  assert.ok(setToken.classifications.includes("security-sensitive"));
});
