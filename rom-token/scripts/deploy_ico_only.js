const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log("Deploying ROMICO only with the account:", deployerAddress);

  const oldRomAddress = "0x51Dc997cDB30770f82AB0f4EFB00863a6A42922a";
  const oldUsdtAddress = "0x0d0d2B8C892D8f44733BFe8a657e1D9D4Fa9996C";

  // Deploy ROMICO contract
  const ROMICO = await ethers.getContractFactory("ROMICO");
  const romIco = await ROMICO.deploy(deployerAddress, deployerAddress, oldRomAddress, oldUsdtAddress);
  await romIco.waitForDeployment();
  const romIcoAddress = await romIco.getAddress();
  console.log("New ROMICO Contract deployed to:", romIcoAddress);

  // Transfer old ROM tokens to the new ROMICO contract for sale liquidity
  const ROM = await ethers.getContractAt("ROM", oldRomAddress);
  const mintAmount = ethers.parseEther("500000"); // 500,000 ROM tokens
  const transferTx = await ROM.transfer(romIcoAddress, mintAmount);
  await transferTx.wait();
  console.log(`Transferred ${ethers.formatEther(mintAmount)} old ROM tokens to new ROMICO for liquidity.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
