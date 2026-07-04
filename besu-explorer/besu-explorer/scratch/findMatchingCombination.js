const crypto = require("crypto");

const keys = [
  "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=", // Tessera 1
  "85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE=", // Tessera 2
  "zLkNGvjrXBaqPir+Yc9rmcMGEq8yQd/jK3Vm7eJ3xmI=", // Tessera 3
  "i8jRh9Ub6BNjJGpysWzO9VAy1+7tSzgt5CZaKQfu3VI="  // Tessera 4
];

const target = "04R7n27BfNa+muLV+rR2eGY17jiwWSC3D+0dpS4MSkY=";

// Generate all combinations of length >= 1
function getCombinations(array) {
  const result = [];
  const f = function(active, rest) {
    if (active.length > 0) result.push(active);
    for (let i = 0; i < rest.length; i++) {
      f(active.concat([rest[i]]), rest.slice(i + 1));
    }
  };
  f([], array);
  return result;
}

const combinations = getCombinations(keys);

for (const combo of combinations) {
  // Sort and hash
  const comboBuffers = combo.map(k => Buffer.from(k, "base64"));
  comboBuffers.sort(Buffer.compare);
  const concat = Buffer.concat(comboBuffers);
  const hash = crypto.createHash("sha256").update(concat).digest("base64");

  if (hash === target) {
    console.log(`✅ FOUND MATCH! members:`, combo);
    process.exit(0);
  }
}

console.log("❌ No combination matched the target group ID.");
