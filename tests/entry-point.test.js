"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

test("server entry point starts and can be stopped without a JFS request", async () => {
  const projectRoot = path.resolve(__dirname, "..");
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: "0",
      AUTH_TOKEN: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  const started = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Server did not start in time"));
    }, 3000);

    child.stdout.on("data", chunk => {
      output += chunk.toString();
      if (output.includes("Server running on port 0")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", code => {
      if (!output.includes("Server running on port 0")) {
        clearTimeout(timeout);
        reject(new Error(`Server exited early with code ${code}`));
      }
    });
  });

  try {
    await started;
    assert.match(output, /Server running on port 0/);
  } finally {
    child.kill("SIGTERM");
    await new Promise(resolve => child.once("exit", resolve));
  }
});
