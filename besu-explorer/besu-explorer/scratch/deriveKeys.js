const { ethers } = require("ethers");

function main() {
  const mnemonic = "test test test test test test test test test test test junk";
  const target = "0x71d88765b4956b14a4c85cebc926334ae5bfd7a4".toLowerCase();

  for (let i = 0; i < 20; i++) {
    const path = `m/44'/60'/0'/0/${i}`;
    const wallet = ethers.HDNodeWallet.fromMnemonic(ethers.Mnemonic.fromPhrase(mnemonic), path);
    console.log(`Index ${i}: ${wallet.address}`);
    if (wallet.address.toLowerCase() === target) {
      console.log(`Found! Private Key: ${wallet.privateKey}`);
      return;
    }
  }
  console.log("Not found in first 20 accounts.");
}

main();
