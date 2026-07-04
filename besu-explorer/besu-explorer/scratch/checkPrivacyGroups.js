const { ethers } = require("ethers");

const RPC_URL = "http://localhost:8545";
const provider = new ethers.JsonRpcProvider(RPC_URL);

async function main() {
  const members1 = [
    "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=",
    "85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE="
  ];
  
  const groups1 = await provider.send("priv_findPrivacyGroup", [members1]).catch(err => err.message);
  console.log("Groups for members 1:", JSON.stringify(groups1, null, 2));

  // Let's also try with validator1 and validator2 keys, etc.
  const members2 = [
    "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8="
  ];
  const groups2 = await provider.send("priv_findPrivacyGroup", [members2]).catch(err => err.message);
  console.log("Groups for members 2 (only validator1):", JSON.stringify(groups2, null, 2));
}

main().catch(console.error);
