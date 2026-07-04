const { Pool } = require("pg");

async function main() {
  const pool = new Pool({
    host: "localhost",
    port: 5433,
    user: "postgres",
    password: "password",
    database: "besu_explorer"
  });

  const res = await pool.query("SELECT * FROM transactions WHERE block_number = 79091");
  console.log("Transactions for block 79091:", JSON.stringify(res.rows, null, 2));

  await pool.end();
}

main().catch(console.error);
