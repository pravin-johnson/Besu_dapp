const { ethers } = require("ethers");

const provider =
  new ethers.JsonRpcProvider(
    "http://192.168.18.187:8545"
  );

const tokenAddress =
  "0x68AD6E29554AFB2E81B280f34ceFD64F5c532735";

const abi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)"
];

async function main() {

  const token =
    new ethers.Contract(
      tokenAddress,
      abi,
      provider
    );

  console.log(
    "Name:",
    await token.name()
  );

  console.log(
    "Symbol:",
    await token.symbol()
  );

  console.log(
    "Supply:",
    (await token.totalSupply()).toString()
  );
}

main();
