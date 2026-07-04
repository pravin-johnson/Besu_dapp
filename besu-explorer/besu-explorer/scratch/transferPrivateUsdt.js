const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const OFFC_SIGNER_KEY = "f02b8ba9cc5bcf8a77a3de9004917eb688280e3ee68474ad0fa4ae4b9bcc3133";
  const wallet = new ethers.Wallet(OFFC_SIGNER_KEY, provider);

  const PRIVATE_USDT_ADDRESS = "0x0070d3b751215b994de03684a5d0a360b124dfb3";
  const RECIPIENT = "0x6EA6A6B067e69317C8c278d006f0064CCfedb687";
  const AMOUNT = ethers.parseUnits("1000000", 6); // 1,000,000 USDT

  const PRIVATE_FROM = "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=";
  const PRIVATE_FOR = ["85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE="];
  const PRIVACY_GROUP_ID = "04R7n27BfNa+muLV+rR2eGY17jiwWSC3D+0dpS4MSkY=";

  const usdtInterface = new ethers.Interface([
    "function transfer(address to, uint256 value) returns (bool)"
  ]);
  const calldata = usdtInterface.encodeFunctionData("transfer", [RECIPIENT, AMOUNT]);

  // Query private nonce for 0x5C8F...
  const nonceHex = await provider.send("priv_getTransactionCount", [wallet.address, PRIVACY_GROUP_ID]);
  const nonce = parseInt(nonceHex, 16);
  console.log("Private Nonce for 0x5C8F... is:", nonce);

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits("1", "gwei");

  const privateFromBytes = Buffer.from(PRIVATE_FROM, "base64");
  const privateForBytes = PRIVATE_FOR.map(k => Buffer.from(k, "base64"));
  const nonceBytes = nonce === 0 ? new Uint8Array(0) : ethers.toBeArray(nonce);

  const preimage = [
    nonceBytes,
    ethers.toBeArray(gasPrice),
    ethers.toBeArray(4000000), // gasLimit
    ethers.getBytes(PRIVATE_USDT_ADDRESS),
    new Uint8Array(0),
    ethers.getBytes(calldata),
    privateFromBytes,
    privateForBytes,
    Buffer.from("restricted", "utf-8")
  ];

  const preimageRlp = ethers.encodeRlp(preimage);
  const signingHash = ethers.keccak256(preimageRlp);

  const sigObj = wallet.signingKey.sign(signingHash);
  const sigV = sigObj.v;
  const sigR = ethers.getBytes(sigObj.r);
  const sigS = ethers.getBytes(sigObj.s);

  const signedArray = [
    nonceBytes,
    ethers.toBeArray(gasPrice),
    ethers.toBeArray(4000000),
    ethers.getBytes(PRIVATE_USDT_ADDRESS),
    new Uint8Array(0),
    ethers.getBytes(calldata),
    ethers.toBeArray(sigV),
    sigR,
    sigS,
    privateFromBytes,
    privateForBytes,
    Buffer.from("restricted", "utf-8")
  ];

  const rawTxHex = ethers.encodeRlp(signedArray);
  console.log("Sending EEA transaction...");
  const txHash = await provider.send("eea_sendRawTransaction", [rawTxHex]);
  console.log("EEA Tx Hash:", txHash);
}

main().catch(console.error);
