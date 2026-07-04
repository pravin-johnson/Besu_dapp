const { ethers } = require("ethers");

const privateKey = "f02b8ba9cc5bcf8a77a3de9004917eb688280e3ee68474ad0fa4ae4b9bcc3133";
const wallet = new ethers.Wallet(privateKey);

const to = "0xDDBE9D732b160A596108aa33566bd8c3220b0B03";
const data = "0xa9059cbb000000000000000000000000f179a1ef73629486fff2c24dc12d2799d00c316a000000000000000000000000000000000000000000000000000000000000000c"; // transfer to f179... 12 tokens (0xc)
const nonce = 0;
const gasPrice = ethers.parseUnits("1", "gwei");
const gasLimit = 3000000;
const chainId = 1337;

const privateFrom = "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=";
const privateFor = ["85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE="];
const restriction = "restricted";

const txParams = {
  type: 0,
  to: to,
  data: data,
  nonce: nonce,
  gasLimit: gasLimit,
  gasPrice: gasPrice,
  chainId: chainId,
  value: 0
};

async function run() {
  try {
    // 1. Sign standard transaction using ethers wallet
    const signedTx = await wallet.signTransaction(txParams);
    console.log("Signed public transaction:", signedTx);

    // 2. Decode the signed transaction to extract v, r, s
    const parsedTx = ethers.Transaction.from(signedTx);
    console.log("Parsed public transaction signature components:", {
      v: parsedTx.signature.v,
      r: parsedTx.signature.r,
      s: parsedTx.signature.s
    });

    // 3. Prepare EEA private transaction RLP array
    // Fields order: nonce, gasPrice, gasLimit, to, value, data, v, r, s, privateFrom, privateFor, restriction
    const eeaTxArray = [
      ethers.toBeArray(nonce),
      ethers.toBeArray(gasPrice),
      ethers.toBeArray(gasLimit),
      to ? ethers.getBytes(to) : new Uint8Array(0),
      ethers.toBeArray(0), // value
      ethers.getBytes(data),
      ethers.toBeArray(parsedTx.signature.networkV),
      ethers.getBytes(parsedTx.signature.r),
      ethers.getBytes(parsedTx.signature.s),
      Buffer.from(privateFrom, "base64"),
      privateFor.map(k => Buffer.from(k.trim(), "base64")),
      Buffer.from(restriction, "utf-8")
    ];

    // 4. Encode as RLP
    const eeaRawTxHex = ethers.encodeRlp(eeaTxArray);
    console.log("EEA Raw Transaction Hex:", eeaRawTxHex);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
