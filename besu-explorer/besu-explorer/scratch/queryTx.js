const { Pool } = require("pg");

async function main() {
  const pool = new Pool({
    host: "localhost",
    port: 5433,
    user: "postgres",
    password: "password",
    database: "besu_explorer"
  });

  const hash = "0xe7b4b60b1cb5d6236e585cf9095f97e5f8f2e7684ec624bee8ebfa912426fe4";
  const res = await pool.query("SELECT * FROM transactions WHERE hash = $1", [hash]);
  console.log("Transaction Row:", JSON.stringify(res.rows[0], null, 2));

  const transfersRes = await pool.query("SELECT * FROM token_transfers WHERE tx_hash = $1", [hash]);
  console.log("Token Transfers:", JSON.stringify(transfersRes.rows, null, 2));

  await pool.end();
}

main().catch(console.error);
