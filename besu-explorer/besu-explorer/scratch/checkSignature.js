const { ethers } = require("ethers");

async function run() {
  const privateKey = "f02b8ba9cc5bcf8a77a3de9004917eb688280e3ee68474ad0fa4ae4b9bcc3133";
  const wallet = new ethers.Wallet(privateKey);
  console.log("Expected Address:", wallet.address);

  const nonce = 0;
  const gasPrice = 1000;
  const gasLimit = 3000000;
  const to = "0xDDBE9D732b160A596108aa33566bd8c3220b0B03";
  const data = "0xa9059cbb00000000000000000000000065e384b05d72670af7223514991df5a13a7854220000000000000000000000000000000000000000000000000de0b6b3a7640000";

  // Case A: Sign with EIP-155 chainId 1337
  const txEIP155 = {
    type: 0,
    to: to,
    data: data,
    nonce: nonce,
    gasLimit: gasLimit,
    gasPrice: gasPrice,
    chainId: 1337
  };
  const signedEIP155 = await wallet.signTransaction(txEIP155);
  const parsedEIP155 = ethers.Transaction.from(signedEIP155);

  // Case B: Sign without EIP-155
  const txLegacy = {
    type: 0,
    to: to,
    data: data,
    nonce: nonce,
    gasLimit: gasLimit,
    gasPrice: gasPrice
  };
  const signedLegacy = await wallet.signTransaction(txLegacy);
  const parsedLegacy = ethers.Transaction.from(signedLegacy);

  // Define hashes for both preimages
  const RlpArray = [
    ethers.toBeArray(nonce),
    ethers.toBeArray(gasPrice),
    ethers.toBeArray(gasLimit),
    ethers.getBytes(to),
    ethers.toBeArray(0),
    ethers.getBytes(data)
  ];
  
  // Non-EIP155 hash
  const hashLegacy = ethers.keccak256(ethers.encodeRlp(RlpArray));

  // EIP-155 hash
  const RlpArrayEIP155 = [
    ethers.toBeArray(nonce),
    ethers.toBeArray(gasPrice),
    ethers.toBeArray(gasLimit),
    ethers.getBytes(to),
    ethers.toBeArray(0),
    ethers.getBytes(data),
    ethers.toBeArray(1337),
    ethers.toBeArray(0),
    ethers.toBeArray(0)
  ];
  const hashEIP155 = ethers.keccak256(ethers.encodeRlp(RlpArrayEIP155));

  console.log("\n--- TEST 1: Using EIP-155 Signature components (r, s from EIP-155 sign) ---");
  for (const v of [27, 28, 37, 38, 2709, 2710]) {
    try {
      const recoveredLegacyHash = ethers.recoverAddress(hashLegacy, {
        r: parsedEIP155.signature.r,
        s: parsedEIP155.signature.s,
        v: v
      });
      console.log(`v = ${v} on Legacy Hash -> ${recoveredLegacyHash}`);
    } catch(e) {}
    try {
      const recoveredEIPHash = ethers.recoverAddress(hashEIP155, {
        r: parsedEIP155.signature.r,
        s: parsedEIP155.signature.s,
        v: v
      });
      console.log(`v = ${v} on EIP-155 Hash -> ${recoveredEIPHash}`);
    } catch(e) {}
  }

  console.log("\n--- TEST 2: Using Legacy Signature components (r, s from legacy sign) ---");
  for (const v of [27, 28, 37, 38, 2709, 2710]) {
    try {
      const recoveredLegacyHash = ethers.recoverAddress(hashLegacy, {
        r: parsedLegacy.signature.r,
        s: parsedLegacy.signature.s,
        v: v
      });
      console.log(`v = ${v} on Legacy Hash -> ${recoveredLegacyHash}`);
    } catch(e) {}
    try {
      const recoveredEIPHash = ethers.recoverAddress(hashEIP155, {
        r: parsedLegacy.signature.r,
        s: parsedLegacy.signature.s,
        v: v
      });
      console.log(`v = ${v} on EIP-155 Hash -> ${recoveredEIPHash}`);
    } catch(e) {}
  }
}

run();
