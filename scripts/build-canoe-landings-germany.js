const { spawnSync } = require("node:child_process");
const path = require("node:path");

const builderPath = path.join(__dirname, "build-canoe-landings.js");
const result = spawnSync(process.execPath, [builderPath, "--germany-only"], { stdio: "inherit" });

if (result.error) {
  console.error("Duitse kanosteiger- en overdraagpuntdata bouwen mislukt:", result.error);
  process.exitCode = 1;
} else {
  process.exitCode = result.status === null ? 1 : result.status;
}
