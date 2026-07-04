# Besu DApp — Private Blockchain Token Sale & Explorer

A full-stack decentralized application running on a **4-node Hyperledger Besu**
QBFT private network with **Tessera** privacy enclaves. It includes ERC-20 token
contracts (ROM / USDT), an ICO/token-sale contract, a PostgreSQL-backed block
explorer API, and a React front-end for the explorer, faucet, ICO, and admin
panels.

---

## Architecture

| Component | Path | Stack | Purpose |
|-----------|------|-------|---------|
| **Blockchain network** | [docker-compose.yml](docker-compose.yml), [qbft/](qbft/), [nodes/](nodes/) | Besu 22.1.3 (QBFT) + Tessera + Postgres | 4 validators with privacy enabled |
| **Smart contracts** | [rom-token/](rom-token/) | Hardhat, Solidity 0.8.28, OpenZeppelin | ROM & USDT ERC-20 tokens, ICO sale |
| **Explorer API** | [besu-explorer/besu-explorer/](besu-explorer/besu-explorer/) | Node.js, Express, ethers v6, PostgreSQL | Indexes blocks/txs, serves REST API |
| **Web UI** | [explorer-ui/](explorer-ui/) | React 19 + Vite | Explorer, faucet, ICO, admin dashboards |

**Data flow:** Besu nodes → Explorer API (indexes into Postgres, port `3001`) → React UI (Vite dev server).

### Ports

| Service | Port |
|---------|------|
| Besu JSON-RPC (validator1) | `8545` |
| Tessera (node1) | `9101` |
| PostgreSQL | `5433` (host) → `5432` (container) |
| Explorer API | `3001` |
| Vite dev server | `5173` (default) |

---

## Prerequisites

- **Docker** & **Docker Compose**
- **Node.js** ≥ 18 and **npm**
- A funded account private key for deploying contracts / signing writes

---

## Running Instructions

### 1. Start the blockchain network

The compose file uses an **external** Docker network, so create it first:

```bash
cd Besu_dapp

# Create the shared network (matches the 172.18.0.0/16 range in docker-compose.yml)
docker network create besu-net --subnet 172.18.0.0/16

# Launch validators, Tessera enclaves, and Postgres
docker compose up -d
```

Verify the chain is producing blocks:

```bash
curl -X POST http://127.0.0.1:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

> Node keys and the QBFT genesis live in [nodes/](nodes/) and
> [qbft/networkFiles/genesis.json](qbft/networkFiles/genesis.json).
> Static peers are defined in [config/static-nodes.json](config/static-nodes.json).

### 2. Deploy the smart contracts

```bash
cd rom-token
npm install

# Provide the deployer key
echo "PRIVATE_KEY=<your_funded_private_key>" > .env

# Deploy against the local Besu network (chainId 1337, RPC http://127.0.0.1:8545)
npx hardhat run scripts/deploy.js --network besu           # ROM token
npx hardhat run scripts/deploy_ico_only.js --network besu  # ICO contract

# Run the contract tests (optional)
npx hardhat test
```

After deploying, update the contract addresses referenced in the Explorer API
([besu-explorer/besu-explorer/src/index.js](besu-explorer/besu-explorer/src/index.js),
the `ROM_ADDRESS` / `USDT_ADDRESS` / `ROMICO_ADDRESS` constants) if they differ
from the defaults.

### 3. Start the Explorer API

```bash
cd besu-explorer/besu-explorer
npm install

# (optional) override the signing key used for write endpoints
export PRIVATE_KEY=<your_funded_private_key>

node src/index.js
```

The API listens on **http://localhost:3001**. On start-up it:
- creates the PostgreSQL schema and seeds a default admin + sale settings,
- begins syncing blocks from Besu every 4 seconds.

Default seeded admin login: `admin@psyche.com` / `Demo@123`.

### 4. Start the Web UI

```bash
cd explorer-ui
npm install
npm run dev
```

Open the Vite URL (default **http://localhost:5173**). Available pages:

| Route | Page |
|-------|------|
| `/` | Block explorer |
| `/faucet` | Token faucet |
| `/ico` | ICO / token sale |
| `/admin` | Admin dashboard |

Build for production with `npm run build` and preview with `npm run preview`.

---

## Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/blocks` | Latest 10 blocks |
| GET | `/blocks/:number` | Block detail + transactions |
| GET | `/tx/:hash` | Transaction detail (incl. private metadata) |
| GET | `/address/:address` | Balances, nonce, contract info |
| GET | `/network/stats` | Block height, gas price, peers, TPS |
| GET | `/validators` | Validator status & blocks proposed |
| POST | `/contract/:address/read` | Call a read function (public or private) |
| POST | `/contract/:address/write` | Send a tx (public or Tessera-private) |
| GET | `/api/v2/getActiveSales` | Active ICO sale rounds |
| POST | `/api/admin/login` | Admin authentication |

Private (Tessera) transactions are supported via the `isPrivate`, `privateFrom`,
and `privateFor` fields on the read/write endpoints.

---

## Configuration Notes

- **Explorer DB connection** is hard-coded in
  [besu-explorer/besu-explorer/src/index.js](besu-explorer/besu-explorer/src/index.js)
  (`localhost:5433`, user `postgres`, db `besu_explorer`) to match the Postgres
  container in `docker-compose.yml`.
- **Contract addresses** for ROM/USDT/ICO (public and private variants) are also
  defined at the top of that file — keep them in sync with your deployments.
- The Besu network runs with **`--min-gas-price=0`** and privacy enabled through
  Tessera enclaves.

---

## Tear Down

```bash
cd Besu_dapp
docker compose down
docker network rm besu-net       # if you want to remove the network
# rm -rf data/                    # to wipe chain & Postgres state
```
