const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const walletAddress = "0x5C8F4a8953b1e57f82268ACd465eFd694Bd978B9";
  const privacyGroupId = "04R7n27BfNa+muLV+rR2eGY17jiwWSC3D+0dpS4MSkY=";

  const nonceHex = await provider.send("priv_getTransactionCount", [
    walletAddress,
    privacyGroupId
  ]);
  console.log("Private Nonce Hex:", nonceHex);
  console.log("Private Nonce Decimal:", parseInt(nonceHex, 16));
}

main().catch(console.error);
