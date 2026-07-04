const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const pmtWallet = new ethers.Wallet("f02b8ba9cc5bcf8a77a3de9004917eb688280e3ee68474ad0fa4ae4b9bcc3133", provider);
  
  // Generate random wallet
  const newWallet = ethers.Wallet.createRandom(provider);
  console.log("New Wallet Address:", newWallet.address);
  console.log("New Private Key:", newWallet.privateKey);
  
  // Send 100,000 ETH to new wallet
  const tx = await pmtWallet.sendTransaction({
    to: newWallet.address,
    value: ethers.parseEther("100000.0")
  });
  console.log("Funding transaction sent:", tx.hash);
  await tx.wait();
  console.log("Funding transaction confirmed!");
  
  const balance = await provider.getBalance(newWallet.address);
  console.log("New wallet balance:", ethers.formatEther(balance), "ETH");
}

main().catch(console.error);
