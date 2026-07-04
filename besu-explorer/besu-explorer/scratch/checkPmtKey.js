const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

function main() {
  const keyPath = "/Users/fayas/Downloads/ICO-Application/react-ico/besu-lab/nodes/validator1/pmt.key";
  if (!fs.existsSync(keyPath)) {
    console.error("pmt.key not found at path:", keyPath);
    return;
  }
  const keyHex = fs.readFileSync(keyPath, "utf8").trim();
  const wallet = new ethers.Wallet(keyHex);
  console.log("PMT Wallet Address:", wallet.address);
}

main();
