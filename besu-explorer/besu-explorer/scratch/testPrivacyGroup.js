const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const PRIVATE_FROM = "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=";
  const PRIVATE_FOR = ["85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE="];
  
  const allMembers = [PRIVATE_FROM, ...PRIVATE_FOR];
  const groups = await provider.send("priv_findPrivacyGroup", [allMembers]);
  console.log("Groups found:", JSON.stringify(groups, null, 2));
}

main().catch(console.error);
