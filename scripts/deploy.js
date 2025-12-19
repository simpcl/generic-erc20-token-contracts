const { ethers } = require("hardhat");

async function main() {
  console.log("Starting GenericToken deployment...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Check account balance
  const provider = ethers.provider;
  const balance = await provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Configuration from environment variables
  const TOKEN_NAME = process.env.TOKEN_NAME || "GenericToken";
  const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "MYGT";

  // Token decimals (how many smallest units per token)
  // 1 token = 10^decimals smallest units
  // e.g., 18 means 1 token = 10^18 smallest units (standard)
  // e.g., 6 means 1 token = 10^6 smallest units (like USDC/USDT)
  const TOKEN_DECIMALS = process.env.TOKEN_DECIMALS
    ? parseInt(process.env.TOKEN_DECIMALS, 10)
    : 18;

  // Initial supply in token units (will be converted to smallest units)
  const INITIAL_SUPPLY_IN_TOKENS = process.env.INITIAL_SUPPLY
    ? parseFloat(process.env.INITIAL_SUPPLY)
    : 1000000; // 1 million tokens default

  // Max supply in token units
  const MAX_SUPPLY_IN_TOKENS = process.env.MAX_SUPPLY
    ? parseFloat(process.env.MAX_SUPPLY)
    : 18000000; // 18 million tokens default

  // Daily mint limit in token units
  const DAILY_MINT_LIMIT_IN_TOKENS = process.env.DAILY_MINT_LIMIT
    ? parseFloat(process.env.DAILY_MINT_LIMIT)
    : 1000000; // 1 million tokens default

  console.log("Token Configuration:");
  console.log("  Name:", TOKEN_NAME);
  console.log("  Symbol:", TOKEN_SYMBOL);
  console.log("  Decimals:", TOKEN_DECIMALS, "(1 token = 10^" + TOKEN_DECIMALS + " smallest units)");
  console.log("  Initial Supply:", INITIAL_SUPPLY_IN_TOKENS, "tokens");
  console.log("  Max Supply:", MAX_SUPPLY_IN_TOKENS, "tokens");
  console.log("  Daily Mint Limit:", DAILY_MINT_LIMIT_IN_TOKENS, "tokens");

  try {
    // Deploy the token
    console.log("🏗️  Deploying GenericToken contract...");
    const GenericToken = await ethers.getContractFactory("GenericToken");
    const token = await GenericToken.deploy(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      TOKEN_DECIMALS,
      ethers.parseUnits(INITIAL_SUPPLY_IN_TOKENS.toString(), TOKEN_DECIMALS),
      ethers.parseUnits(MAX_SUPPLY_IN_TOKENS.toString(), TOKEN_DECIMALS),
      ethers.parseUnits(DAILY_MINT_LIMIT_IN_TOKENS.toString(), TOKEN_DECIMALS)
    );

    console.log("⏳ Waiting for deployment confirmation...");
    const deploymentTx = token.deploymentTransaction();
    const deploymentReceipt = await deploymentTx.wait();

    console.log("GenericToken deployed successfully!");
    console.log("Contract address:", await token.getAddress());
    console.log("Transaction hash:", deploymentTx.hash);

    // Verify deployment by reading token info
    console.log("\nVerifying deployment...");
    const name = await token.name();
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    const totalSupply = await token.totalSupply();
    const maxSupply = await token.maxSupply();
    const owner = await token.owner();
    const isOwnerMinter = await token.isMinter(owner);

    console.log("Token Information:");
    console.log("  Name:", name);
    console.log("  Symbol:", symbol);
    console.log("  Decimals:", decimals);
    console.log("  Total Supply:", ethers.formatUnits(totalSupply, decimals), "tokens");
    console.log("  Max Supply:", ethers.formatUnits(maxSupply, decimals), "tokens");
    console.log("  Owner:", owner);
    console.log("  Owner is Minter:", isOwnerMinter);

    // Check EIP-2612 functionality
    console.log("\nEIP-2612 Permit Information:");
    const domainSeparator = await token.DOMAIN_SEPARATOR();
    console.log("  Domain Separator:", domainSeparator);

    console.log("\nDeployment completed successfully!");

    // Save deployment info to a file
    const deploymentInfo = {
      network: "private",
      tokenAddress: await token.getAddress(),
      deployerAddress: deployer.address,
      tokenName: name,
      tokenSymbol: symbol,
      decimals: decimals.toString(),
      initialSupply: ethers.formatUnits(totalSupply, decimals),
      totalSupply: ethers.formatUnits(totalSupply, decimals),
      maxSupply: ethers.formatUnits(maxSupply, decimals),
      owner: owner,
      deploymentTransaction: deploymentTx.hash,
      deploymentBlock: deploymentReceipt.blockNumber,
      deployedAt: new Date().toISOString()
    };

    const fs = require('fs');
    const deploymentPath = './deployment-info.json';
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("Deployment info saved to:", deploymentPath);

    // Environment variables for frontend integration
    console.log("\nEnvironment variables for frontend:");
    console.log(`NEXT_PUBLIC_TOKEN_ADDRESS=${await token.getAddress()}`);
    console.log(`NEXT_PUBLIC_TOKEN_NAME=${name}`);
    console.log(`NEXT_PUBLIC_TOKEN_SYMBOL=${symbol}`);
    console.log(`NEXT_PUBLIC_TOKEN_DECIMALS=${decimals}`);

  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

// Handle errors properly
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });