const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const hash = "0xe7b4b60b1cb5d6236e585cf9095f97e5f8f2e7684ec624bee8ebfa912426fe4";
  
  try {
    console.log("Calling priv_getPrivateTransaction...");
    const res = await provider.send("priv_getPrivateTransaction", [hash]);
    console.log("Result:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("Error calling priv_getPrivateTransaction:", err);
  }
}

main().catch(console.error);
