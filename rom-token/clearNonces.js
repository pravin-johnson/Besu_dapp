const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const privateKey = "f02b8ba9cc5bcf8a77a3de9004917eb688280e3ee68474ad0fa4ae4b9bcc3133";
  const wallet = new ethers.Wallet(privateKey, provider);

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits("2", "gwei"); // Use 2 gwei to be safe and fast

  for (let nonce = 2; nonce <= 4; nonce++) {
    console.log(`Sending dummy tx for nonce ${nonce}...`);
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0,
      nonce: nonce,
      gasPrice: gasPrice,
      gasLimit: 21000
    });
    console.log(`Sent: ${tx.hash}`);
    await tx.wait();
    console.log(`Mined nonce: ${nonce}`);
  }
}

main().catch(console.error);
