const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const OFFC_SIGNER_KEY = "f02b8ba9cc5bcf8a77a3de9004917eb688280e3ee68474ad0fa4ae4b9bcc3133";
  const wallet = new ethers.Wallet(OFFC_SIGNER_KEY, provider);

  const PUBLIC_USDT_ADDRESS = "0x0d0d2B8C892D8f44733BFe8a657e1D9D4Fa9996C";
  const RECIPIENT = "0x6EA6A6B067e69317C8c278d006f0064CCfedb687";
  const AMOUNT = ethers.parseUnits("1000000", 6); // 1,000,000 USDT

  const usdtContract = new ethers.Contract(PUBLIC_USDT_ADDRESS, [
    "function transfer(address to, uint256 value) returns (bool)",
    "function balanceOf(address) view returns (uint256)"
  ], wallet);

  const balance = await usdtContract.balanceOf(wallet.address);
  console.log("PMT Public USDT Balance:", ethers.formatUnits(balance, 6));

  console.log("Transferring Public USDT...");
  const tx = await usdtContract.transfer(RECIPIENT, AMOUNT);
  console.log("Tx Hash:", tx.hash);
  await tx.wait();
  console.log("Transfer confirmed!");
}

main().catch(console.error);
