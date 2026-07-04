const crypto = require("crypto");

const k1 = "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=";
const k2 = "85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE=";

const keys = [Buffer.from(k1, "base64"), Buffer.from(k2, "base64")];
keys.sort(Buffer.compare);
const concat = Buffer.concat(keys);
const hash = crypto.createHash("sha256").update(concat).digest();

console.log("SHA-256 Base64:", hash.toString("base64"));
console.log("SHA-256 Hex:", hash.toString("hex"));
