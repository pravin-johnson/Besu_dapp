const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { ethers } = require("ethers");

const app = express();

app.use(cors());
app.use(express.json());

const provider = new ethers.JsonRpcProvider(
  "http://127.0.0.1:8545"
);

// PostgreSQL Pool
const pool = new Pool({
  host: "localhost",
  port: 5433,
  user: "postgres",
  password: "password",
  database: "besu_explorer"
});

const ROM_ADDRESS = "0x51Dc997cDB30770f82AB0f4EFB00863a6A42922a";
const PRIVATE_ROM_ADDRESS = "0xf74e1087dd5b68fdd089c91736d1e38e1d0ebe60";

const USDT_ADDRESS = "0x0d0d2B8C892D8f44733BFe8a657e1D9D4Fa9996C";
const PRIVATE_USDT_ADDRESS = "0x0070d3b751215b994de03684a5d0a360b124dfb3";

const ROMICO_ADDRESS = "0x15Ac0c5ece00CF08b30a5138cb2776603E04CC72";
const PRIVATE_ROMICO_ADDRESS = "0x4d674208c3411d424c4918a2d81bf5d8a7632054";

const ROM_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function buyToken(address recipient, uint256 amount, (uint8 v, bytes32 r, bytes32 s, uint256 nonce, uint256 deadline) sig) external"
];
const romContract = new ethers.Contract(ROM_ADDRESS, ROM_ABI, provider);

// 1. Initialize Database Schema
const initDb = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        number BIGINT PRIMARY KEY,
        hash VARCHAR(66) UNIQUE NOT NULL,
        miner VARCHAR(42) NOT NULL,
        timestamp BIGINT NOT NULL,
        gas_used NUMERIC NOT NULL,
        gas_limit NUMERIC NOT NULL,
        tx_count INT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        hash VARCHAR(66) PRIMARY KEY,
        block_number BIGINT REFERENCES blocks(number) ON DELETE CASCADE,
        from_address VARCHAR(42) NOT NULL,
        to_address VARCHAR(42),
        value VARCHAR(78) NOT NULL,
        gas_price VARCHAR(78) NOT NULL,
        gas_limit VARCHAR(78) NOT NULL,
        gas_used VARCHAR(78) NOT NULL,
        status VARCHAR(20) NOT NULL,
        timestamp BIGINT NOT NULL,
        is_private BOOLEAN DEFAULT FALSE,
        private_from VARCHAR(66),
        private_for TEXT,
        privacy_group_id VARCHAR(66)
      );

      CREATE TABLE IF NOT EXISTS token_transfers (
        id SERIAL PRIMARY KEY,
        tx_hash VARCHAR(66) REFERENCES transactions(hash) ON DELETE CASCADE,
        block_number BIGINT NOT NULL,
        token_address VARCHAR(42) NOT NULL,
        from_address VARCHAR(42) NOT NULL,
        to_address VARCHAR(42) NOT NULL,
        value VARCHAR(78) NOT NULL,
        symbol VARCHAR(50) DEFAULT 'ROM',
        timestamp BIGINT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(from_address);
      CREATE INDEX IF NOT EXISTS idx_tx_to ON transactions(to_address);
      CREATE INDEX IF NOT EXISTS idx_transfers_from ON token_transfers(from_address);
      CREATE INDEX IF NOT EXISTS idx_transfers_to ON token_transfers(to_address);

      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        wallet_address VARCHAR(255) UNIQUE NOT NULL,
        ptc_ref_id VARCHAR(20) UNIQUE NOT NULL,
        referred_by VARCHAR(20) DEFAULT 'ADMIN',
        referrer_address VARCHAR(255) DEFAULT '0x90F8bf6A479f320ced073E1E1888658D2613e324',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ico_purchases (
        id SERIAL PRIMARY KEY,
        address VARCHAR(255) NOT NULL,
        crypto_value VARCHAR(100) NOT NULL,
        payment_type VARCHAR(100) NOT NULL,
        ptc_tokens VARCHAR(100) NOT NULL,
        trans_hash VARCHAR(255) UNIQUE NOT NULL,
        usd_value_of_crypto VARCHAR(100) NOT NULL,
        sale_type VARCHAR(100) NOT NULL,
        status VARCHAR(100) DEFAULT 'success',
        referrer_bonus VARCHAR(100) DEFAULT '0.00',
        referrer_address VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS referral_claims (
        id SERIAL PRIMARY KEY,
        referrer_id VARCHAR(255) NOT NULL,
        referred_user_id VARCHAR(255) NOT NULL,
        amount VARCHAR(100) NOT NULL,
        status VARCHAR(100) DEFAULT 'Pending',
        transaction_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS token_sales (
        id SERIAL PRIMARY KEY,
        type VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        token_quantity VARCHAR(100) NOT NULL,
        minimum_purchase VARCHAR(100) NOT NULL,
        maximum_purchase VARCHAR(100) NOT NULL,
        price VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        start_at TIMESTAMP NOT NULL,
        end_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        site_name VARCHAR(255) NOT NULL,
        owner_address VARCHAR(255) NOT NULL,
        referral_level1 VARCHAR(50) DEFAULT '10.00',
        kyc_enabled BOOLEAN DEFAULT FALSE,
        token_name VARCHAR(255) NOT NULL,
        token_symbol VARCHAR(50) NOT NULL,
        contract_address VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query("ALTER TABLE token_transfers ADD COLUMN IF NOT EXISTS symbol VARCHAR(50) DEFAULT 'ROM'");
    await client.query("ALTER TABLE token_transfers ADD COLUMN IF NOT EXISTS is_approval BOOLEAN DEFAULT FALSE");

    // Seed default admin
    const adminCheck = await client.query("SELECT * FROM admins LIMIT 1");
    if (adminCheck.rows.length === 0) {
      await client.query(
        "INSERT INTO admins (email, password) VALUES ('admin@psyche.com', 'Demo@123')"
      );
      console.log("Admin account seeded successfully");
    }

    // Seed default settings
    const settingsCheck = await client.query("SELECT * FROM settings LIMIT 1");
    if (settingsCheck.rows.length === 0) {
      await client.query(
        `INSERT INTO settings (site_name, owner_address, token_name, token_symbol, contract_address)
         VALUES ('ROM Token Sale', '0x90F8bf6A479f320ced073E1E1888658D2613e324', 'ROM Token', 'ROM', '0x51Dc997cDB30770f82AB0f4EFB00863a6A42922a')`
      );
      console.log("Default site settings seeded successfully");
    }

    // Seed default active sale
    const salesCheck = await client.query("SELECT * FROM token_sales LIMIT 1");
    if (salesCheck.rows.length === 0) {
      const now = new Date();
      const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await client.query(
        `INSERT INTO token_sales (type, name, token_quantity, minimum_purchase, maximum_purchase, price, status, start_at, end_at)
         VALUES ('Active Sale', 'Presale Phase 1', '1000000', '10', '10000', '10', 'active', $1, $2)`,
        [now, future]
      );
      console.log("Default active token sale seeded successfully");
    }

    console.log("PostgreSQL database initialized successfully");
  } catch (err) {
    console.error("Database initialization failed:", err);
  } finally {
    client.release();
  }
};

const tokenCache = {
  "0x0070d3b751215b994DE03684A5d0a360B124Dfb3": { symbol: "USDT", decimals: 6 },
  "0xF74E1087Dd5B68fDD089C91736d1E38E1d0ebe60": { symbol: "ROM", decimals: 18 }
};

const getTokenDetails = async (tokenAddress) => {
  const addr = ethers.getAddress(tokenAddress);
  if (tokenCache[addr]) {
    return tokenCache[addr];
  }
  try {
    const abi = [
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)"
    ];
    const contract = new ethers.Contract(addr, abi, provider);
    const [symbol, decimals] = await Promise.all([
      contract.symbol().catch(() => "UNKNOWN"),
      contract.decimals().catch(() => 18n)
    ]);
    tokenCache[addr] = { symbol, decimals: Number(decimals) };
    return tokenCache[addr];
  } catch (e) {
    return { symbol: "UNKNOWN", decimals: 18 };
  }
};

// 2. Database Sync Worker
let isSyncing = false;

const syncBlocks = async () => {
  if (isSyncing) return;
  isSyncing = true;
  
  try {
    let latestBlockOnChain = await provider.getBlockNumber();
    const dbRes = await pool.query("SELECT MAX(number) as max_num FROM blocks");
    let nextBlock = dbRes.rows[0].max_num !== null ? parseInt(dbRes.rows[0].max_num) + 1 : 0;
    
    if (nextBlock <= latestBlockOnChain) {
      console.log(`Syncing blocks: starting from #${nextBlock} to #${latestBlockOnChain}...`);
    }

    while (nextBlock <= latestBlockOnChain) {
      // Process in batches of 10 for performance
      const batchEnd = Math.min(nextBlock + 9, latestBlockOnChain);
      const promises = [];
      for (let i = nextBlock; i <= batchEnd; i++) {
        promises.push(provider.getBlock(i).catch(() => null));
      }
      const blocks = await Promise.all(promises);

      for (const block of blocks) {
        if (!block) continue;
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          
          await client.query(
            `INSERT INTO blocks (number, hash, miner, timestamp, gas_used, gas_limit, tx_count)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (number) DO NOTHING`,
            [
              block.number,
              block.hash,
              block.miner,
              block.timestamp,
              block.gasUsed.toString(),
              block.gasLimit.toString(),
              block.transactions.length
            ]
          );

          for (const txHash of block.transactions) {
            const [tx, receipt] = await Promise.all([
              provider.getTransaction(txHash),
              provider.getTransactionReceipt(txHash)
            ]);

            if (!tx || !receipt) continue;
            const status = receipt.status === 1 ? "Success" : "Failed";

            // Private Tx Identification
            const isPrivate = tx.to && (
              tx.to.toLowerCase() === "0x000000000000000000000000000000000000007c" ||
              tx.to.toLowerCase() === "0x000000000000000000000000000000000000007e"
            );
            let privateFrom = null;
            let privateFor = null;
            let privacyGroupId = null;

            let privReceipt = null;
            if (isPrivate) {
              try {
                privReceipt = await provider.send("priv_getTransactionReceipt", [tx.hash]);
                if (privReceipt) {
                  privateFrom = privReceipt.privateFrom || null;
                  privateFor = privReceipt.privateFor ? JSON.stringify(privReceipt.privateFor) : null;
                  privacyGroupId = privReceipt.privacyGroupId || null;
                }
              } catch (e) {
                // Method not supported/unauthorized
              }
            }

            await client.query(
              `INSERT INTO transactions (hash, block_number, from_address, to_address, value, gas_price, gas_limit, gas_used, status, timestamp, is_private, private_from, private_for, privacy_group_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
               ON CONFLICT (hash) DO NOTHING`,
              [
                tx.hash,
                block.number,
                tx.from,
                tx.to || null,
                ethers.formatEther(tx.value),
                ethers.formatUnits(tx.gasPrice || 0n, "gwei"),
                tx.gasLimit.toString(),
                receipt.gasUsed.toString(),
                status,
                block.timestamp,
                isPrivate,
                privateFrom,
                privateFor,
                privacyGroupId
              ]
            );

            // Index ERC20 Transfer and Approval logs
            const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
            const ERC20_APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
            const logsToProcess = (isPrivate && privReceipt && privReceipt.logs) ? privReceipt.logs : (receipt.logs || []);
            for (const log of logsToProcess) {
              if (log.topics && log.topics.length === 3) {
                const isTransfer = log.topics[0] === ERC20_TRANSFER_TOPIC;
                const isApproval = log.topics[0] === ERC20_APPROVAL_TOPIC;
                if (isTransfer || isApproval) {
                  const tokenAddress = log.address;
                  try {
                    const from = ethers.getAddress("0x" + log.topics[1].slice(26));
                    const to = ethers.getAddress("0x" + log.topics[2].slice(26));
                    const rawValue = BigInt(log.data);
                    
                    const tokenDetails = await getTokenDetails(tokenAddress);
                    const value = ethers.formatUnits(rawValue, tokenDetails.decimals);
                    const symbol = tokenDetails.symbol;

                    await client.query(
                      `INSERT INTO token_transfers (tx_hash, block_number, token_address, from_address, to_address, value, symbol, timestamp, is_approval)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                      [
                        tx.hash,
                        block.number,
                        tokenAddress,
                        from,
                        to,
                        value,
                        symbol,
                        block.timestamp,
                        isApproval
                      ]
                    );
                  } catch (e) {
                    // ignore bad log events
                  }
                }
              }
            }
          }
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`Error writing block #${block.number} to DB:`, err);
        } finally {
          client.release();
        }
      }

      nextBlock = batchEnd + 1;
      latestBlockOnChain = await provider.getBlockNumber();
    }
  } catch (err) {
    console.error("Sync loop error:", err);
  } finally {
    isSyncing = false;
  }
};

// 3. API ROUTES

// Get Latest Block Info
app.get("/block/latest", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM blocks ORDER BY number DESC LIMIT 1");
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No blocks indexed in DB yet" });
    }
    const row = result.rows[0];
    res.json({
      number: parseInt(row.number),
      hash: row.hash,
      miner: row.miner,
      timestamp: parseInt(row.timestamp),
      gasUsed: row.gas_used,
      gasLimit: row.gas_limit,
      txCount: row.tx_count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Recent Blocks (Last 10)
app.get("/blocks", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM blocks ORDER BY number DESC LIMIT 10");
    const formatted = result.rows.map(row => ({
      number: parseInt(row.number),
      hash: row.hash,
      validator: row.miner,
      txCount: row.tx_count,
      timestamp: parseInt(row.timestamp),
      gasUsed: row.gas_used,
      gasLimit: row.gas_limit
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Block by Number
app.get("/blocks/:number", async (req, res) => {
  try {
    const num = parseInt(req.params.number);
    const result = await pool.query("SELECT * FROM blocks WHERE number = $1", [num]);
    
    const txResult = await pool.query(
      `SELECT hash, from_address, to_address, value, timestamp, is_private 
       FROM transactions WHERE block_number = $1 ORDER BY hash`,
      [num]
    );

    const formattedTxs = txResult.rows.map(row => ({
      hash: row.hash,
      from: row.from_address,
      to: row.to_address,
      value: row.value,
      timestamp: parseInt(row.timestamp),
      isPrivate: row.is_private
    }));

    if (result.rows.length === 0) {
      // fallback to chain just in case
      const block = await provider.getBlock(num, true);
      if (!block) return res.status(404).json({ error: "Block not found" });
      
      const prefetchedTxs = block.prefetchedTransactions.map(tx => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: ethers.formatEther(tx.value),
        timestamp: block.timestamp,
        isPrivate: tx.to && (
          tx.to.toLowerCase() === "0x000000000000000000000000000000000000007c" ||
          tx.to.toLowerCase() === "0x000000000000000000000000000000000000007e"
        )
      }));

      return res.json({
        number: block.number,
        hash: block.hash,
        miner: block.miner,
        timestamp: block.timestamp,
        gasUsed: block.gasUsed.toString(),
        gasLimit: block.gasLimit.toString(),
        txCount: block.prefetchedTransactions.length,
        transactions: prefetchedTxs
      });
    }
    const row = result.rows[0];
    res.json({
      number: parseInt(row.number),
      hash: row.hash,
      miner: row.miner,
      timestamp: parseInt(row.timestamp),
      gasUsed: row.gas_used,
      gasLimit: row.gas_limit,
      txCount: parseInt(row.tx_count),
      transactions: formattedTxs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Address Details (ETH + ROM Balances + Nonce + Contract Flag + Bytecode)
app.get("/address/:address", async (req, res) => {
  try {
    const address = req.params.address;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid Ethereum address" });
    }
    const normalizedAddress = ethers.getAddress(address);
    const PRIVACY_GROUP_ID = "04R7n27BfNa+muLV+rR2eGY17jiwWSC3D+0dpS4MSkY=";
    const balanceOfData = romContract.interface.encodeFunctionData("balanceOf", [normalizedAddress]);

    const [balance, romBalance, nonce, code] = await Promise.all([
      provider.getBalance(normalizedAddress),
      romContract.balanceOf(normalizedAddress).catch(() => 0n),
      provider.getTransactionCount(normalizedAddress),
      provider.getCode(normalizedAddress)
    ]);

    // Fetch private ROM balance via priv_call (only visible to privacy group members)
    let privateRomBalance = "0";
    try {
      const privResult = await provider.send("priv_call", [
        PRIVACY_GROUP_ID,
        { to: PRIVATE_ROM_ADDRESS, data: balanceOfData },
        "latest"
      ]);
      if (privResult && privResult !== "0x") {
        const [decoded] = romContract.interface.decodeFunctionResult("balanceOf", privResult);
        privateRomBalance = ethers.formatUnits(decoded, 18);
      }
    } catch (_) {}

    console.log("Address:", normalizedAddress, "isContract:", code !== "0x");
    let tokenMetadata = null;
    if (code !== "0x") {
      try {
        const tempContract = new ethers.Contract(normalizedAddress, ROM_ABI, provider);
        const [name, symbol, decimals, totalSupply] = await Promise.all([
          tempContract.name().catch((e) => { console.log("name() failed:", e.message); return null; }),
          tempContract.symbol().catch((e) => { console.log("symbol() failed:", e.message); return null; }),
          tempContract.decimals().catch((e) => { console.log("decimals() failed:", e.message); return null; }),
          tempContract.totalSupply().catch((e) => { console.log("totalSupply() failed:", e.message); return null; })
        ]);
        
        console.log("Contract properties - name:", name, "symbol:", symbol, "decimals:", decimals, "totalSupply:", totalSupply);

        if (name && symbol && decimals !== null && totalSupply !== null) {
          tokenMetadata = {
            address: normalizedAddress,
            name,
            symbol,
            decimals: Number(decimals),
            totalSupply: ethers.formatUnits(totalSupply, decimals)
          };
        }
      } catch (e) {
        console.log("ERC20 check error:", e.message);
      }
    }

    console.log("Returning tokenMetadata:", tokenMetadata);

    res.json({
      address: normalizedAddress,
      balance: ethers.formatEther(balance),
      romBalance: ethers.formatUnits(romBalance, 18),
      privateRomBalance,
      nonce,
      isContract: code !== "0x",
      bytecode: code,
      tokenMetadata
    });
  } catch (err) {
    console.error("GET /address/:address error:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// Get Address Transaction History (Queries DB instantly!)
app.get("/address/:address/txs", async (req, res) => {
  try {
    const address = req.params.address;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid Ethereum address" });
    }
    const normalized = ethers.getAddress(address).toLowerCase();
    
    // Select transactions where address is sender or receiver
    const result = await pool.query(
      `SELECT * FROM transactions 
       WHERE LOWER(from_address) = $1 OR LOWER(to_address) = $1 
       ORDER BY block_number DESC LIMIT 100`,
      [normalized]
    );

    const formatted = result.rows.map(row => ({
      hash: row.hash,
      blockNumber: parseInt(row.block_number),
      from: row.from_address,
      to: row.to_address,
      value: row.value,
      timestamp: parseInt(row.timestamp),
      isPrivate: row.is_private
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Address Token Transfers (ROM) (Queries DB instantly!)
app.get("/address/:address/transfers", async (req, res) => {
  try {
    const address = req.params.address;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid Ethereum address" });
    }
    const normalized = ethers.getAddress(address).toLowerCase();

    const result = await pool.query(
      `SELECT * FROM token_transfers 
       WHERE LOWER(from_address) = $1 OR LOWER(to_address) = $1 OR LOWER(token_address) = $1
       ORDER BY block_number DESC LIMIT 100`,
      [normalized]
    );

    const formatted = result.rows.map(row => ({
      id: row.id,
      txHash: row.tx_hash,
      blockNumber: parseInt(row.block_number),
      tokenAddress: row.token_address,
      from: row.from_address,
      to: row.to_address,
      value: row.value,
      timestamp: parseInt(row.timestamp)
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get ROM Token Metadata
app.get("/rom/metadata", async (req, res) => {
  try {
    const [name, symbol, totalSupply, decimals] = await Promise.all([
      romContract.name(),
      romContract.symbol(),
      romContract.totalSupply(),
      romContract.decimals()
    ]);
    res.json({
      address: ROM_ADDRESS,
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply: ethers.formatUnits(totalSupply, decimals)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getOrCreatePrivacyGroupId(privateFrom, privateForList) {
  const allMembers = [privateFrom || "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=", ...privateForList];
  let groups = await provider.send("priv_findPrivacyGroup", [allMembers]);
  if (groups && groups.length > 0) {
    const legacyGroup = groups.find(g => g.type === "LEGACY");
    if (legacyGroup) {
      return legacyGroup.privacyGroupId;
    }
  }
  // Fallback to computed LEGACY privacy group ID
  const crypto = require("crypto");
  const keys = allMembers.map(k => Buffer.from(k, "base64"));
  keys.sort(Buffer.compare);
  const concat = Buffer.concat(keys);
  return crypto.createHash("sha256").update(concat).digest().toString("base64");
}

// Call Write Function on Contract (Signed by pre-funded key)
app.post("/contract/:address/write", async (req, res) => {
  try {
    const address = req.params.address;
    const { functionName, params, isPrivate, privateFrom, privateFor } = req.body;
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid contract address" });
    }
    const normalizedContract = ethers.getAddress(address);
    
    const privateKey = process.env.PRIVATE_KEY || "629c62a6f33b6493b5f663c9e977ce2f0321ee180a713c463a88ea6959c8da8b";
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(normalizedContract, ROM_ABI, wallet);
    
    const formattedParams = params.map(param => {
      if (typeof param === "string" && /^\d+$/.test(param)) {
        return BigInt(param);
      }
      return param;
    });

    if (isPrivate) {
      try {
        const data = contract.interface.encodeFunctionData(functionName, formattedParams);
        
        let privateTarget = normalizedContract;
        if (normalizedContract.toLowerCase() === ROM_ADDRESS.toLowerCase()) {
          privateTarget = ethers.getAddress(PRIVATE_ROM_ADDRESS);
        } else if (normalizedContract.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
          privateTarget = ethers.getAddress(PRIVATE_USDT_ADDRESS);
        } else if (normalizedContract.toLowerCase() === ROMICO_ADDRESS.toLowerCase()) {
          privateTarget = ethers.getAddress(PRIVATE_ROMICO_ADDRESS);
        }

        let privateForList = [];
        if (privateFor) {
          if (Array.isArray(privateFor)) {
            privateForList = privateFor.map(k => k.trim());
          } else if (typeof privateFor === "string") {
            privateForList = privateFor.split(",").map(k => k.trim());
          }
        }

        const privacyGroupId = await getOrCreatePrivacyGroupId(privateFrom, privateForList);

        const privateNonceHex = await provider.send("priv_getTransactionCount", [
          wallet.address,
          privacyGroupId
        ]);
        const nonce = parseInt(privateNonceHex, 16);
        console.log(`DEBUG private tx: privacyGroupId=${privacyGroupId}, nonce=${nonce}, wallet=${wallet.address}`);


        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || ethers.parseUnits("1", "gwei");

        // ---------------------------------------------------------------
        // EEA PRIVATE TRANSACTION SIGNING (correct approach)
        //
        // Besu recovers the private tx sender by hashing a 9-element RLP:
        //   [nonce, gasPrice, gasLimit, to, value, data,
        //    privateFrom, privateFor, restriction]
        // and performing ecrecover(hash, v, r, s).
        //
        // We must sign THAT hash - not a public transaction hash.
        // ---------------------------------------------------------------

        const privateFromBytes = Buffer.from(
          privateFrom || "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=",
          "base64"
        );
        const privateForBytes = privateForList.map(k => Buffer.from(k, "base64"));
        const nonceBytes = nonce === 0 ? new Uint8Array(0) : ethers.toBeArray(nonce);

        // 9-element EEA pre-signing RLP (no v/r/s yet)
        const eeaPreimageArray = [
          nonceBytes,
          ethers.toBeArray(gasPrice),
          ethers.toBeArray(3000000),       // gasLimit
          ethers.getBytes(privateTarget),  // to (private contract address)
          new Uint8Array(0),               // value = 0
          ethers.getBytes(data),           // calldata
          privateFromBytes,                // privateFrom
          privateForBytes,                 // privateFor (array of buffers)
          Buffer.from("restricted", "utf-8") // restriction
        ];

        const eeaPreimageRlp = ethers.encodeRlp(eeaPreimageArray);
        const signingHash = ethers.keccak256(eeaPreimageRlp);

        // Sign the EEA-specific hash directly using the raw signing key
        const sigObj = wallet.signingKey.sign(signingHash);
        const sigV = sigObj.v;   // 27 or 28
        const sigR = ethers.getBytes(sigObj.r);
        const sigS = ethers.getBytes(sigObj.s);

        // 12-element signed EEA transaction RLP
        const eeaSignedArray = [
          nonceBytes,
          ethers.toBeArray(gasPrice),
          ethers.toBeArray(3000000),       // gasLimit
          ethers.getBytes(privateTarget),  // to (private contract address)
          new Uint8Array(0),               // value = 0
          ethers.getBytes(data),           // calldata
          ethers.toBeArray(sigV),          // v
          sigR,                            // r
          sigS,                            // s
          privateFromBytes,                // privateFrom
          privateForBytes,                 // privateFor (array of buffers)
          Buffer.from("restricted", "utf-8") // restriction
        ];

        const eeaRawTxHex = ethers.encodeRlp(eeaSignedArray);
        
        // Broadcast via eea_sendRawTransaction
        const txHash = await provider.send("eea_sendRawTransaction", [eeaRawTxHex]);
        
        // Poll for private receipt to get block number and gas used
        let privReceipt = null;
        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            privReceipt = await provider.send("priv_getTransactionReceipt", [txHash]);
            if (privReceipt) break;
          } catch (_) {}
        }

        const blockNum = privReceipt ? parseInt(privReceipt.blockNumber, 16) : null;
        const gasUsed = privReceipt ? parseInt(privReceipt.gasUsed || "0x5408", 16).toString() : null;
        const status = privReceipt ? privReceipt.status : null;

        if (privReceipt && privReceipt.status === "0x0") {
          const revertMsg = privReceipt.revertReason
            ? ` Revert: ${privReceipt.revertReason}`
            : "";
          return res.status(500).json({
            error: `Private transaction reverted on-chain.${revertMsg}`,
            hash: txHash,
            blockNumber: blockNum
          });
        }

        return res.json({
          success: true,
          hash: txHash,
          blockNumber: blockNum,
          gasUsed: gasUsed,
          isPrivate: true,
          message: "Private transaction submitted successfully via Tessera Enclave"
        });

      } catch (privErr) {
        return res.status(500).json({
          error: `Tessera Private Tx failed: ${privErr.message}. Make sure Tessera is running and privacy is enabled on your Besu nodes.`
        });
      }
    }

    const tx = await contract[functionName](...formattedParams);
    const receipt = await tx.wait();
    
    res.json({
      success: true,
      hash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      isPrivate: false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Call Read Function on Contract (Public or Private Tessera Group)
app.post("/contract/:address/read", async (req, res) => {
  try {
    const address = req.params.address;
    const { functionName, params, isPrivate, privateFrom, privateFor } = req.body;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid contract address" });
    }
    const normalizedContract = ethers.getAddress(address);

    const privateKey = process.env.PRIVATE_KEY || "629c62a6f33b6493b5f663c9e977ce2f0321ee180a713c463a88ea6959c8da8b";
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(normalizedContract, ROM_ABI, wallet);

    const formattedParams = params.map(param => {
      if (typeof param === "string" && /^\d+$/.test(param)) {
        return BigInt(param);
      }
      return param;
    });

    if (isPrivate) {
      const data = contract.interface.encodeFunctionData(functionName, formattedParams);
      
      let privateTarget = normalizedContract;
      if (normalizedContract.toLowerCase() === ROM_ADDRESS.toLowerCase()) {
        privateTarget = ethers.getAddress(PRIVATE_ROM_ADDRESS);
      } else if (normalizedContract.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
        privateTarget = ethers.getAddress(PRIVATE_USDT_ADDRESS);
      } else if (normalizedContract.toLowerCase() === ROMICO_ADDRESS.toLowerCase()) {
        privateTarget = ethers.getAddress(PRIVATE_ROMICO_ADDRESS);
      }

      let privateForList = [];
      if (privateFor) {
        if (Array.isArray(privateFor)) {
          privateForList = privateFor.map(k => k.trim());
        } else if (typeof privateFor === "string") {
          privateForList = privateFor.split(",").map(k => k.trim());
        }
      }

      const privacyGroupId = await getOrCreatePrivacyGroupId(privateFrom, privateForList);

      const privResult = await provider.send("priv_call", [
        privacyGroupId,
        { to: privateTarget, data },
        "latest"
      ]);

      if (!privResult || privResult === "0x") {
        return res.json({ result: "0" });
      }

      const decoded = contract.interface.decodeFunctionResult(functionName, privResult);
      const stringifiedDecoded = decoded.map(val => typeof val === "bigint" ? val.toString() : val);
      return res.json({ result: stringifiedDecoded });
    } else {
      const result = await contract[functionName](...formattedParams);
      const stringifiedResult = typeof result === "bigint" ? result.toString() : result;
      return res.json({ result: stringifiedResult });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Transaction Details (Upgraded to return full privacy metadata)
app.get("/tx/:hash", async (req, res) => {
  try {
    const hash = req.params.hash;
    const result = await pool.query("SELECT * FROM transactions WHERE hash = $1", [hash]);
    
    let tokenTransfers = [];
    let isPrivate = false;
    let privateFrom = null;
    let privateFor = null;
    let privacyGroupId = null;
    
    if (result.rows.length === 0) {
      // fallback to chain
      const [tx, receipt] = await Promise.all([
        provider.getTransaction(hash),
        provider.getTransactionReceipt(hash)
      ]);
      if (!tx) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      let timestamp = null;
      if (receipt) {
        const block = await provider.getBlock(receipt.blockNumber);
        if (block) timestamp = block.timestamp;
        
        // Parse token transfers on the fly
        const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        for (const log of receipt.logs) {
          if (log.topics && log.topics[0] === ERC20_TRANSFER_TOPIC && log.topics.length === 3) {
            try {
              const from = ethers.getAddress("0x" + log.topics[1].slice(26));
              const to = ethers.getAddress("0x" + log.topics[2].slice(26));
              const rawValue = BigInt(log.data);
              
              const tokenDetails = await getTokenDetails(log.address);
              const value = ethers.formatUnits(rawValue, tokenDetails.decimals);
              
              tokenTransfers.push({
                tokenAddress: log.address,
                from,
                to,
                value,
                symbol: tokenDetails.symbol
              });
            } catch (e) {}
          }
        }
      }

      isPrivate = tx.to && (
        tx.to.toLowerCase() === "0x000000000000000000000000000000000000007c" ||
        tx.to.toLowerCase() === "0x000000000000000000000000000000000000007e"
      );

      let privateFromAddress = null;
      let privateToAddress = null;

      if (isPrivate) {
        try {
          const [privReceipt, privTx] = await Promise.all([
            provider.send("priv_getTransactionReceipt", [tx.hash]).catch(() => null),
            provider.send("priv_getPrivateTransaction", [tx.hash]).catch(() => null)
          ]);
          if (privReceipt) {
            privateFrom = privReceipt.privateFrom || null;
            privateFor = privReceipt.privateFor || null;
            privacyGroupId = privReceipt.privacyGroupId || null;

            // Also parse private internal logs from the decrypted receipt!
            if (privReceipt.logs) {
              const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
              const ERC20_APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
              for (const log of privReceipt.logs) {
                if (log.topics && log.topics.length === 3) {
                  const isTransfer = log.topics[0] === ERC20_TRANSFER_TOPIC;
                  const isApproval = log.topics[0] === ERC20_APPROVAL_TOPIC;
                  if (isTransfer || isApproval) {
                    try {
                      const fromAddr = ethers.getAddress("0x" + log.topics[1].slice(26));
                      const toAddr = ethers.getAddress("0x" + log.topics[2].slice(26));
                      const rawVal = BigInt(log.data);
                      
                      const tokenDetails = await getTokenDetails(log.address);
                      const value = ethers.formatUnits(rawVal, tokenDetails.decimals);
                      
                      tokenTransfers.push({
                        tokenAddress: log.address,
                        from: fromAddr,
                        to: toAddr,
                        value,
                        symbol: tokenDetails.symbol,
                        isPrivate: true,
                        isApproval
                      });
                    } catch (e) {}
                  }
                }
              }
            }
          }
          if (privTx) {
            privateFromAddress = privTx.from;
            privateToAddress = privTx.to;
          }
        } catch (e) {}
      }

      return res.json({
        hash: tx.hash,
        blockNumber: tx.blockNumber,
        from: tx.from,
        to: tx.to,
        value: ethers.formatEther(tx.value),
        gasPrice: ethers.formatUnits(tx.gasPrice || 0n, "gwei"),
        gasLimit: tx.gasLimit.toString(),
        gasUsed: receipt ? receipt.gasUsed.toString() : "Pending",
        status: receipt ? (receipt.status === 1 ? "Success" : "Failed") : "Pending",
        timestamp,
        tokenTransfers,
        isPrivate,
        privateFrom,
        privateFor,
        privacyGroupId,
        privateFromAddress,
        privateToAddress
      });
    }

    const row = result.rows[0];
    
    // Query token transfers associated with this transaction
    const transfersRes = await pool.query(
      "SELECT * FROM token_transfers WHERE tx_hash = $1",
      [hash]
    );
    tokenTransfers = transfersRes.rows.map(tr => ({
      tokenAddress: tr.token_address,
      from: tr.from_address,
      to: tr.to_address,
      value: tr.value,
      symbol: tr.symbol || "ROM",
      isPrivate: row.is_private,
      isApproval: tr.is_approval || false
    }));

    let privateFromDb = row.private_from;
    let privateForDb = row.private_for ? JSON.parse(row.private_for) : null;
    let privacyGroupIdDb = row.privacy_group_id;
    let privateFromAddress = null;
    let privateToAddress = null;

    if (row.is_private) {
      try {
        const [privReceipt, privTx] = await Promise.all([
          provider.send("priv_getTransactionReceipt", [row.hash]).catch(() => null),
          provider.send("priv_getPrivateTransaction", [row.hash]).catch(() => null)
        ]);
        if (privReceipt) {
          privateFromDb = privReceipt.privateFrom || privateFromDb;
          privateForDb = privReceipt.privateFor || privateForDb;
          privacyGroupIdDb = privReceipt.privacyGroupId || privacyGroupIdDb;

          // Parse private internal logs from the decrypted receipt
          if (privReceipt.logs) {
            const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
            const ERC20_APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
            for (const log of privReceipt.logs) {
              if (log.topics && log.topics.length === 3) {
                const isTransfer = log.topics[0] === ERC20_TRANSFER_TOPIC;
                const isApproval = log.topics[0] === ERC20_APPROVAL_TOPIC;
                if (isTransfer || isApproval) {
                  try {
                    const fromAddr = ethers.getAddress("0x" + log.topics[1].slice(26));
                    const toAddr = ethers.getAddress("0x" + log.topics[2].slice(26));
                    const rawVal = BigInt(log.data);
                    
                    const tokenDetails = await getTokenDetails(log.address);
                    const value = ethers.formatUnits(rawVal, tokenDetails.decimals);
                    
                    const exists = tokenTransfers.some(t =>
                      t.tokenAddress.toLowerCase() === log.address.toLowerCase() &&
                      t.from.toLowerCase() === fromAddr.toLowerCase() &&
                      t.to.toLowerCase() === toAddr.toLowerCase() &&
                      t.value === value &&
                      t.isApproval === isApproval
                    );

                    if (!exists) {
                      tokenTransfers.push({
                        tokenAddress: log.address,
                        from: fromAddr,
                        to: toAddr,
                        value,
                        symbol: tokenDetails.symbol,
                        isPrivate: true,
                        isApproval
                      });
                    }
                  } catch (e) {}
                }
              }
            }
          }
        }
        if (privTx) {
          privateFromAddress = privTx.from;
          privateToAddress = privTx.to;
        }
      } catch (e) {}
    }

    res.json({
      hash: row.hash,
      blockNumber: parseInt(row.block_number),
      from: row.from_address,
      to: row.to_address,
      value: row.value,
      gasPrice: row.gas_price,
      gasLimit: row.gas_limit,
      gasUsed: row.gas_used,
      status: row.status,
      timestamp: parseInt(row.timestamp),
      tokenTransfers,
      isPrivate: row.is_private,
      privateFrom: privateFromDb,
      privateFor: privateForDb,
      privacyGroupId: privacyGroupIdDb,
      privateFromAddress,
      privateToAddress
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Network Stats (Block Height, Gas Price, Peer Count, TPS)
app.get("/network/stats", async (req, res) => {
  try {
    const [blockNumber, feeData, peerCountHex] = await Promise.all([
      provider.getBlockNumber(),
      provider.getFeeData(),
      provider.send("net_peerCount", []).catch(() => "0x0")
    ]);
    
    const gasPrice = feeData.gasPrice || 0n;
    
    // Estimate TPS over the last 10 blocks (using DB rows to keep queries fast!)
    const dbRes = await pool.query(
      `SELECT SUM(tx_count) as total_tx 
       FROM (SELECT tx_count FROM blocks ORDER BY number DESC LIMIT 10) as last_blocks`
    );
    const totalTx = dbRes.rows[0].total_tx ? parseInt(dbRes.rows[0].total_tx) : 0;
    const duration = 50; // 10 blocks * 5s block period
    const tps = duration > 0 ? (totalTx / duration) : 0;

    res.json({
      blockHeight: blockNumber,
      gasPrice: ethers.formatUnits(gasPrice, "gwei"),
      peerCount: parseInt(peerCountHex, 16),
      tps: parseFloat(tps.toFixed(3)),
      romAddress: ROM_ADDRESS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Validator Stats (Reads from DB blocks, cross-references admin_peers)
app.get("/validators", async (req, res) => {
  try {
    const [latest, peers] = await Promise.all([
      provider.getBlockNumber(),
      provider.send("admin_peers", []).catch(() => [])
    ]);

    const validatorDetails = [
      {
        name: "Validator 1",
        address: "0x5653bBAe360A394dA23EA5747DF52Dca3581d4Bc",
        publicKey: "a74fe5cbd7ce25361f1713397d9f54697870bc5966077d11b9821ce2078e3b09af0f28d704c605f777581864cbde21ce7197026f619a96ef33fed6b1ea52fdb8",
        ip: "172.18.0.11",
        p2pPort: 30303,
        online: true,
        height: latest
      },
      {
        name: "Validator 2",
        address: "0x78C14389E4aF91d19513D1d530ffCB4BE921e4Fe",
        publicKey: "3faf6698271055f7f94ac0542c0aec31e4e98959e3defad151e25753dcdcfbca78ddbb174ddb72a8572ac1d7ace5bd5c27042d9de8362068cefb811199ffb4b4",
        ip: "172.18.0.12",
        p2pPort: 30304,
        online: false,
        height: null
      },
      {
        name: "Validator 3",
        address: "0x65e384b05D72670AF7223514991df5A13a785422",
        publicKey: "006d9e4d7f754614367dc2c7567fefb0b179fb5d67ea2250ad1b93a2b757fb0c8d37d5a1d64476ba786fb4a17cec1fccc1bb4e17f0dd9fc0499ae91f9afd1562",
        ip: "172.18.0.13",
        p2pPort: 30305,
        online: false,
        height: null
      },
      {
        name: "Validator 4",
        address: "0x0602ab9F663dD0f2E6CCcB90C04Acb678192546a",
        publicKey: "7da892c6c8d4d72a632f9238c6dacee8f82eb71baec12ecb3fa72b611964dde32db5051934c1e51326029216eed0684f57935abe8b447ed6163cca4df7152a8c",
        ip: "172.18.0.14",
        p2pPort: 30306,
        online: false,
        height: null
      }
    ];

    // Read total lifetime blocks proposed to allow frontend to calculate session delta
    const dbRes = await pool.query(
      `SELECT miner, COUNT(*) as count, MAX(number) as last_num 
       FROM blocks
       GROUP BY miner`
    );

    const proposingStats = {};
    const lastProposed = {};
    
    dbRes.rows.forEach(row => {
      try {
        const minerNorm = ethers.getAddress(row.miner);
        proposingStats[minerNorm] = parseInt(row.count);
        lastProposed[minerNorm] = parseInt(row.last_num);
      } catch (e) {
        // ignore format issues
      }
    });

    // Cross-reference with peer list
    let totalBlocksInWindow = 0;
    validatorDetails.forEach(val => {
      if (val.name !== "Validator 1") {
        const peerMatch = peers.find(p => {
          const normPeerId = p.id.startsWith("0x") ? p.id.slice(2) : p.id;
          return normPeerId.toLowerCase() === val.publicKey.toLowerCase();
        });

        if (peerMatch) {
          val.online = true;
          val.height = peerMatch.protocols?.eth?.latestBlock ? parseInt(peerMatch.protocols.eth.latestBlock) : latest;
          if (peerMatch.network?.remoteAddress) {
            const parts = peerMatch.network.remoteAddress.split(":");
            val.ip = parts[0];
          }
        }
      }

      val.blocksProposed = proposingStats[ethers.getAddress(val.address)] || 0;
      val.lastBlockProposed = lastProposed[ethers.getAddress(val.address)] || null;
      totalBlocksInWindow += val.blocksProposed;
    });

    // Calculate dynamic percentage
    validatorDetails.forEach(val => {
      val.percentage = totalBlocksInWindow === 0 ? "0.0" : ((val.blocksProposed / totalBlocksInWindow) * 100).toFixed(1);
    });

    res.json(validatorDetails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// USER ICO ENDPOINTS
// ==========================================

function generateReferralId() {
  const prefix = 'REFKDO';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const remainingLength = 15 - prefix.length;
  let randomPart = '';
  for (let i = 0; i < remainingLength; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix + randomPart;
}

// Public active sales rounds (No authentication required for user panel)
app.get("/api/v2/getActiveSales", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM token_sales WHERE status = 'active' ORDER BY id DESC");
    res.json({
      status: true,
      sales: result.rows
    });
  } catch (err) {
    console.error("Public getActiveSales error:", err);
    res.status(500).json({ status: false, msg: "Internal Server Error" });
  }
});

// Register new user or get existing user
app.get("/api/v2/RegisterNewUser", async (req, res) => {
  const { wallet_address, ref_id } = req.query;
  if (!wallet_address) {
    return res.status(400).json({ status: false, msg: "wallet_address is required" });
  }

  try {
    const existingUsers = await pool.query(
      "SELECT * FROM users WHERE wallet_address = $1",
      [wallet_address]
    );

    if (existingUsers.rows.length > 0) {
      const user = existingUsers.rows[0];
      return res.json({
        status: true,
        msg: "User already saved",
        userData: user
      });
    }

    let referred_by = "ADMIN";
    let referrer_wallet = "0x90F8bf6A479f320ced073E1E1888658D2613e324";

    if (ref_id) {
      const refData = await pool.query(
        "SELECT * FROM users WHERE ptc_ref_id = $1",
        [ref_id]
      );

      if (refData.rows.length === 0) {
        return res.status(400).json({ status: false, msg: "Invalid referral ID" });
      }

      const fetchedReferrerWallet = refData.rows[0].wallet_address;
      if (fetchedReferrerWallet.toLowerCase() === wallet_address.toLowerCase()) {
        return res.status(400).json({ status: false, msg: "You cannot refer yourself" });
      }

      referrer_wallet = fetchedReferrerWallet;
      referred_by = ref_id;
    }

    const newRefId = generateReferralId();
    const insertRes = await pool.query(
      "INSERT INTO users (wallet_address, ptc_ref_id, referred_by, referrer_address) VALUES ($1, $2, $3, $4) RETURNING *",
      [wallet_address, newRefId, referred_by, referrer_wallet]
    );

    res.json({
      status: true,
      msg: "New user registered",
      userData: insertRes.rows[0]
    });
  } catch (err) {
    console.error("Error in RegisterNewUser:", err);
    res.status(500).json({ status: false, msg: "Failed to register user" });
  }
});

// Get user profile data, purchases, referrals, and rewards
app.get("/api/v2/getUserData", async (req, res) => {
  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ status: false, msg: "address is required" });
  }

  try {
    let checkRes = await pool.query("SELECT * FROM users WHERE wallet_address = $1", [address]);
    if (checkRes.rows.length === 0) {
      const newRefId = generateReferralId();
      const insertRes = await pool.query(
        "INSERT INTO users (wallet_address, ptc_ref_id, referred_by, referrer_address) VALUES ($1, $2, $3, $4) RETURNING *",
        [address, newRefId, "ADMIN", "0x90F8bf6A479f320ced073E1E1888658D2613e324"]
      );
      checkRes = insertRes;
    }

    const user = checkRes.rows[0];
    const purchases = await pool.query(
      "SELECT * FROM ico_purchases WHERE address = $1 ORDER BY created_at DESC",
      [address]
    );
    const referrals = await pool.query(
      "SELECT * FROM users WHERE referred_by = $1",
      [user.ptc_ref_id]
    );
    const basictransactions = await pool.query(
      "SELECT * FROM ico_purchases WHERE referrer_address = $1 AND referrer_bonus::numeric > 0",
      [address]
    );

    res.json({
      status: true,
      UserData: [user],
      transactions: purchases.rows,
      referrals: referrals.rows,
      basictransactions: basictransactions.rows
    });
  } catch (err) {
    console.error("Error in getUserData:", err);
    res.status(500).json({ status: false, msg: "Failed to get user data" });
  }
});

// Save purchase transaction
app.post("/api/v2/savePurchases", async (req, res) => {
  const {
    address,
    CryptoValue,
    payment_type,
    PTC_tokens,
    transHash,
    USDvalue_of_crypto_purchased,
    sale_type = "presale",
    referrer_bonus = "0",
    referrer_address = ""
  } = req.body;

  if (!address || !CryptoValue || !payment_type || !PTC_tokens || !transHash || !USDvalue_of_crypto_purchased) {
    return res.status(400).json({ status: false, msg: "Missing required fields" });
  }

  try {
    await pool.query(
      `INSERT INTO ico_purchases
       (address, crypto_value, payment_type, ptc_tokens, trans_hash, usd_value_of_crypto, sale_type, status, referrer_bonus, referrer_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [address, CryptoValue, payment_type, PTC_tokens, transHash, USDvalue_of_crypto_purchased, sale_type, "success", referrer_bonus, referrer_address]
    );

    // Calculate referral bonus (10% reward) if user has a referrer
    const userRes = await pool.query("SELECT * FROM users WHERE wallet_address = $1", [address]);
    if (userRes.rows.length > 0) {
      const user = userRes.rows[0];
      if (user.referrer_address && user.referrer_address.toLowerCase() !== "0x90f8bf6a479f320ced073e1e1888658d2613e324") {
        const refClaimRes = await pool.query(
          "SELECT * FROM referral_claims WHERE referrer_id = $1 AND referred_user_id = $2",
          [user.referrer_address, address]
        );
        if (refClaimRes.rows.length === 0) {
          const rewardAmt = (parseFloat(PTC_tokens) * 0.10).toFixed(2);
          await pool.query(
            "INSERT INTO referral_claims (referrer_id, referred_user_id, amount, status) VALUES ($1, $2, $3, $4)",
            [user.referrer_address, address, rewardAmt, "Pending"]
          );
        }
      }
    }

    res.json({
      status: true,
      msg: `${PTC_tokens} ROM tokens purchased successfully!`
    });
  } catch (err) {
    console.error("Error in savePurchases:", err);
    res.status(500).json({ status: false, msg: "Failed to record purchase" });
  }
});

// Get user transaction details
app.get("/api/v2/getTransactionDetails", async (req, res) => {
  const { address } = req.query;
  try {
    if (address) {
      const purchases = await pool.query(
        "SELECT * FROM ico_purchases WHERE address = $1 ORDER BY created_at DESC",
        [address]
      );
      const claims = await pool.query(
        "SELECT * FROM referral_claims WHERE referrer_id = $1 AND status IN ('Pending', 'Success')",
        [address]
      );
      const userRes = await pool.query("SELECT * FROM users WHERE wallet_address = $1", [address]);
      return res.json({
        status: true,
        userData: purchases.rows,
        referralData: claims.rows,
        referralLink: userRes.rows[0]?.ptc_ref_id || null
      });
    }

    const allPurchases = await pool.query("SELECT * FROM ico_purchases ORDER BY created_at DESC");
    res.json({
      status: true,
      userData: allPurchases.rows,
      referralData: [],
      referralLink: null
    });
  } catch (err) {
    console.error("Error in getTransactionDetails:", err);
    res.status(500).json({ status: false, msg: "Internal Server Error" });
  }
});

// ==========================================
// ADMIN ICO ENDPOINTS
// ==========================================

// Admin Login
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.json({ status: false, msg: "Email and password are required" });
  }

  try {
    const adminRes = await pool.query(
      "SELECT * FROM admins WHERE LOWER(email) = $1",
      [email.trim().toLowerCase()]
    );

    if (adminRes.rows.length === 0 || adminRes.rows[0].password !== password) {
      return res.json({ status: false, msg: "Incorrect Email or Password" });
    }

    res.json({
      status: true,
      data: {
        email: adminRes.rows[0].email,
        name: "ADMIN",
        token: `mock-jwt-${adminRes.rows[0].email}-${Date.now()}`
      }
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ status: false, msg: "Failed to login" });
  }
});

// Admin Token Validation Middleware
const validateAdminToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ status: false, msg: "Unauthorized access. No token provided." });
  }
  const token = authHeader.split(" ")[1];
  if (!token || !token.startsWith("mock-jwt-")) {
    return res.status(401).json({ status: false, msg: "Unauthorized access. Invalid token." });
  }
  next();
};

// Admin Dashboard stats
app.get("/api/admin/dashboard", validateAdminToken, async (req, res) => {
  try {
    const usersCount = await pool.query("SELECT COUNT(*) FROM users");
    const txCount = await pool.query("SELECT COUNT(*) FROM ico_purchases");
    const successTxCount = await pool.query("SELECT COUNT(*) FROM ico_purchases WHERE status = 'success'");
    const failedTxCount = await pool.query("SELECT COUNT(*) FROM ico_purchases WHERE status = 'failed'");
    const tokensSold = await pool.query("SELECT SUM(ptc_tokens::numeric) FROM ico_purchases WHERE status = 'success'");
    
    const lastTxs = await pool.query("SELECT * FROM ico_purchases ORDER BY created_at DESC LIMIT 5");

    res.json({
      status: true,
      stats: {
        total_users: parseInt(usersCount.rows[0].count),
        total_transactions: parseInt(txCount.rows[0].count),
        successful_transactions: parseInt(successTxCount.rows[0].count),
        failed_transactions: parseInt(failedTxCount.rows[0].count),
        purchased_tokens: parseFloat(tokensSold.rows[0].sum || "0")
      },
      lastTransactions: lastTxs.rows
    });
  } catch (err) {
    console.error("Admin dashboard stats error:", err);
    res.status(500).json({ status: false, msg: "Failed to load dashboard stats" });
  }
});

// Admin Users List with summary stats
app.get("/api/admin/users-list", validateAdminToken, async (req, res) => {
  try {
    const usersList = await pool.query(`
      SELECT u.wallet_address,
             COALESCE(SUM(ip.ptc_tokens::numeric), 0) AS ptc_tokens_purchased,
             COALESCE(SUM(ip.usd_value_of_crypto::numeric), 0) AS total_usd_invested
      FROM users u
      LEFT JOIN ico_purchases ip ON u.wallet_address = ip.address AND ip.status = 'success'
      GROUP BY u.wallet_address
      ORDER BY total_usd_invested DESC
    `);
    res.json({
      status: true,
      users: usersList.rows
    });
  } catch (err) {
    console.error("Admin users-list error:", err);
    res.status(500).json({ status: false, msg: "Failed to load users list" });
  }
});

// Admin get transaction details
app.get("/api/admin/getTransactionDetails", validateAdminToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ico_purchases ORDER BY created_at DESC");
    res.json({
      status: true,
      userData: result.rows
    });
  } catch (err) {
    console.error("Admin getTransactionDetails error:", err);
    res.status(500).json({ status: false, msg: "Internal Server Error" });
  }
});

// Admin get referral claims
app.get("/api/admin/getreferralClaimDetails", validateAdminToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM referral_claims ORDER BY created_at DESC");
    res.json({
      status: true,
      userData: result.rows
    });
  } catch (err) {
    console.error("Admin referral claims error:", err);
    res.status(500).json({ status: false, msg: "Internal Server Error" });
  }
});

// Admin active rounds
app.get("/api/admin/getActiveSales", validateAdminToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM token_sales WHERE status = 'active' ORDER BY id DESC");
    res.json({
      status: true,
      sales: result.rows
    });
  } catch (err) {
    console.error("Admin getActiveSales error:", err);
    res.status(500).json({ status: false, msg: "Internal Server Error" });
  }
});

// Admin create new round
app.post("/api/admin/saveNewSale", validateAdminToken, async (req, res) => {
  const { name, quantity, minimum, maximum, price, start_at, end_at } = req.body;
  try {
    await pool.query(
      `INSERT INTO token_sales (type, name, token_quantity, minimum_purchase, maximum_purchase, price, status, start_at, end_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ["Active Sale", name, quantity, minimum, maximum, price || "10", "active", new Date(start_at), new Date(end_at)]
    );
    res.json({ status: true, msg: "Sale round created successfully" });
  } catch (err) {
    console.error("Admin saveNewSale error:", err);
    res.status(500).json({ status: false, msg: "Failed to create round" });
  }
});

// Admin update round
app.put("/api/admin/updateSale/:id", validateAdminToken, async (req, res) => {
  const { id } = req.params;
  const { name, quantity, minimum, maximum, price, start_at, end_at } = req.body;
  try {
    const result = await pool.query(
      `UPDATE token_sales
       SET name = $1, token_quantity = $2, minimum_purchase = $3, maximum_purchase = $4, price = $5, start_at = $6, end_at = $7
       WHERE id = $8`,
      [name, quantity, minimum, maximum, price || "10", new Date(start_at), new Date(end_at), id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ status: false, msg: "Round not found" });
    }
    res.json({ status: true, msg: "Sale round updated successfully" });
  } catch (err) {
    console.error("Admin updateSale error:", err);
    res.status(500).json({ status: false, msg: "Failed to update round" });
  }
});

// Admin delete round
app.delete("/api/admin/deleteSale/:id", validateAdminToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM token_sales WHERE id = $1", [id]);
    res.json({ status: true, msg: "Sale round deleted successfully" });
  } catch (err) {
    console.error("Admin deleteSale error:", err);
    res.status(500).json({ status: false, msg: "Failed to delete round" });
  }
});

// Admin Settings
app.get("/api/admin/settings", validateAdminToken, async (req, res) => {
  try {
    const settings = await pool.query("SELECT * FROM settings LIMIT 1");
    if (settings.rows.length === 0) {
      return res.status(404).json({ status: false, msg: "No settings found" });
    }
    res.json({ status: true, data: settings.rows[0] });
  } catch (err) {
    console.error("Admin get settings error:", err);
    res.status(500).json({ status: false, msg: "Internal Server Error" });
  }
});

app.post("/api/admin/updatesettings", validateAdminToken, async (req, res) => {
  const { site_name, owner_address, token_name, token_symbol, contract_address, referral_level1 } = req.body;
  try {
    const existing = await pool.query("SELECT * FROM settings LIMIT 1");
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE settings
         SET site_name = $1, owner_address = $2, token_name = $3, token_symbol = $4, contract_address = $5, referral_level1 = $6
         WHERE id = $7`,
         [site_name, owner_address, token_name, token_symbol, contract_address, referral_level1 || "10.00", existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO settings (site_name, owner_address, token_name, token_symbol, contract_address, referral_level1)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [site_name, owner_address, token_name, token_symbol, contract_address, referral_level1 || "10.00"]
      );
    }
    res.json({ status: true, msg: "Settings updated successfully" });
  } catch (err) {
    console.error("Admin updatesettings error:", err);
    res.status(500).json({ status: false, msg: "Failed to update settings" });
  }
});

// Start initialization & worker
initDb().then(() => {
  syncBlocks();
  setInterval(syncBlocks, 4000);
});

app.listen(3001, () => {
  console.log("Explorer API running on port 3001");
});