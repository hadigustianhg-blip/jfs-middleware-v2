"use strict";

const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

test("server can be imported without opening a listener", () => {
  const { app, startServer } = require("../server");
  assert.equal(typeof app, "function");
  assert.equal(typeof startServer, "function");
  assert.equal(app.listening, undefined);
});

async function getFreePort() {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

function getRoot(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/`, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => {
        body += chunk;
      });
      response.on("end", () => resolve({
        statusCode: response.statusCode,
        body
      }));
    }).once("error", reject);
  });
}

test("npm entry point starts and root responds without a JFS request", async () => {
  const projectRoot = path.resolve(__dirname, "..");
  const port = await getFreePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
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
      if (output.includes(`Server running on port ${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", code => {
      if (!output.includes(`Server running on port ${port}`)) {
        clearTimeout(timeout);
        reject(new Error(`Server exited early with code ${code}`));
      }
    });
  });

  try {
    await started;
    const response = await getRoot(port);
    assert.equal(response.statusCode, 200);
    assert.equal(
      response.body,
      "API JFS Middleware (Pickup + Dispatch) 🚀"
    );
  } finally {
    child.kill("SIGTERM");
    await new Promise(resolve => child.once("exit", resolve));
  }
});
