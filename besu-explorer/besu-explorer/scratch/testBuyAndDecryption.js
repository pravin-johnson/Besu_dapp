const { ethers } = require("ethers");

const OFFC_SIGNER_KEY = "f02b8ba9cc5bcf8a77a3de9004917eb688280e3ee68474ad0fa4ae4b9bcc3133";
const RPC_URL = "http://localhost:8545";
const provider = new ethers.JsonRpcProvider(RPC_URL);
const BUYER_KEY = "629c62a6f33b6493b5f663c9e977ce2f0321ee180a713c463a88ea6959c8da8b";
const wallet = new ethers.Wallet(BUYER_KEY, provider);

const ROMICO_ADDRESS = "0x15Ac0c5ece00CF08b30a5138cb2776603E04CC72";
const USDT_ADDRESS = "0x0d0d2B8C892D8f44733BFe8a657e1D9D4Fa9996C";

const PRIVATE_ROMICO_ADDRESS = "0x4d674208c3411d424c4918a2d81bf5d8a7632054";
const PRIVATE_USDT_ADDRESS = "0x0070d3b751215b994de03684a5d0a360b124dfb3";

const PRIVATE_FROM = "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=";
const PRIVATE_FOR = ["85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE="];
const PRIVACY_GROUP_ID = "04R7n27BfNa+muLV+rR2eGY17jiwWSC3D+0dpS4MSkY=";

async function fetchTxDetails(txHash) {
  const url = `http://localhost:3001/tx/${txHash}`;
  const res = await fetch(url);
  return res.json();
}

async function signPurchaseData(recipient, caller, amount, verifyingContract) {
  const nonce = Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000);
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  const domain = {
    name: "ROMICO",
    version: "1",
    chainId: 1337,
    verifyingContract: verifyingContract,
  };

  const types = {
    Purchase: [
      { name: "recipient", type: "address" },
      { name: "caller", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const value = {
    recipient,
    caller,
    amount,
    nonce,
    deadline,
  };

  const signerWallet = new ethers.Wallet(OFFC_SIGNER_KEY);
  const signature = await signerWallet.signTypedData(domain, types, value);
  const sig = ethers.Signature.from(signature);

  return [sig.v, sig.r, sig.s, nonce.toString(), deadline.toString()];
}

async function main() {
  console.log("Wallet address:", wallet.address);

  // 1. --- PUBLIC ICO PURCHASE ---
  console.log("\n--- Performing Public Purchase ---");
  const pubUsdtContract = new ethers.Contract(USDT_ADDRESS, [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
  ], wallet);

  const buyAmount = ethers.parseUnits("15", 6); // 15 USDT (above min 10)
  
  console.log("Approving Public USDT...");
  const pubApproveTx = await pubUsdtContract.approve(ROMICO_ADDRESS, buyAmount);
  await pubApproveTx.wait();
  console.log("Public approval succeeded:", pubApproveTx.hash);

  const pubIcoContract = new ethers.Contract(ROMICO_ADDRESS, [
    "function buyToken(address recipient, uint256 amount, (uint8 v, bytes32 r, bytes32 s, uint256 nonce, uint256 deadline) sig) external"
  ], wallet);

  const pubSig = await signPurchaseData(wallet.address, wallet.address, buyAmount, ROMICO_ADDRESS);
  console.log("Buying ROM tokens (Public)...");
  const pubBuyTx = await pubIcoContract.buyToken(wallet.address, buyAmount, pubSig);
  await pubBuyTx.wait();
  console.log("Public purchase succeeded! Tx hash:", pubBuyTx.hash);

  // 2. --- PRIVATE ICO PURCHASE ---
  console.log("\n--- Performing Private Purchase ---");
  console.log("Approving Private USDT via API...");
  const privApproveRes = await fetch(`http://localhost:3001/contract/${PRIVATE_USDT_ADDRESS}/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      functionName: "approve",
      params: [PRIVATE_ROMICO_ADDRESS, buyAmount.toString()],
      isPrivate: true,
      privateFrom: PRIVATE_FROM,
      privateFor: PRIVATE_FOR
    })
  });
  const privApproveData = await privApproveRes.json();
  if (!privApproveRes.ok) throw new Error(privApproveData.error || "Private approval failed");
  console.log("Private approval succeeded! Tx hash:", privApproveData.hash);

  console.log("Buying ROM tokens (Private) via API...");
  const privSig = await signPurchaseData(wallet.address, wallet.address, buyAmount, PRIVATE_ROMICO_ADDRESS);
  
  const privBuyRes = await fetch(`http://localhost:3001/contract/${PRIVATE_ROMICO_ADDRESS}/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      functionName: "buyToken",
      params: [
        wallet.address,
        buyAmount.toString(),
        privSig
      ],
      isPrivate: true,
      privateFrom: PRIVATE_FROM,
      privateFor: PRIVATE_FOR
    })
  });
  const privBuyData = await privBuyRes.json();
  if (!privBuyRes.ok) throw new Error(privBuyData.error || "Private purchase failed");
  console.log("Private purchase succeeded! Tx hash:", privBuyData.hash);

  // 3. --- VERIFY AND CHECK DECRYPTION ---
  console.log("\nWaiting 5 seconds for block indexer to process...");
  await new Promise(r => setTimeout(r, 5000));

  console.log("\nFetching details for Public Buy Tx...");
  const pubDetails = await fetchTxDetails(pubBuyTx.hash);
  console.log("Public Tx details:", JSON.stringify(pubDetails, null, 2));

  console.log("\nFetching details for Private Buy Tx...");
  const privDetails = await fetchTxDetails(privBuyData.hash);
  console.log("Private Tx details:", JSON.stringify(privDetails, null, 2));
}

main().catch(console.error);
