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

  // Configuration
  const TOKEN_NAME = process.env.TOKEN_NAME || "GenericToken";
  const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "MYGT";
  const INITIAL_SUPPLY = process.env.INITIAL_SUPPLY
    ? ethers.parseUnits(process.env.INITIAL_SUPPLY, 18)
    : ethers.parseUnits("1000000", 18); // 1 million tokens default

  console.log("Token Configuration:");
  console.log("  Name:", TOKEN_NAME);
  console.log("  Symbol:", TOKEN_SYMBOL);
  console.log("  Initial Supply:", ethers.formatUnits(INITIAL_SUPPLY, 18), "tokens");

  try {
    // Deploy the token
    console.log("🏗️  Deploying GenericToken contract...");
    const GenericToken = await ethers.getContractFactory("GenericToken");
    const token = await GenericToken.deploy(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      INITIAL_SUPPLY
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
    const totalSupply = await token.totalSupply();
    const maxSupply = await token.maxSupply();
    const owner = await token.owner();
    const isOwnerMinter = await token.isMinter(owner);

    console.log("Token Information:");
    console.log("  Name:", name);
    console.log("  Symbol:", symbol);
    console.log("  Total Supply:", ethers.formatUnits(totalSupply, 18), "tokens");
    console.log("  Max Supply:", ethers.formatUnits(maxSupply, 18), "tokens");
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
      initialSupply: ethers.formatUnits(INITIAL_SUPPLY, 18),
      totalSupply: ethers.formatUnits(totalSupply, 18),
      maxSupply: ethers.formatUnits(maxSupply, 18),
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
    console.log(`NEXT_PUBLIC_TOKEN_DECIMALS=18`);

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