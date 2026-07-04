const { ethers } = require("ethers");

const sigs = [
  "ERC20InsufficientAllowance(address,uint256,uint256)",
  "ERC20InsufficientBalance(address,uint256,uint256)",
  "ERC20InvalidReceiver(address)",
  "ERC20InvalidSender(address)",
  "ERC20InvalidSpender(address)"
];

for (const sig of sigs) {
  const hash = ethers.id(sig);
  console.log(`${sig}: ${hash.slice(0, 10)}`);
}
