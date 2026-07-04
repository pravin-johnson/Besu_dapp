const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const backendWallet = new ethers.Wallet("f02b8ba9cc5bcf8a77a3de9004917eb688280e3ee68474ad0fa4ae4b9bcc3133", provider);
  
  const recipient = "0x71d88765b4956b14a4c85cebc926334ae5bfd7a4";
  console.log(`Funding ${recipient} with 100 ETH...`);
  
  const tx = await backendWallet.sendTransaction({
    to: recipient,
    value: ethers.parseEther("100.0")
  });
  
  await tx.wait();
  console.log("Funding successful! Tx hash:", tx.hash);
}

main().catch(console.error);
