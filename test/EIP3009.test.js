const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper to sign EIP-712 typed data
async function signTyped(signer, domain, types, value) {
  const sig = await signer.signTypedData(domain, types, value);
  return ethers.Signature.from(sig);
}

function now() { return Math.floor(Date.now() / 1000); }
function randNonce() { return ethers.hexlify(ethers.randomBytes(32)); }

describe("EIP-3009", function () {
  let token, owner, user1, user2, others;
  const NAME = "GenericTestToken";
  const SYMBOL = "TEST";
  const TOKEN_DECIMALS = 18;
  const INITIAL = ethers.parseUnits("1000000", TOKEN_DECIMALS);
  const MAX_SUPPLY = ethers.parseUnits("18000000", TOKEN_DECIMALS);
  const DAILY_MINT_LIMIT = ethers.parseUnits("1000000", TOKEN_DECIMALS);

  beforeEach(async () => {
    [owner, user1, user2, ...others] = await ethers.getSigners();
    const GenericToken = await ethers.getContractFactory("GenericToken");
    token = await GenericToken.deploy(NAME, SYMBOL, TOKEN_DECIMALS, INITIAL, MAX_SUPPLY, DAILY_MINT_LIMIT);
  });

  async function domain(verifyingContract) {
    return {
      name: NAME,
      version: "1",
      chainId:  await ethers.provider.getNetwork().then(n => n.chainId),
      verifyingContract,
    };
  }

  const TypesTransfer = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const TypesReceive = {
    ReceiveWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const TypesCancel = {
    CancelAuthorization: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  it("transferWithAuthorization happy path", async () => {
    const value = ethers.parseUnits("10", 18);
    const validAfter = 0;
    const validBefore = now() + 3600;
    const nonce = randNonce();

    // owner -> user1 by third party submit (user2)
    const msg = { from: owner.address, to: user1.address, value, validAfter, validBefore, nonce };
    const dom = await domain(token.target);
    const { v, r, s } = await signTyped(owner, dom, TypesTransfer, msg);

    await expect(token.connect(user2).transferWithAuthorization(
      owner.address, user1.address, value, validAfter, validBefore, nonce, v, r, s
    )).to.emit(token, "AuthorizationUsed").withArgs(owner.address, nonce);

    expect(await token.balanceOf(user1.address)).to.equal(value);
  });

  it("receiveWithAuthorization enforces caller == to", async () => {
    const value = ethers.parseUnits("5", 18);
    const validAfter = 0;
    const validBefore = now() + 3600;
    const nonce = randNonce();

    const msg = { from: owner.address, to: user1.address, value, validAfter, validBefore, nonce };
    const dom = await domain(token.target);
    const { v, r, s } = await signTyped(owner, dom, TypesReceive, msg);

    await expect(token.connect(user2).receiveWithAuthorization(
      owner.address, user1.address, value, validAfter, validBefore, nonce, v, r, s
    )).to.be.revertedWith("GenericToken: Caller must be recipient");

    await expect(token.connect(user1).receiveWithAuthorization(
      owner.address, user1.address, value, validAfter, validBefore, nonce, v, r, s
    )).to.emit(token, "AuthorizationUsed");

    expect(await token.balanceOf(user1.address)).to.equal(value);
  });

  it("replay protection with same nonce", async () => {
    const value = ethers.parseUnits("1", 18);
    const validAfter = 0;
    const validBefore = now() + 3600;
    const nonce = randNonce();

    const msg = { from: owner.address, to: user1.address, value, validAfter, validBefore, nonce };
    const dom = await domain(token.target);
    const { v, r, s } = await signTyped(owner, dom, TypesTransfer, msg);

    await token.transferWithAuthorization(owner.address, user1.address, value, validAfter, validBefore, nonce, v, r, s);

    await expect(token.transferWithAuthorization(owner.address, user1.address, value, validAfter, validBefore, nonce, v, r, s))
      .to.be.revertedWith("GenericToken: Authorization used or canceled");
  });

  it("cancelAuthorization prevents later use", async () => {
    const value = ethers.parseUnits("2", 18);
    const validAfter = 0;
    const validBefore = now() + 3600;
    const nonce = randNonce();

    const cancel = { authorizer: owner.address, nonce };
    const dom = await domain(token.target);
    const cancelSig = await signTyped(owner, dom, TypesCancel, cancel);

    await expect(token.cancelAuthorization(owner.address, nonce, cancelSig.v, cancelSig.r, cancelSig.s))
      .to.emit(token, "AuthorizationCanceled").withArgs(owner.address, nonce);

    const msg = { from: owner.address, to: user1.address, value, validAfter, validBefore, nonce };
    const { v, r, s } = await signTyped(owner, dom, TypesTransfer, msg);

    await expect(token.transferWithAuthorization(owner.address, user1.address, value, validAfter, validBefore, nonce, v, r, s))
      .to.be.revertedWith("GenericToken: Authorization used or canceled");
  });

  it("time window enforced", async () => {
    const value = ethers.parseUnits("3", 18);
    const tooEarly = now() + 1000;
    const tooLate = now() - 1;
    const ok = now() + 3600;

    {
      const nonce = randNonce();
      const msg = { from: owner.address, to: user1.address, value, validAfter: tooEarly, validBefore: ok, nonce };
      const dom = await domain(token.target);
      const { v, r, s } = await signTyped(owner, dom, TypesTransfer, msg);
      await expect(token.transferWithAuthorization(owner.address, user1.address, value, tooEarly, ok, nonce, v, r, s))
        .to.be.revertedWith("GenericToken: Authorization not yet valid");
    }

    {
      const nonce = randNonce();
      const msg = { from: owner.address, to: user1.address, value, validAfter: 0, validBefore: tooLate, nonce };
      const dom = await domain(token.target);
      const { v, r, s } = await signTyped(owner, dom, TypesTransfer, msg);
      await expect(token.transferWithAuthorization(owner.address, user1.address, value, 0, tooLate, nonce, v, r, s))
        .to.be.revertedWith("GenericToken: Authorization expired");
    }
  });

  it("rejects invalid signature", async () => {
    const value = ethers.parseUnits("4", 18);
    const validBefore = now() + 3600;
    const nonce = randNonce();

    // Create a valid signature but use wrong signer (user2 instead of owner)
    const msg = { from: owner.address, to: user1.address, value, validAfter: 0, validBefore, nonce };
    const dom = await domain(token.target);
    const { v, r, s } = await signTyped(user2, dom, TypesTransfer, msg);

    await expect(token.transferWithAuthorization(owner.address, user1.address, value, 0, validBefore, nonce, v, r, s))
      .to.be.revertedWith("GenericToken: Invalid signature");
  });

  it("blocked by blacklist and emergency/paused", async () => {
    const value = ethers.parseUnits("5", 18);
    const validBefore = now() + 3600;
    const nonce = randNonce();
    const msg = { from: owner.address, to: user1.address, value, validAfter: 0, validBefore, nonce };
    const dom = await domain(token.target);
    const { v, r, s } = await signTyped(owner, dom, TypesTransfer, msg);

    await token.blacklist(user1.address);
    await expect(token.transferWithAuthorization(owner.address, user1.address, value, 0, validBefore, nonce, v, r, s))
      .to.be.revertedWith("GenericToken: Blacklisted address");

    await token.unblacklist(user1.address);
    await token.pause();
    await expect(token.transferWithAuthorization(owner.address, user1.address, value, 0, validBefore, nonce, v, r, s))
      .to.be.reverted;

    await token.unpause();
    await token.activateEmergencyMode();
    await expect(token.transferWithAuthorization(owner.address, user1.address, value, 0, validBefore, nonce, v, r, s))
      .to.be.revertedWith("GenericToken: Contract in emergency mode");
  });
});
