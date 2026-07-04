const { Pool } = require("pg");

async function main() {
  const pool = new Pool({
    host: "localhost",
    port: 5433,
    user: "postgres",
    password: "password",
    database: "besu_explorer"
  });

  const res = await pool.query("SELECT hash, block_number, from_address, to_address, private_from, private_for, privacy_group_id FROM transactions WHERE is_private = true");
  console.log("Private Transactions in DB:", JSON.stringify(res.rows, null, 2));

  await pool.end();
}

main().catch(console.error);
