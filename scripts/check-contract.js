const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

function showUsage() {
    console.log(`
Example usage:
   DEPLOYMENT_FILE=deployment-info.json npx hardhat run scripts/check-contract.js --network private
`);
}

function getDeploymentFiles() {
    try {
        return fs.readdirSync('./')
            .filter(file => file.startsWith('deployment-info.') && file.endsWith('.json'))
            .sort()
            .reverse();
    } catch (error) {
        console.error("❌ Failed to read directory:", error.message);
        return [];
    }
}

function showDeploymentInfo(deploymentInfo) {
    console.log(`\n📊 Detailed Information:`);
    console.log(`  Network: ${deploymentInfo.network || 'Unknown'}`);
    console.log(`  Deployer: ${deploymentInfo.deployerAddress || 'Unknown'}`);
    console.log(`  Owner: ${deploymentInfo.owner || 'Unknown'}`);
    console.log(`  Token Name: ${deploymentInfo.tokenName || 'Unknown'}`);
    console.log(`  Token Symbol: ${deploymentInfo.tokenSymbol || 'Unknown'}`);
    console.log(`  Initial Supply: ${deploymentInfo.initialSupply || 'Unknown'}`);
    console.log(`  Total Supply: ${deploymentInfo.totalSupply || 'Unknown'}`);
    console.log(`  Max Supply: ${deploymentInfo.maxSupply || 'Unknown'}`);
    console.log(`  Deployment Block: ${deploymentInfo.deploymentBlock || 'Unknown'}`);
    console.log(`  Deployment Transaction: ${deploymentInfo.deploymentTransaction || 'Unknown'}`);
    console.log(`  Deployment Time: ${deploymentInfo.deployedAt || 'Unknown'}`);
}

async function main() {
    console.log("🔍 Checking smart contracts in specific deployment file...");

    // Get deployment file name from environment variable
    const deploymentFile = process.env.DEPLOYMENT_FILE;

    if (!deploymentFile) {
        console.error("❌ Please set DEPLOYMENT_FILE environment variable");
        showUsage();
        process.exit(1);
    }

    // Check if file exists
    if (!fs.existsSync(deploymentFile)) {
        console.error(`❌ Specified deployment file does not exist: ${deploymentFile}`);

        // List available files
        const availableFiles = getDeploymentFiles();
        if (availableFiles.length > 0) {
            console.log("📁 Available deployment files:");
            availableFiles.forEach(file => {
                console.log(`   - ${file}`);
            });
        } else {
            console.log("❌ No deployment-info*.json files found in current directory");
        }
        process.exit(1);
    }

    const provider = ethers.provider;

    // Get network information
    const network = await provider.getNetwork();
    console.log(`\n📍 Network Information:`);
    console.log(`  Chain ID: ${network.chainId}`);
    console.log(`  Current Block: ${network.blockNumber || "Latest"}`);

    try {
        // Read specified deployment information
        const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));

        console.log(`\n📄 Checking deployment file ${deploymentFile} content:`);
        console.log(`================`);
        showDeploymentInfo(deploymentInfo);

        // Check main contract
        if (deploymentInfo.tokenAddress) {
            console.log(`\n📋 Checking contract ${deploymentFile} content: `);
            console.log(`================`);

            await checkContract(
                provider,
                deploymentInfo.tokenAddress,
                "GenericToken",
                deploymentInfo
            );
        } else {
            console.log("❌ No tokenAddress found in deployment file");
        }

    } catch (error) {
        console.error("❌ Failed to read deployment information:", error.message);
        process.exit(1);
    }

    console.log(`\n✅ Check completed!`);
}

async function checkContract(provider, address, name = "", deploymentInfo = null) {
    try {
        // Get contract code
        const code = await provider.getCode(address);
        const hasCode = code !== "0x";

        console.log(`\n📄 ${name || "Contract"} @ ${address}`);
        console.log(`  Status: ${hasCode ? "✅ Has contract code" : "❌ Empty address"}`);

        if (hasCode) {
            console.log(`  Code Length: ${(code.length / 2 - 1)} bytes`);

            // If it's an ERC20 token, try to get basic information
            try {
                const token = await ethers.getContractAt("GenericToken", address);

                const tokenName = await token.name();
                const tokenSymbol = await token.symbol();
                const totalSupply = await token.totalSupply();
                const owner = await token.owner();
                const maxSupply = await token.maxSupply();

                console.log(`  Token Name: ${tokenName}`);
                console.log(`  Token Symbol: ${tokenSymbol}`);
                console.log(`  Total Supply: ${ethers.formatEther(totalSupply)}`);
                console.log(`  Max Supply: ${ethers.formatEther(maxSupply)}`);
                console.log(`  Owner: ${owner}`);

                // Check if paused
                try {
                    const paused = await token.paused();
                    console.log(`  Paused Status: ${paused ? "⏸️ Paused" : "▶️ Running"}`);
                } catch (e) {
                    console.log(`  Paused Status: Unable to check`);
                }

                // Check if minter
                try {
                    const isMinter = await token.isMinter(owner);
                    console.log(`  Owner is Minter: ${isMinter ? "✅ Yes" : "❌ No"}`);
                } catch (e) {
                    console.log(`  Minter Status: Unable to check`);
                }

                // Check emergency mode
                try {
                    const emergencyMode = await token.emergencyMode();
                    console.log(`  Emergency Mode: ${emergencyMode ? "🚨 Activated" : "✅ Normal"}`);
                } catch (e) {
                    console.log(`  Emergency Mode Status: Unable to check`);
                }

            } catch (tokenError) {
                console.log(`  ⚠️  Unable to read token information: ${tokenError.message}`);
            }

            // Try to get transaction information
            if (deploymentInfo && deploymentInfo.deploymentTransaction) {
                try {
                    const tx = await provider.getTransaction(deploymentInfo.deploymentTransaction);
                    if (tx) {
                        console.log(`  Deployment Transaction: ${tx.hash}`);
                        console.log(`  Gas Limit: ${tx.gasLimit.toString()}`);
                        console.log(`  Gas Price: ${ethers.formatUnits(tx.gasPrice || 0, "gwei")} Gwei`);
                    }
                } catch (txError) {
                    console.log(`  ⚠️  Unable to get transaction information: ${txError.message}`);
                }
            }
        }

    } catch (error) {
        console.log(`❌ Check failed: ${error.message}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script execution failed:", error);
        process.exit(1);
    });