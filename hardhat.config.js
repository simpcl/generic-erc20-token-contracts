/** @type import('hardhat/config').HardhatUserConfig */
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

export default {
  networks: {
    private: {
      url: "http://127.0.0.1:8545",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 1337
    }
  },

  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};
