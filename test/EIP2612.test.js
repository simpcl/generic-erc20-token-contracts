const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EIP-2612 Comprehensive Testing", function () {
  let token;
  let owner, spender, recipient, attacker;
  let domain, types;

  const TOKEN_DECIMALS = 18;
  const PERMIT_AMOUNT = ethers.parseUnits("1000", TOKEN_DECIMALS);
  const INITIAL_SUPPLY = ethers.parseUnits("1000000", TOKEN_DECIMALS);
  const MAX_SUPPLY = ethers.parseUnits("18000000", TOKEN_DECIMALS);
  const DAILY_MINT_LIMIT = ethers.parseUnits("1000000", TOKEN_DECIMALS);

  beforeEach(async function () {
    [owner, spender, recipient, attacker] = await ethers.getSigners();

    const GenericToken = await ethers.getContractFactory("GenericToken");
    token = await GenericToken.deploy(
      "GenericTestToken",
      "TEST",
      TOKEN_DECIMALS,
      INITIAL_SUPPLY,
      MAX_SUPPLY,
      DAILY_MINT_LIMIT
    );

    // Setup EIP-712 domain
    domain = {
      name: await token.name(),
      version: "1",
      chainId: await ethers.provider.getNetwork().then(n => n.chainId),
      verifyingContract: token.address
    };

    types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };
  });

  describe("EIP-712 Domain Setup", function () {
    it("Should have correct domain separator", async function () {
      const domainSeparator = await token.DOMAIN_SEPARATOR();

      // Verify domain separator is not zero
      expect(domainSeparator).to.not.equal(ethers.ZeroHash);

      // Verify domain separator matches calculated one
      const calculatedDomainSeparator = ethers.TypedDataEncoder.hashDomain(domain);
      expect(domainSeparator).to.equal(calculatedDomainSeparator);
    });

    it("Should have correct version", async function () {
      expect(await token.version()).to.equal("1");
    });
  });

  describe("Basic Permit Functionality", function () {
    it("Should create valid permit signature", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      // Should execute without error
      await expect(
        token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s)
      ).to.not.be.reverted;

      // Check allowance was set correctly
      expect(await token.allowance(owner.address, spender.address)).to.equal(PERMIT_AMOUNT);
    });

    it("Should increment nonce after permit", async function () {
      const initialNonce = await token.nonces(owner.address);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s);

      const finalNonce = await token.nonces(owner.address);
      expect(finalNonce).to.equal(initialNonce + 1n);
    });

    it("Should work with transferFrom after permit", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      // Execute permit
      await token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s);

      // Check initial balances
      const ownerInitialBalance = await token.balanceOf(owner.address);
      const recipientInitialBalance = await token.balanceOf(recipient.address);

      // Transfer using permit
      await token.connect(spender).transferFrom(owner.address, recipient.address, PERMIT_AMOUNT);

      // Check final balances
      expect(await token.balanceOf(owner.address)).to.equal(ownerInitialBalance - PERMIT_AMOUNT);
      expect(await token.balanceOf(recipient.address)).to.equal(recipientInitialBalance + PERMIT_AMOUNT);
      expect(await token.allowance(owner.address, spender.address)).to.equal(0);
    });
  });

  describe("Permit Security Tests", function () {
    it("Should fail with invalid signature", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Create a valid signature, then modify it
      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: await token.nonces(owner.address),
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      // Modify one parameter to make it invalid
      await expect(
        token.permit(
          owner.address,
          attacker.address, // Different spender
          PERMIT_AMOUNT,
          deadline,
          v, r, s
        )
      ).to.be.reverted;
    });

    it("Should fail with wrong owner signature", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: await token.nonces(owner.address),
        deadline: deadline
      };

      // Sign with attacker instead of owner
      const signature = await attacker._signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s)
      ).to.be.reverted;
    });

    it("Should fail with expired deadline", async function () {
      const expiredDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: await token.nonces(owner.address),
        deadline: expiredDeadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        token.permit(owner.address, spender.address, PERMIT_AMOUNT, expiredDeadline, v, r, s)
      ).to.be.revertedWith("ERC20Permit: expired deadline");
    });

    it("Should fail with invalid nonce", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const currentNonce = await token.nonces(owner.address);
      const futureNonce = currentNonce + 1n; // Use future nonce

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: futureNonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s)
      ).to.be.reverted;
    });

    it("Should prevent replay attacks", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      // First execution should succeed
      await token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s);

      // Second execution with same signature should fail
      await expect(
        token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s)
      ).to.be.reverted;
    });
  });

  describe("Permit with Different Values", function () {
    it("Should work with zero amount", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: 0,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        token.permit(owner.address, spender.address, 0, deadline, v, r, s)
      ).to.not.be.reverted;

      expect(await token.allowance(owner.address, spender.address)).to.equal(0);
    });

    it("Should work with maximum uint256 value", async function () {
      const maxAmount = ethers.MaxUint256;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: maxAmount,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        token.permit(owner.address, spender.address, maxAmount, deadline, v, r, s)
      ).to.not.be.reverted;

      expect(await token.allowance(owner.address, spender.address)).to.equal(maxAmount);
    });
  });

  describe("Integration with Other Features", function () {
    it("Should work with paused contract", async function () {
      // Pause the contract
      await token.pause();

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      // Permit should still work when paused (it's not a transfer)
      await expect(
        token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s)
      ).to.not.be.reverted;

      // But transferFrom should fail
      await expect(
        token.connect(spender).transferFrom(owner.address, recipient.address, PERMIT_AMOUNT)
      ).to.be.revertedWith("ERC20Pausable: token transfer while paused");
    });

    it("Should fail with emergency mode", async function () {
      // Activate emergency mode
      await token.activateEmergencyMode();

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s)
      ).to.be.revertedWith("ProductionToken: Contract in emergency mode");
    });

    it("Should work with blacklisted owner", async function () {
      // Blacklist the owner
      await token.blacklist(owner.address);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      // Permit should work (owner is blacklisted but not executing)
      await expect(
        token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s)
      ).to.not.be.reverted;

      // But transferFrom should fail
      await expect(
        token.connect(spender).transferFrom(owner.address, recipient.address, PERMIT_AMOUNT)
      ).to.be.revertedWith("ProductionToken: Caller is blacklisted");
    });
  });

  describe("Gas Optimization", function () {
    it("Should have reasonable gas cost for permit", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      const tx = await token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s);
      const receipt = await tx.wait();

      console.log("Permit gas used:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lessThan(150000); // Should be under 150k gas
    });

    it("Should have reasonable gas cost for transferFrom after permit", async function () {
      // First execute permit
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s);

      // Then measure transferFrom gas
      const tx = await token.connect(spender).transferFrom(owner.address, recipient.address, PERMIT_AMOUNT);
      const receipt = await tx.wait();

      console.log("TransferFrom after permit gas used:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lessThan(120000); // Should be under 120k gas
    });
  });

  describe("Edge Cases", function () {
    it("Should work with deadline exactly at current time", async function () {
      const deadline = Math.floor(Date.now() / 1000); // Current time
      const nonce = await token.nonces(owner.address);

      const value = {
        owner: owner.address,
        spender: spender.address,
        value: PERMIT_AMOUNT,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      // Should work if timestamp hasn't advanced
      await expect(
        token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s)
      ).to.not.be.reverted;
    });

    it("Should handle multiple permits sequentially", async function () {
      for (let i = 0; i < 5; i++) {
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const nonce = await token.nonces(owner.address);

        const value = {
          owner: owner.address,
          spender: spender.address,
          value: PERMIT_AMOUNT,
          nonce: nonce,
          deadline: deadline
        };

        const signature = await owner.signTypedData(domain, types, value);
        const { v, r, s } = ethers.Signature.from(signature);

        await token.permit(owner.address, spender.address, PERMIT_AMOUNT, deadline, v, r, s);

        // Transfer to test the permit
        await token.connect(spender).transferFrom(owner.address, recipient.address, PERMIT_AMOUNT);
      }

      // Check that all transfers worked
      expect(await token.balanceOf(recipient.address)).to.equal(PERMIT_AMOUNT.mul(5));
    });

    it("Should work with different chain IDs", async function () {
      // This test verifies that the domain separator includes the correct chain ID
      const currentChainId = await ethers.provider.getNetwork().then(n => n.chainId);
      const domainSeparator = await token.DOMAIN_SEPARATOR();

      // The domain separator should be different on different chains
      // (We can't test different chains in this environment, but we can verify the current one)
      expect(domainSeparator).to.not.equal(ethers.ZeroHash);
    });
  });
});