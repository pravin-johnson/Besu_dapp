const crypto = require("crypto");

const k1 = "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=";
const k2 = "85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE=";

const target = "04R7n27BfNa+muLV+rR2eGY17jiwWSC3D+0dpS4MSkY=";

function check(name, hashBytes) {
  const b64 = hashBytes.toString("base64");
  console.log(`${name}: ${b64} ${b64 === target ? "✅ MATCH" : ""}`);
}

// Variation 1: Sort raw bytes, concatenate, hash
{
  const keys = [Buffer.from(k1, "base64"), Buffer.from(k2, "base64")];
  keys.sort(Buffer.compare);
  const concat = Buffer.concat(keys);
  check("V1 (Sort bytes, concat bytes, hash)", crypto.createHash("sha256").update(concat).digest());
}

// Variation 2: Sort base64 strings, decode, concatenate, hash
{
  const strings = [k1, k2].sort();
  const keys = strings.map(s => Buffer.from(s, "base64"));
  const concat = Buffer.concat(keys);
  check("V2 (Sort b64 strings, concat bytes, hash)", crypto.createHash("sha256").update(concat).digest());
}

// Variation 3: Sort base64 strings, concatenate strings, hash string bytes
{
  const strings = [k1, k2].sort();
  const concatStr = strings.join("");
  check("V3 (Sort b64 strings, concat strings, hash)", crypto.createHash("sha256").update(concatStr).digest());
}

// Variation 4: Sort raw bytes, concatenate strings, hash
{
  const keys = [Buffer.from(k1, "base64"), Buffer.from(k2, "base64")];
  keys.sort(Buffer.compare);
  const strings = keys.map(k => k.toString("base64"));
  const concatStr = strings.join("");
  check("V4 (Sort bytes, concat strings, hash)", crypto.createHash("sha256").update(concatStr).digest());
}

// Variation 5: No sorting, just k1 + k2
{
  const concat = Buffer.concat([Buffer.from(k1, "base64"), Buffer.from(k2, "base64")]);
  check("V5 (No sort k1+k2 bytes, hash)", crypto.createHash("sha256").update(concat).digest());
}

// Variation 6: No sorting, just k2 + k1
{
  const concat = Buffer.concat([Buffer.from(k2, "base64"), Buffer.from(k1, "base64")]);
  check("V6 (No sort k2+k1 bytes, hash)", crypto.createHash("sha256").update(concat).digest());
}
