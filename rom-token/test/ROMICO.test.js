const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ROMICO and USDT Faucet", function () {
  let ROM, rom;
  let USDT, usdt;
  let ROMICO, romIco;
  let owner, signer, buyer, recipient;

  beforeEach(async function () {
    [owner, signer, buyer, recipient] = await ethers.getSigners();

    // Deploy ROM
    ROM = await ethers.getContractFactory("ROM");
    rom = await ROM.deploy();
    await rom.waitForDeployment();

    // Deploy USDT
    USDT = await ethers.getContractFactory("USDT");
    usdt = await USDT.deploy();
    await usdt.waitForDeployment();

    // Deploy ROMICO
    ROMICO = await ethers.getContractFactory("ROMICO");
    romIco = await ROMICO.deploy(
      owner.address,
      signer.address,
      await rom.getAddress(),
      await usdt.getAddress()
    );
    await romIco.waitForDeployment();

    // Fund ROMICO with ROM tokens
    const transferAmount = ethers.parseEther("500000"); // 500k ROM
    await rom.transfer(await romIco.getAddress(), transferAmount);
  });

  describe("USDT Faucet", function () {
    it("should allow requesting tokens from faucet", async function () {
      const faucetAmount = 1000n * 10n ** 6n; // 1000 USDT
      
      // Request tokens
      await usdt.connect(buyer).requestTokens();
      
      const balance = await usdt.balanceOf(buyer.address);
      expect(balance).to.equal(faucetAmount);
    });

    it("should enforce cooldown on requesting tokens", async function () {
      await usdt.connect(buyer).requestTokens();
      await expect(
        usdt.connect(buyer).requestTokens()
      ).to.be.revertedWith("USDTFaucet: Cooldown active");
    });
  });

  describe("ROMICO Buying Tokens", function () {
    it("should allow buying ROM tokens with signature", async function () {
      const usdtAmount = 100n * 10n ** 6n; // 100 USDT ($100)
      
      // Get USDT from faucet
      await usdt.connect(buyer).requestTokens();
      // Approve ROMICO
      await usdt.connect(buyer).approve(await romIco.getAddress(), usdtAmount);

      // Generate EIP-712 Signature
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const domain = {
        name: "ROMICO",
        version: "1",
        chainId: chainId,
        verifyingContract: await romIco.getAddress(),
      };

      const types = {
        Purchase: [
          { name: "recipient", type: "address" },
          { name: "caller", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const nonce = 12345;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const value = {
        recipient: recipient.address,
        caller: buyer.address,
        amount: usdtAmount,
        nonce: nonce,
        deadline: deadline,
      };

      // Sign the struct with the authorized signer
      const signature = await signer.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);

      const signStruct = {
        v: sig.v,
        r: sig.r,
        s: sig.s,
        nonce: nonce,
        deadline: deadline,
      };

      // Purchase tokens
      await expect(
        romIco.connect(buyer).buyToken(recipient.address, usdtAmount, signStruct)
      ).to.emit(romIco, "TokenPurchased").withArgs(recipient.address, 1000n * 10n ** 18n); // 100 USDT * 10 ROM/USDT = 1000 ROM

      // Check balances
      const recipientRomBalance = await rom.balanceOf(recipient.address);
      expect(recipientRomBalance).to.equal(1000n * 10n ** 18n);

      const contractUsdtBalance = await usdt.balanceOf(await romIco.getAddress());
      expect(contractUsdtBalance).to.equal(usdtAmount);
    });

    it("should revert if signature is invalid", async function () {
      const usdtAmount = 100n * 10n ** 6n;
      await usdt.connect(buyer).requestTokens();
      await usdt.connect(buyer).approve(await romIco.getAddress(), usdtAmount);

      const chainId = (await ethers.provider.getNetwork()).chainId;
      const domain = {
        name: "ROMICO",
        version: "1",
        chainId: chainId,
        verifyingContract: await romIco.getAddress(),
      };

      const types = {
        Purchase: [
          { name: "recipient", type: "address" },
          { name: "caller", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const nonce = 12345;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const value = {
        recipient: recipient.address,
        caller: buyer.address,
        amount: usdtAmount,
        nonce: nonce,
        deadline: deadline,
      };

      // Sign with owner (unauthorized signer) instead of signer
      const signature = await owner.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);

      const signStruct = {
        v: sig.v,
        r: sig.r,
        s: sig.s,
        nonce: nonce,
        deadline: deadline,
      };

      await expect(
        romIco.connect(buyer).buyToken(recipient.address, usdtAmount, signStruct)
      ).to.be.revertedWith("Signer verification failed");
    });
  });
});
