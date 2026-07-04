async function main() {
  const hexKey = "fb07eec0def5d544e4d5a8657073fd3d8d37da4cee7c629274facc8a2a17e34f";
  const base64Key = Buffer.from(hexKey, "hex").toString("base64");
  console.log("Base64 Key:", base64Key);

  try {
    const res = await fetch("http://localhost:9101/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: base64Key,
        to: "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8="
      })
    });
    console.log("Tessera Response status:", res.status);
    const data = await res.json();
    console.log("Tessera Response:", data);
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main().catch(console.error);
