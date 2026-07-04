/**
 * deployAndTransferPrivate.js
 *
 * 1. Deploys ROM token as a PRIVATE contract (privateFrom=tessera1, privateFor=tessera2)
 * 2. Performs a private transfer to a recipient
 *
 * EEA private tx signing:
 *   signingHash = keccak256(RLP([nonce, gasPrice, gasLimit, to, value, data,
 *                                 privateFrom, privateFor, restriction]))
 *
 *   For deployment, `to` = empty bytes (new Uint8Array(0))
 */

const { ethers } = require("ethers");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PRIVATE_KEY = "f02b8ba9cc5bcf8a77a3de9004917eb688280e3ee68474ad0fa4ae4b9bcc3133";
const RPC_URL = "http://localhost:8545";
const PRIVATE_FROM = "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=";
const PRIVATE_FOR = ["85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE="];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const privateFromBytes = Buffer.from(PRIVATE_FROM, "base64");
const privateForBytes = PRIVATE_FOR.map(k => Buffer.from(k, "base64"));

// Compute privacyGroupId (SHA-256 of sorted, concatenated keys)
function computePrivacyGroupId(privateFrom, privateForList) {
  const keys = [Buffer.from(privateFrom, "base64")];
  for (const k of privateForList) keys.push(Buffer.from(k, "base64"));
  keys.sort(Buffer.compare);
  const concat = Buffer.concat(keys);
  return crypto.createHash("sha256").update(concat).digest().toString("base64");
}

// Build + sign + send an EEA private transaction
async function sendPrivateTx({ nonce, gasPrice, to, data }) {
  const nonceBytes = nonce === 0 ? new Uint8Array(0) : ethers.toBeArray(nonce);
  const toBytes = to ? ethers.getBytes(to) : new Uint8Array(0); // empty for deployment

  const preimage = [
    nonceBytes,
    ethers.toBeArray(gasPrice),
    ethers.toBeArray(3000000),   // gasLimit
    toBytes,                      // empty = contract creation
    new Uint8Array(0),            // value = 0
    ethers.getBytes(data),        // calldata / initcode
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
    ethers.toBeArray(3000000),
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

async function waitForPrivateReceipt(txHash, retries = 20) {
  for (let i = 0; i < retries; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const receipt = await provider.send("priv_getTransactionReceipt", [txHash]).catch(() => null);
    if (receipt) return receipt;
  }
  throw new Error("Timeout waiting for private receipt");
}

async function main() {
  console.log("Wallet:", wallet.address);

  const privacyGroupId = computePrivacyGroupId(PRIVATE_FROM, PRIVATE_FOR);
  console.log("PrivacyGroupId:", privacyGroupId);

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || BigInt(1000);

  // ── Step 1: Deploy ROM token privately ──────────────────────────────────────
  const artifactPath = "/Users/fayas/Downloads/besu-lab/rom-token/artifacts/contracts/ROM.sol/ROM.json";
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const initcode = artifact.bytecode;

  const deployNonceHex = await provider.send("priv_getTransactionCount", [wallet.address, privacyGroupId]);
  const deployNonce = parseInt(deployNonceHex, 16);
  console.log("Deploy nonce:", deployNonce);

  console.log("Deploying ROM token privately...");
  const deployHash = await sendPrivateTx({ nonce: deployNonce, gasPrice, to: null, data: initcode });
  console.log("Deploy tx hash:", deployHash);

  const deployReceipt = await waitForPrivateReceipt(deployHash);
  console.log("Deploy receipt:", JSON.stringify(deployReceipt, null, 2));

  if (deployReceipt.status === "0x0") {
    console.error("❌ Deployment failed:", deployReceipt.revertReason || "(no revert reason)");
    return;
  }

  const privateContractAddress = deployReceipt.contractAddress;
  console.log("✅ ROM deployed privately at:", privateContractAddress);

  // ── Step 2: Call balanceOf to verify ────────────────────────────────────────
  const ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)"
  ];
  const iface = new ethers.Interface(ABI);

  const balanceCalldata = iface.encodeFunctionData("balanceOf", [wallet.address]);
  const balRaw = await provider.send("priv_call", [
    privacyGroupId,
    { to: privateContractAddress, data: balanceCalldata },
    "latest"
  ]);
  const [bal] = iface.decodeFunctionResult("balanceOf", balRaw);
  console.log("Private ROM balance of deployer:", ethers.formatEther(bal), "ROM");

  // ── Step 3: Private transfer ─────────────────────────────────────────────────
  const recipient = "0x65e384b05d72670af7223514991df5a13a785422";
  const amount = ethers.parseEther("1000");
  const transferCalldata = iface.encodeFunctionData("transfer", [recipient, amount]);

  const transferNonceHex = await provider.send("priv_getTransactionCount", [wallet.address, privacyGroupId]);
  const transferNonce = parseInt(transferNonceHex, 16);

  console.log("Sending private transfer...");
  const transferHash = await sendPrivateTx({
    nonce: transferNonce,
    gasPrice,
    to: privateContractAddress,
    data: transferCalldata
  });
  console.log("Transfer tx hash:", transferHash);

  const transferReceipt = await waitForPrivateReceipt(transferHash);
  console.log("Transfer receipt status:", transferReceipt.status);

  if (transferReceipt.status === "0x1") {
    console.log("✅ Private transfer of 1000 ROM succeeded!");
  } else {
    console.error("❌ Transfer failed:", transferReceipt.revertReason || "(no revert reason)");
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("\n📋 SUMMARY");
  console.log("Private contract address:", privateContractAddress);
  console.log("Privacy group ID:", privacyGroupId);
  console.log("Deploy tx:", deployHash);
  console.log("Transfer tx:", transferHash);
}

main().catch(console.error);
