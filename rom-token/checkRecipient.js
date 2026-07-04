const { ethers } = require("ethers");

const provider =
  new ethers.JsonRpcProvider(
    "http://localhost:8545"
  );

const tokenAddress =
  "0x68AD6E29554AFB2E81B280f34ceFD64F5c532735";

const recipient =
  "0xF179a1Ef73629486Fff2C24DC12D2799D00c316A";

const abi = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

async function main() {

  const token =
    new ethers.Contract(
      tokenAddress,
      abi,
      provider
    );

  const decimals =
    await token.decimals();

  const balance =
    await token.balanceOf(recipient);

  console.log(
    "ROM Balance:",
    ethers.formatUnits(balance, decimals)
  );
}

main();
