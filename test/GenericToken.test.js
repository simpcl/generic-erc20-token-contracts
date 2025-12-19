const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("GenericToken", function () {
  let token;
  let owner;
  let minter;
  let user1;
  let user2;
  let addrs;

  const TOKEN_NAME = "GenericTestToken";
  const TOKEN_SYMBOL = "TEST";
  const TOKEN_DECIMALS = 18;
  const INITIAL_SUPPLY = ethers.parseUnits("1000000", TOKEN_DECIMALS);
  const MINT_AMOUNT = ethers.parseUnits("1000", TOKEN_DECIMALS);
  const MAX_SUPPLY = ethers.parseUnits("18000000", TOKEN_DECIMALS);
  const DAILY_MINT_LIMIT = ethers.parseUnits("1000000", TOKEN_DECIMALS);

  beforeEach(async function () {
    [owner, minter, user1, user2, ...addrs] = await ethers.getSigners();

    const GenericToken = await ethers.getContractFactory("GenericToken");
    token = await GenericToken.deploy(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      TOKEN_DECIMALS,
      INITIAL_SUPPLY,
      MAX_SUPPLY,
      DAILY_MINT_LIMIT
    );
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("Should assign the initial supply to the owner", async function () {
      const ownerBalance = await token.balanceOf(owner.address);
      expect(await token.totalSupply()).to.equal(ownerBalance);
      expect(ownerBalance).to.equal(INITIAL_SUPPLY);
    });

    it("Should set the correct name and symbol", async function () {
      expect(await token.name()).to.equal(TOKEN_NAME);
      expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
    });

    it("Should set owner as minter by default", async function () {
      expect(await token.isMinter(owner.address)).to.be.true;
    });

    it("Should have correct max supply", async function () {
      expect(await token.maxSupply()).to.equal(MAX_SUPPLY);
    });

    it("Should start unpaused and not in emergency mode", async function () {
      expect(await token.paused()).to.be.false;
      expect(await token.emergencyMode()).to.be.false;
    });
  });

  describe("ERC20 Basic Functionality", function () {
    it("Should transfer tokens between accounts", async function () {
      await token.transfer(user1.address, MINT_AMOUNT);
      const user1Balance = await token.balanceOf(user1.address);

      expect(user1Balance).to.equal(MINT_AMOUNT);
    });

    it("Should fail if sender doesn't have enough tokens", async function () {
      const initialOwnerBalance = await token.balanceOf(owner.address);

      await expect(
        token.connect(user1).transfer(owner.address, MINT_AMOUNT)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");

      expect(await token.balanceOf(owner.address)).to.equal(initialOwnerBalance);
    });

    it("Should update balances after transfers", async function () {
      await token.transfer(user1.address, MINT_AMOUNT);
      await token.transfer(user2.address, MINT_AMOUNT);

      const ownerBalance = await token.balanceOf(owner.address);
      const user1Balance = await token.balanceOf(user1.address);
      const user2Balance = await token.balanceOf(user2.address);

      expect(user1Balance).to.equal(MINT_AMOUNT);
      expect(user2Balance).to.equal(MINT_AMOUNT);
      expect(ownerBalance).to.equal(INITIAL_SUPPLY - MINT_AMOUNT - MINT_AMOUNT);
    });

    it("Should handle approve and transferFrom", async function () {
      await token.approve(user1.address, MINT_AMOUNT);
      expect(await token.allowance(owner.address, user1.address)).to.equal(MINT_AMOUNT);

      await token.connect(user1).transferFrom(owner.address, user2.address, MINT_AMOUNT);
      expect(await token.balanceOf(user2.address)).to.equal(MINT_AMOUNT);
      expect(await token.allowance(owner.address, user1.address)).to.equal(0);
    });
  });

  describe("EIP-2612 Permit Functionality", function () {
    it("Should support permit", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const domain = {
        name: await token.name(),
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: token.address
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        owner: owner.address,
        spender: user1.address,
        value: MINT_AMOUNT,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        token.permit(owner.address, user1.address, MINT_AMOUNT, deadline, v, r, s)
      ).to.not.be.reverted;

      expect(await token.allowance(owner.address, user1.address)).to.equal(MINT_AMOUNT);
    });

    it("Should fail permit with invalid signature", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const invalidSig = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678";
      const { v, r, s } = ethers.Signature.from(invalidSig);

      await expect(
        token.permit(owner.address, user1.address, MINT_AMOUNT, deadline, v, r, s)
      ).to.be.reverted;
    });

    it("Should fail permit with expired deadline", async function () {
      const expiredDeadline = Math.floor(Date.now() / 1000) - 3600;
      const nonce = await token.nonces(owner.address);

      const domain = {
        name: await token.name(),
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: token.address
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        owner: owner.address,
        spender: user1.address,
        value: MINT_AMOUNT,
        nonce: nonce,
        deadline: expiredDeadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        token.permit(owner.address, user1.address, MINT_AMOUNT, expiredDeadline, v, r, s)
      ).to.be.revertedWith("ERC20Permit: expired deadline");
    });
  });

  describe("Minting Functionality", function () {
    beforeEach(async function () {
      await token.addMinter(minter.address);
    });

    it("Should allow minter to mint tokens", async function () {
      await expect(token.connect(minter).mint(user1.address, MINT_AMOUNT))
        .to.emit(token, "TokensMinted")
        .withArgs(user1.address, MINT_AMOUNT);

      expect(await token.balanceOf(user1.address)).to.equal(MINT_AMOUNT);
    });

    it("Should fail if non-minter tries to mint", async function () {
      await expect(
        token.connect(user1).mint(user2.address, MINT_AMOUNT)
      ).to.be.revertedWith("GenericToken: Caller is not a minter");
    });

    it("Should fail if minting to zero address", async function () {
      await expect(
        token.connect(minter).mint(ethers.ZeroAddress, MINT_AMOUNT)
      ).to.be.revertedWith("GenericToken: Cannot mint to zero address");
    });

    it("Should respect max supply limit", async function () {
      const exceedingAmount = MAX_SUPPLY - INITIAL_SUPPLY + 1n;

      await expect(
        token.connect(minter).mint(user1.address, exceedingAmount)
      ).to.be.revertedWith("GenericToken: Max supply exceeded");
    });

    it("Should respect daily mint limit", async function () {
      // Mint up to daily limit
      await token.connect(minter).mint(user1.address, DAILY_MINT_LIMIT);

      // Try to mint more
      await expect(
        token.connect(minter).mint(user2.address, 1)
      ).to.be.revertedWith("GenericToken: Daily mint limit exceeded");
    });

    it("Should reset daily limit after 24 hours", async function () {
      // Mint some tokens
      await token.connect(minter).mint(user1.address, MINT_AMOUNT);

      // Fast forward 24 hours
      await time.increase(24 * 60 * 60 + 1);

      // Should be able to mint again
      await expect(token.connect(minter).mint(user2.address, MINT_AMOUNT))
        .to.not.be.reverted;
    });
  });

  describe("Burning Functionality", function () {
    beforeEach(async function () {
      await token.transfer(user1.address, MINT_AMOUNT);
    });

    it("Should allow user to burn their own tokens", async function () {
      const initialBalance = await token.balanceOf(user1.address);
      const burnAmount = MINT_AMOUNT / 2n;

      await expect(token.connect(user1).burn(burnAmount))
        .to.not.be.reverted;

      expect(await token.balanceOf(user1.address)).to.equal(initialBalance - burnAmount);
    });

    it("Should allow burnFrom with approval", async function () {
      const burnAmount = MINT_AMOUNT / 2n;
      await token.connect(user1).approve(owner.address, burnAmount);

      await expect(token.burnFrom(user1.address, burnAmount))
        .to.not.be.reverted;

      expect(await token.balanceOf(user1.address)).to.equal(burnAmount);
    });
  });

  describe("Pausable Functionality", function () {
    it("Should allow owner to pause and unpause", async function () {
      await token.pause();
      expect(await token.paused()).to.be.true;

      await token.unpause();
      expect(await token.paused()).to.be.false;
    });

    it("Should fail if non-owner tries to pause", async function () {
      await expect(token.connect(user1).pause())
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should prevent transfers when paused", async function () {
      await token.pause();

      await expect(
        token.transfer(user1.address, MINT_AMOUNT)
      ).to.be.revertedWith("ERC20Pausable: token transfer while paused");

      await expect(
        token.approve(user1.address, MINT_AMOUNT)
      ).to.be.revertedWith("ERC20Pausable: token transfer while paused");
    });
  });

  describe("Minter Management", function () {
    it("Should allow owner to add minter", async function () {
      await expect(token.addMinter(user1.address))
        .to.emit(token, "MinterAdded")
        .withArgs(user1.address);

      expect(await token.isMinter(user1.address)).to.be.true;
    });

    it("Should allow owner to remove minter", async function () {
      await token.addMinter(user1.address);

      await expect(token.removeMinter(user1.address))
        .to.emit(token, "MinterRemoved")
        .withArgs(user1.address);

      expect(await token.isMinter(user1.address)).to.be.false;
    });

    it("Should fail if trying to remove owner as minter", async function () {
      await expect(
        token.removeMinter(owner.address)
      ).to.be.revertedWith("GenericToken: Cannot remove owner as minter");
    });

    it("Should fail if trying to add zero address as minter", async function () {
      await expect(
        token.addMinter(ethers.ZeroAddress)
      ).to.be.revertedWith("GenericToken: Cannot add zero address as minter");
    });
  });

  describe("Blacklist Functionality", function () {
    it("Should allow owner to blacklist address", async function () {
      await token.blacklist(user1.address);
      expect(await token.isBlacklisted(user1.address)).to.be.true;
    });

    it("Should prevent blacklisted addresses from transferring", async function () {
      await token.blacklist(user1.address);
      await token.transfer(user1.address, MINT_AMOUNT);

      await expect(
        token.connect(user1).transfer(user2.address, MINT_AMOUNT / 2n)
      ).to.be.revertedWith("GenericToken: Caller is blacklisted");
    });

    it("Should prevent transfers to blacklisted addresses", async function () {
      await token.blacklist(user1.address);

      await expect(
        token.transfer(user1.address, MINT_AMOUNT)
      ).to.be.revertedWith("GenericToken: Recipient is blacklisted");
    });

    it("Should allow owner to unblacklist address", async function () {
      await token.blacklist(user1.address);
      await token.unblacklist(user1.address);

      expect(await token.isBlacklisted(user1.address)).to.be.false;
    });

    it("Should fail if trying to blacklist owner", async function () {
      await expect(
        token.blacklist(owner.address)
      ).to.be.revertedWith("GenericToken: Cannot blacklist owner");
    });
  });

  describe("Emergency Mode", function () {
    it("Should allow owner to activate and deactivate emergency mode", async function () {
      await token.activateEmergencyMode();
      expect(await token.emergencyMode()).to.be.true;

      await token.deactivateEmergencyMode();
      expect(await token.emergencyMode()).to.be.false;
    });

    it("Should prevent normal operations in emergency mode", async function () {
      await token.activateEmergencyMode();

      await expect(
        token.transfer(user1.address, MINT_AMOUNT)
      ).to.be.revertedWith("GenericToken: Contract in emergency mode");

      await expect(
        token.approve(user1.address, MINT_AMOUNT)
      ).to.be.revertedWith("GenericToken: Contract in emergency mode");

      await expect(
        token.connect(user1).permit(
          owner.address,
          user1.address,
          MINT_AMOUNT,
          Math.floor(Date.now() / 1000) + 3600,
          27,
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
        )
      ).to.be.revertedWith("GenericToken: Contract in emergency mode");
    });

    it("Should allow emergency transfer in emergency mode", async function () {
      await token.transfer(user1.address, MINT_AMOUNT);
      await token.activateEmergencyMode();

      const transferAmount = MINT_AMOUNT / 2n;
      await expect(token.emergencyTransfer(user1.address, user2.address, transferAmount))
        .to.not.be.reverted;

      expect(await token.balanceOf(user1.address)).to.equal(transferAmount);
      expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
    });

    it("Should fail emergency transfer when not in emergency mode", async function () {
      await expect(
        token.emergencyTransfer(user1.address, user2.address, MINT_AMOUNT)
      ).to.be.revertedWith("GenericToken: Not in emergency mode");
    });
  });

  describe("View Functions", function () {
    it("Should return correct version for EIP-712", async function () {
      expect(await token.version()).to.equal("1");
    });

    it("Should return correct domain separator", async function () {
      expect(await token.DOMAIN_SEPARATOR()).to.not.equal(ethers.ZeroHash);
    });

    it("Should return correct nonces", async function () {
      expect(await token.nonces(owner.address)).to.equal(0);

      // After a permit transaction, nonce should increase
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const domain = {
        name: await token.name(),
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: token.address
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        owner: owner.address,
        spender: user1.address,
        value: 1,
        nonce: 0,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await token.permit(owner.address, user1.address, 1, deadline, v, r, s);

      expect(await token.nonces(owner.address)).to.equal(1);
    });

    it("Should return correct daily minted amount", async function () {
      await token.addMinter(minter.address);
      await token.connect(minter).mint(user1.address, MINT_AMOUNT);

      expect(await token.dailyMinted()).to.equal(MINT_AMOUNT);
    });

    it("Should return correct remaining daily limit", async function () {
      await token.addMinter(minter.address);
      await token.connect(minter).mint(user1.address, MINT_AMOUNT);

      expect(await token.remainingDailyLimit()).to.equal(DAILY_MINT_LIMIT - MINT_AMOUNT);
    });
  });

  describe("Gas Optimization", function () {
    it("Should have reasonable gas costs for basic operations", async function () {
      // Transfer
      const transferTx = await token.transfer(user1.address, MINT_AMOUNT);
      const transferReceipt = await transferTx.wait();
      console.log("Transfer gas used:", transferReceipt.gasUsed.toString());

      // Approve
      const approveTx = await token.approve(user1.address, MINT_AMOUNT);
      const approveReceipt = await approveTx.wait();
      console.log("Approve gas used:", approveReceipt.gasUsed.toString());

      // Permit
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const domain = {
        name: await token.name(),
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: token.address
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const value = {
        owner: owner.address,
        spender: user1.address,
        value: MINT_AMOUNT,
        nonce: await token.nonces(owner.address),
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      const permitTx = await token.permit(owner.address, user1.address, MINT_AMOUNT, deadline, v, r, s);
      const permitReceipt = await permitTx.wait();
      console.log("Permit gas used:", permitReceipt.gasUsed.toString());

      // All operations should use reasonable amounts of gas
      expect(transferReceipt.gasUsed).to.be.lessThan(100000);
      expect(approveReceipt.gasUsed).to.be.lessThan(80000);
      expect(permitReceipt.gasUsed).to.be.lessThan(150000);
    });
  });
});