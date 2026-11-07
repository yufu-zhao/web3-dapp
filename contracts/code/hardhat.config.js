import { defineConfig } from "hardhat/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  paths: {
    sources: "./sources",
    tests: { solidity: "./test" },
    cache: "./cache",
    artifacts: "./artifacts",
  },
  solidity: {
    version: "0.8.28",
    path: resolve(extensionRoot, "node_modules/solc/soljson.js"),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhatTest: { type: "edr-simulated", chainType: "l1" },
  },
});
