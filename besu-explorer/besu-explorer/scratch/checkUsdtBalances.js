const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const pmtAddress = "0x5C8F4a8953b1e57f82268ACd465eFd694Bd978B9";
  const userAddress = "0x71d88765b4956b14a4c85cebc926334ae5bfd7a4";

  const publicUsdtAddr = "0x0d0d2B8C892D8f44733BFe8a657e1D9D4Fa9996C";
  const privateUsdtAddr = "0x0070d3b751215b994de03684a5d0a360b124dfb3";

  const ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ];

  const pubUsdt = new ethers.Contract(publicUsdtAddr, ABI, provider);

  // 1. Check Public USDT balance
  const pubPmtBal = await pubUsdt.balanceOf(pmtAddress).catch(() => 0n);
  const pubUserBal = await pubUsdt.balanceOf(userAddress).catch(() => 0n);

  console.log("Public USDT Balance of PMT:", ethers.formatUnits(pubPmtBal, 6), "USDT");
  console.log("Public USDT Balance of User:", ethers.formatUnits(pubUserBal, 6), "USDT");

  // 2. Check Private USDT balance via priv_call
  const privacyGroupId = "04R7n27BfNa+muLV+rR2eGY17jiwWSC3D+0dpS4MSkY=";
  const iface = new ethers.Interface(ABI);
  
  // Private PMT balance
  const callPmt = iface.encodeFunctionData("balanceOf", [pmtAddress]);
  const rawPmt = await provider.send("priv_call", [
    privacyGroupId,
    { to: privateUsdtAddr, data: callPmt },
    "latest"
  ]).catch(() => "0x");
  const pmtPrivBal = rawPmt !== "0x" ? iface.decodeFunctionResult("balanceOf", rawPmt)[0] : 0n;

  // Private User balance
  const callUser = iface.encodeFunctionData("balanceOf", [userAddress]);
  const rawUser = await provider.send("priv_call", [
    privacyGroupId,
    { to: privateUsdtAddr, data: callUser },
    "latest"
  ]).catch(() => "0x");
  const userPrivBal = rawUser !== "0x" ? iface.decodeFunctionResult("balanceOf", rawUser)[0] : 0n;

  console.log("Private USDT Balance of PMT:", ethers.formatUnits(pmtPrivBal, 6), "USDT");
  console.log("Private USDT Balance of User:", ethers.formatUnits(userPrivBal, 6), "USDT");
}

main().catch(console.error);
