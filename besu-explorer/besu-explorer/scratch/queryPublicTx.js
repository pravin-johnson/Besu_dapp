const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const hash = "0xe7b4b60b1cb5d6236e585cf9095f97e5f8f2e7684ec624bee8ebfa912426fe4";
  
  const receipt = await provider.getTransactionReceipt(hash);
  console.log("Public Receipt:", JSON.stringify(receipt, null, 2));

  const tx = await provider.getTransaction(hash);
  console.log("Public Tx:", JSON.stringify(tx, null, 2));
}

main().catch(console.error);
