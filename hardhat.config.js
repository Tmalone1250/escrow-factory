// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // This is crucial for optimizing complex contracts
    },
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY !== "" ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    localhost: {
        url: "http://127.0.0.1:8545",
        chainId: 31337
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY
  }
};