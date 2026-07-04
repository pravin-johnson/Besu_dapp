const crypto = require("crypto");

const keys = [
  "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=",
  "85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE=",
  "zLkNGvjrXBaqPir+Yc9rmcMGEq8yQd/jK3Vm7eJ3xmI=",
  "i8jRh9Ub6BNjJGpysWzO9VAy1+7tSzgt5CZaKQfu3VI="
].map(k => Buffer.from(k, "base64"));

keys.sort(Buffer.compare);
const concat = Buffer.concat(keys);
const hash = crypto.createHash("sha256").update(concat).digest();

console.log("4 Nodes SHA-256 Base64:", hash.toString("base64"));
