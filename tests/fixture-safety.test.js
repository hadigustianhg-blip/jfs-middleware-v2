"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const fixturesDirectory = path.join(__dirname, "fixtures");

function fixtureFiles() {
  return fs.readdirSync(fixturesDirectory)
    .filter(file => file.endsWith(".json"))
    .map(file => path.join(fixturesDirectory, file));
}

function visit(value, callback, property = "") {
  if (Array.isArray(value)) {
    value.forEach(item => visit(item, callback, property));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      visit(item, callback, key);
    }
    return;
  }

  callback(value, property);
}

test("all fixture files contain valid JSON", () => {
  const files = fixtureFiles();
  assert.ok(files.length > 0);

  for (const file of files) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, "utf8")));
  }
});

test("fixtures contain no production credential or session patterns", () => {
  for (const file of fixtureFiles()) {
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(text, /Bearer\s+/i);
    assert.doesNotMatch(text, /cookie\s*[:=]/i);
    assert.doesNotMatch(text, /session\s*[:=]/i);
    assert.doesNotMatch(text, /password\s*[:=]/i);
    assert.doesNotMatch(text, /api[_-]?key\s*[:=]/i);
    assert.doesNotMatch(text, /https:\/\/jfsgw\.jtcargo\.co\.id/i);
  }
});

test("fixture identities are clearly dummy values", () => {
  for (const file of fixtureFiles()) {
    const fixture = JSON.parse(fs.readFileSync(file, "utf8"));
    visit(fixture, (value, property) => {
      if (typeof value !== "string") {
        return;
      }

      if (/email/i.test(property)) {
        assert.match(value, /@example\.test$/);
      }

      if (/phone|telphone|mobile/i.test(property) && value !== "") {
        assert.equal(value, "081200000000");
      }

      if (/waybill/i.test(property) && value !== "") {
        assert.match(value, /^TEST\d+$/);
      }

      assert.doesNotMatch(value, /^[A-Za-z0-9_-]{40,}$/);
    });
  }
});
