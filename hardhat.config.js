/** @type import('hardhat/config').HardhatUserConfig */
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

export default {
  networks: {
    local: {
      url: "http://127.0.0.1:8545",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 1337
    },
    memo: {
      url: "https://chain.metamemo.one:8501",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 985
    },
    bsctest: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 97,
      gasPrice: 20000000000
    },
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
