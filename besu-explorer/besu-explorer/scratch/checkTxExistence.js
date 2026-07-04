const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const pmtAddress = "0x5C8F4a8953b1e57f82268ACd465eFd694Bd978B9";
  const userAddress = "0x71d88765b4956b14a4c85cebc926334ae5bfd7a4";

  const [pmtBal, userBal] = await Promise.all([
    provider.getBalance(pmtAddress),
    provider.getBalance(userAddress)
  ]);

  console.log("PMT Wallet Balance:", ethers.formatEther(pmtBal), "ETH");
  console.log("User Wallet Balance:", ethers.formatEther(userBal), "ETH");
}

main().catch(console.error);
