const { ethers } = require("ethers");
const fs = require("fs");

const PRIVATE_KEY = "f02b8ba9cc5bcf8a77a3de9004917eb688280e3ee68474ad0fa4ae4b9bcc3133";
const RPC_URL = "http://localhost:8545";
const PRIVATE_FROM = "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=";
const PRIVATE_FOR = ["85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE="];
const PRIVATE_ROM_ADDRESS = "0xf74e1087dd5b68fdd089c91736d1e38e1d0ebe60";
const USER_ADDRESS = "0x71d88765b4956b14a4c85cebc926334ae5bfd7a4";
const PRIVACY_GROUP_ID = "04R7n27BfNa+muLV+rR2eGY17jiwWSC3D+0dpS4MSkY=";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const privateFromBytes = Buffer.from(PRIVATE_FROM, "base64");
const privateForBytes = PRIVATE_FOR.map(k => Buffer.from(k, "base64"));

async function sendPrivateTx({ nonce, gasPrice, to, data }) {
  const nonceBytes = nonce === 0 ? new Uint8Array(0) : ethers.toBeArray(nonce);
  const toBytes = to ? ethers.getBytes(to) : new Uint8Array(0);

  const preimage = [
    nonceBytes,
    ethers.toBeArray(gasPrice),
    ethers.toBeArray(4000000),   // gasLimit
    toBytes,
    new Uint8Array(0),
    ethers.getBytes(data),
    privateFromBytes,
    privateForBytes,
    Buffer.from("restricted", "utf-8")
  ];

  const preimageRlp = ethers.encodeRlp(preimage);
  const signingHash = ethers.keccak256(preimageRlp);
  const sig = wallet.signingKey.sign(signingHash);

  const signed = [
    nonceBytes,
    ethers.toBeArray(gasPrice),
    ethers.toBeArray(4000000),
    toBytes,
    new Uint8Array(0),
    ethers.getBytes(data),
    ethers.toBeArray(sig.v),
    ethers.getBytes(sig.r),
    ethers.getBytes(sig.s),
    privateFromBytes,
    privateForBytes,
    Buffer.from("restricted", "utf-8")
  ];

  const rawTx = ethers.encodeRlp(signed);
  return provider.send("eea_sendRawTransaction", [rawTx]);
}

async function waitForPrivateReceipt(txHash, retries = 30) {
  for (let i = 0; i < retries; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const receipt = await provider.send("priv_getTransactionReceipt", [txHash]).catch(() => null);
    if (receipt) return receipt;
  }
  throw new Error("Timeout waiting for private receipt: " + txHash);
}

async function main() {
  console.log("Using PrivacyGroupId:", PRIVACY_GROUP_ID);

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || BigInt(1000);

  // 1. Deploy Private USDT
  const usdtArtifactPath = "/Users/fayas/Downloads/ICO-Application/react-ico/besu-lab/rom-token/artifacts/contracts/USDT.sol/USDT.json";
  const usdtArtifact = JSON.parse(fs.readFileSync(usdtArtifactPath, "utf-8"));
  
  let nonceHex = await provider.send("priv_getTransactionCount", [wallet.address, PRIVACY_GROUP_ID]);
  let nonce = parseInt(nonceHex, 16);
  console.log(`USDT deployment nonce: ${nonce}`);
  
  console.log("Deploying Private USDT...");
  const usdtDeployHash = await sendPrivateTx({ nonce, gasPrice, to: null, data: usdtArtifact.bytecode });
  console.log("USDT Deploy hash:", usdtDeployHash);
  const usdtReceipt = await waitForPrivateReceipt(usdtDeployHash);
  const privateUsdtAddress = usdtReceipt.contractAddress;
  console.log("✅ Private USDT deployed at:", privateUsdtAddress);

  // 2. Deploy Private ROMICO
  const icoArtifactPath = "/Users/fayas/Downloads/ICO-Application/react-ico/besu-lab/rom-token/artifacts/contracts/ico.sol/ROMICO.json";
  const icoArtifact = JSON.parse(fs.readFileSync(icoArtifactPath, "utf-8"));
  
  const icoIface = new ethers.Interface(icoArtifact.abi);
  const constructorArgs = icoIface.encodeDeploy([
    wallet.address,
    wallet.address,
    PRIVATE_ROM_ADDRESS,
    privateUsdtAddress
  ]);
  const icoInitcode = icoArtifact.bytecode + constructorArgs.slice(2);

  nonceHex = await provider.send("priv_getTransactionCount", [wallet.address, PRIVACY_GROUP_ID]);
  nonce = parseInt(nonceHex, 16);
  console.log(`ROMICO deployment nonce: ${nonce}`);

  console.log("Deploying Private ROMICO...");
  const icoDeployHash = await sendPrivateTx({ nonce, gasPrice, to: null, data: icoInitcode });
  console.log("ICO Deploy hash:", icoDeployHash);
  const icoReceipt = await waitForPrivateReceipt(icoDeployHash);
  const privateIcoAddress = icoReceipt.contractAddress;
  console.log("✅ Private ROMICO deployed at:", privateIcoAddress);

  // 3. Fund Private ROMICO with Private ROM
  const romIface = new ethers.Interface([
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address) view returns (uint256)"
  ]);
  
  const transferAmount = ethers.parseEther("500000"); // 500,000 ROM
  const transferCalldata = romIface.encodeFunctionData("transfer", [privateIcoAddress, transferAmount]);

  nonceHex = await provider.send("priv_getTransactionCount", [wallet.address, PRIVACY_GROUP_ID]);
  nonce = parseInt(nonceHex, 16);
  console.log(`Funding ROMICO nonce: ${nonce}`);

  console.log("Transferring Private ROM to Private ROMICO...");
  const transferHash = await sendPrivateTx({
    nonce,
    gasPrice,
    to: PRIVATE_ROM_ADDRESS,
    data: transferCalldata
  });
  await waitForPrivateReceipt(transferHash);
  console.log("✅ Private ROM tokens transferred to Private ROMICO.");

  // 4. Mint/Transfer Private USDT to User
  const usdtIface = new ethers.Interface([
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address) view returns (uint256)"
  ]);
  
  const usdtAmount = ethers.parseUnits("3000", 6); // 3,000 USDT
  const usdtTransferCalldata = usdtIface.encodeFunctionData("transfer", [USER_ADDRESS, usdtAmount]);

  nonceHex = await provider.send("priv_getTransactionCount", [wallet.address, PRIVACY_GROUP_ID]);
  nonce = parseInt(nonceHex, 16);
  console.log(`Transferring USDT nonce: ${nonce}`);

  console.log("Transferring Private USDT to user wallet...");
  const usdtTransferHash = await sendPrivateTx({
    nonce,
    gasPrice,
    to: privateUsdtAddress,
    data: usdtTransferCalldata
  });
  await waitForPrivateReceipt(usdtTransferHash);
  console.log("✅ Private USDT transferred to user wallet.");
  
  console.log("\n=================================================");
  console.log("PRIVATE_USDT_ADDRESS:", privateUsdtAddress);
  console.log("PRIVATE_ROMICO_ADDRESS:", privateIcoAddress);
  console.log("=================================================");
}

main().catch(console.error);
