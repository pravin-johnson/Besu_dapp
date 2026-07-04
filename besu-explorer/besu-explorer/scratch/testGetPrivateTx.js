const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const txHash = "0x10e1e2f5951def4acbfc2537a7a0bbdb60b416761bc4d949b8a07d1b83887a34";
  
  const methods = [
    "priv_getPrivateTransaction",
    "eea_getTransactionByHash",
    "eea_getTransaction"
  ];

  for (const method of methods) {
    try {
      console.log(`Trying ${method}...`);
      const result = await provider.send(method, [txHash]);
      console.log(`SUCCESS ${method}:`, JSON.stringify(result, null, 2));
      return;
    } catch (e) {
      console.error(`FAILED ${method}:`, e.message);
    }
  }
}

main();
