import { useEffect, useState, useRef } from "react";
import { ethers } from "ethers";
import "./App.css";
const USDT_ADDRESS = "0x0d0d2B8C892D8f44733BFe8a657e1D9D4Fa9996C";

function FaucetApp() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const [userBalance, setUserBalance] = useState("0");
  const [walletType, setWalletType] = useState(null); // 'metamask' | 'rabby'
  const [showWalletModal, setShowWalletModal] = useState(false);

  // USDT Faucet States
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetSuccess, setFaucetSuccess] = useState(null);
  const [faucetError, setFaucetError] = useState(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const getConnectedProvider = () => {
    const activeType = walletType || localStorage.getItem("connectedWalletType") || "metamask";
    if (activeType === "rabby") {
      if (typeof window.rabby !== "undefined") return window.rabby;
      if (typeof window.ethereum !== "undefined") {
        if (window.ethereum.isRabby) return window.ethereum;
        if (window.ethereum.providers) {
          const found = window.ethereum.providers.find(p => p.isRabby);
          if (found) return found;
        }
        return window.ethereum;
      }
      return null;
    } else {
      if (typeof window.ethereum !== "undefined") {
        if (window.ethereum.providers) {
          const found = window.ethereum.providers.find(p => p.isMetaMask);
          if (found) return found;
        }
        return window.ethereum;
      }
      return null;
    }
  };

  const fetchUsdtBalance = async (address) => {
    if (!address) return;
    try {
      const rawProvider = getConnectedProvider();
      if (!rawProvider) return;
      const provider = new ethers.BrowserProvider(rawProvider);
      const usdtContract = new ethers.Contract(USDT_ADDRESS, [
        "function balanceOf(address) view returns (uint256)"
      ], provider);
      const balance = await usdtContract.balanceOf(address);
      setUsdtBalance(ethers.formatUnits(balance, 6));
    } catch (err) {
      console.error("Error fetching USDT balance:", err);
    }
  };

  const checkFaucetCooldown = async (address) => {
    if (!address) return;
    try {
      const rawProvider = getConnectedProvider();
      if (!rawProvider) return;
      const provider = new ethers.BrowserProvider(rawProvider);
      const usdtContract = new ethers.Contract(USDT_ADDRESS, [
        "function lastRequestTime(address) view returns (uint256)",
        "function COOLDOWN_TIME() view returns (uint256)"
      ], provider);
      
      const lastRequest = await usdtContract.lastRequestTime(address);
      const cooldownTime = await usdtContract.COOLDOWN_TIME();
      
      const lastReqNum = Number(lastRequest);
      const cooldownNum = Number(cooldownTime);
      
      if (lastReqNum === 0) {
        setCooldownRemaining(0);
        return;
      }
      
      const currentBlock = await provider.getBlock("latest");
      const currentTimestamp = currentBlock ? currentBlock.timestamp : Math.floor(Date.now() / 1000);
      
      const elapsed = currentTimestamp - lastReqNum;
      if (elapsed < cooldownNum) {
        setCooldownRemaining(cooldownNum - elapsed);
      } else {
        setCooldownRemaining(0);
      }
    } catch (err) {
      console.error("Error checking faucet cooldown:", err);
    }
  };

  const handleFaucetClaim = async () => {
    setFaucetLoading(true);
    setFaucetSuccess(null);
    setFaucetError(null);
    try {
      const rawProvider = getConnectedProvider();
      if (!rawProvider) throw new Error("No wallet provider found. Please connect your wallet.");
      const provider = new ethers.BrowserProvider(rawProvider);
      const signer = await provider.getSigner();
      
      const usdtContract = new ethers.Contract(USDT_ADDRESS, [
        "function requestTokens() external"
      ], signer);

      const tx = await usdtContract.requestTokens();
      const receipt = await tx.wait();
      
      setFaucetSuccess({
        hash: tx.hash,
        blockNumber: Number(receipt.blockNumber)
      });
      
      await fetchUsdtBalance(userAddress);
      await checkFaucetCooldown(userAddress);
      
      const bal = await provider.getBalance(userAddress);
      setUserBalance(ethers.formatEther(bal));
    } catch (err) {
      console.error("Faucet claim error:", err);
      let errorMsg = err.message || "Faucet claim failed.";
      if (err.data && err.data.message) {
        errorMsg = err.data.message;
      } else if (err.reason) {
        errorMsg = err.reason;
      } else if (errorMsg.includes("cooldown") || errorMsg.includes("Cooldown")) {
        errorMsg = "USDTFaucet Cooldown active. Please wait 10 minutes between requests.";
      }
      setFaucetError(errorMsg);
    } finally {
      setFaucetLoading(false);
    }
  };

  useEffect(() => {
    if (userAddress) {
      fetchUsdtBalance(userAddress);
      checkFaucetCooldown(userAddress);
    } else {
      setUsdtBalance("0");
      setCooldownRemaining(0);
    }
  }, [userAddress]);

  useEffect(() => {
    let timer;
    if (cooldownRemaining > 0) {
      timer = setInterval(() => {
        setCooldownRemaining(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const ensureBesuNetwork = async (rawProvider) => {
    const hexChainId = "0x539"; // 1337
    try {
      await rawProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
      return true;
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await rawProvider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: hexChainId,
                chainName: "Besu Local Network",
                nativeCurrency: {
                  name: "Ethereum",
                  symbol: "ETH",
                  decimals: 18,
                },
                rpcUrls: ["http://192.168.18.187:8545"],
              },
            ],
          });
          return true;
        } catch (addError) {
          console.error("Failed to add Besu network:", addError);
          return false;
        }
      } else {
        console.error("Failed to switch to Besu network:", switchError);
        return false;
      }
    }
  };

  const connectWallet = async (type) => {
    let rawProvider = null;
    if (type === "rabby") {
      if (typeof window.rabby !== "undefined") {
        rawProvider = window.rabby;
      } else if (typeof window.ethereum !== "undefined") {
        if (window.ethereum.isRabby) rawProvider = window.ethereum;
        else if (window.ethereum.providers) {
          rawProvider = window.ethereum.providers.find(p => p.isRabby);
        }
        if (!rawProvider) rawProvider = window.ethereum;
      }
      if (!rawProvider) {
        alert("Rabby Wallet extension not detected. Please install Rabby Wallet.");
        return;
      }
    } else {
      if (typeof window.ethereum !== "undefined") {
        if (window.ethereum.providers) {
          rawProvider = window.ethereum.providers.find(p => p.isMetaMask);
        }
        if (!rawProvider) rawProvider = window.ethereum;
      }
      if (!rawProvider) {
        alert("MetaMask extension not detected. Please install MetaMask.");
        return;
      }
    }

    try {
      await ensureBesuNetwork(rawProvider);

      const accounts = await rawProvider.request({ method: "eth_requestAccounts" });
      if (accounts.length > 0) {
        const account = accounts[0];
        setUserAddress(account);
        setWalletConnected(true);
        setWalletType(type);
        localStorage.setItem("connectedWalletType", type);

        const provider = new ethers.BrowserProvider(rawProvider);
        const balance = await provider.getBalance(account);
        setUserBalance(ethers.formatEther(balance));

        rawProvider.on("accountsChanged", async (newAccounts) => {
          if (newAccounts.length > 0) {
            setUserAddress(newAccounts[0]);
            const bal = await provider.getBalance(newAccounts[0]);
            setUserBalance(ethers.formatEther(bal));
          } else {
            disconnectWalletState();
          }
        });

        rawProvider.on("chainChanged", async (hexChainId) => {
          if (parseInt(hexChainId, 16) !== 1337) {
            await ensureBesuNetwork(rawProvider);
          }
          const bal = await provider.getBalance(rawProvider.selectedAddress || accounts[0]);
          setUserBalance(ethers.formatEther(bal));
        });
      }
    } catch (err) {
      console.error("Wallet connection failed:", err);
    } finally {
      setShowWalletModal(false);
    }
  };

  const disconnectWalletState = () => {
    setWalletConnected(false);
    setUserAddress("");
    setUserBalance("0");
    setWalletType(null);
    localStorage.removeItem("connectedWalletType");
  };

  useEffect(() => {
    localStorage.removeItem("adminToken");
    sessionStorage.removeItem("adminToken");

    const savedWallet = localStorage.getItem("connectedWalletType");
    if (savedWallet) {
      let rawProvider = null;
      if (savedWallet === "rabby") {
        if (typeof window.rabby !== "undefined") {
          rawProvider = window.rabby;
        } else if (typeof window.ethereum !== "undefined") {
          if (window.ethereum.isRabby) rawProvider = window.ethereum;
          else if (window.ethereum.providers) {
            rawProvider = window.ethereum.providers.find(p => p.isRabby);
          }
          if (!rawProvider) rawProvider = window.ethereum;
        }
      } else {
        if (typeof window.ethereum !== "undefined") {
          if (window.ethereum.providers) {
            rawProvider = window.ethereum.providers.find(p => p.isMetaMask);
          }
          if (!rawProvider) rawProvider = window.ethereum;
        }
      }

      if (rawProvider) {
        rawProvider.request({ method: "eth_accounts" })
          .then(async (accounts) => {
            if (accounts.length > 0) {
              const account = accounts[0];
              setUserAddress(account);
              setWalletConnected(true);
              setWalletType(savedWallet);

              const chainIdHex = await rawProvider.request({ method: "eth_chainId" });
              if (parseInt(chainIdHex, 16) !== 1337) {
                await ensureBesuNetwork(rawProvider);
              }

              const provider = new ethers.BrowserProvider(rawProvider);
              const balance = await provider.getBalance(account);
              setUserBalance(ethers.formatEther(balance));

              rawProvider.on("accountsChanged", async (newAccounts) => {
                if (newAccounts.length > 0) {
                  setUserAddress(newAccounts[0]);
                  const bal = await provider.getBalance(newAccounts[0]);
                  setUserBalance(ethers.formatEther(bal));
                } else {
                  disconnectWalletState();
                }
              });

              rawProvider.on("chainChanged", async (hexChainId) => {
                if (parseInt(hexChainId, 16) !== 1337) {
                  await ensureBesuNetwork(rawProvider);
                }
                const bal = await provider.getBalance(rawProvider.selectedAddress || account);
                setUserBalance(ethers.formatEther(bal));
              });
            }
          })
          .catch(err => console.error("Error checking auto connection", err));
      }
    }
  }, []);

  const truncate = (str, start = 8, end = 8) => {
    if (!str) return "";
    if (str.length <= start + end) return str;
    return `${str.substring(0, start)}...${str.substring(str.length - end)}`;
  };

  const formatCooldown = (secs) => {
    if (secs <= 0) return "";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="explorer-container">
      {/* Header */}
      <header className="header">
        <div className="title-section">
          <h1>USDT TOKEN FAUCET</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Hyperledger Besu Private QBFT Ledger Faucet Service
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {walletConnected ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "6px 12px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                <span style={{ color: "var(--success)" }}>●</span>
                <span style={{ fontWeight: "600" }} title={userAddress}>{truncate(userAddress, 6, 4)}</span>
                <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(userAddress)} title="Copy Connected Address">📋🔲📁</button>
                <span style={{ opacity: 0.6 }}>|</span>
                <span style={{ color: "var(--accent)", fontWeight: "600" }}>{parseFloat(userBalance).toFixed(4)} ETH</span>
              </div>
              <button
                onClick={disconnectWalletState}
                style={{
                  background: "rgba(255, 85, 85, 0.1)",
                  border: "1px solid rgba(255, 85, 85, 0.3)",
                  color: "#ff5555",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                  fontSize: "12px",
                  transition: "all 0.2s"
                }}
                title="Disconnect Wallet"
                className="disconnect-btn"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowWalletModal(true)}
              style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer", fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}
            >
              👄 Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Navigation Menu to return to explorer */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "30px" }}>
        <a
          href="/"
          className="tab-btn"
          style={{ padding: "10px 24px", fontSize: "15px", borderRadius: "10px", textDecoration: "none", display: "inline-block" }}
        >
          🔍 Back to Block Explorer
        </a>
        <button
          className="tab-btn active"
          style={{ padding: "10px 24px", fontSize: "15px", borderRadius: "10px" }}
        >
          🚰 USDT Faucet
        </button>
        <a
          href="/ico"
          className="tab-btn"
          style={{ padding: "10px 24px", fontSize: "15px", borderRadius: "10px", textDecoration: "none", display: "inline-block" }}
        >
          🪙 ROM ICO Sale
        </a>
      </div>

      {/* USDT Faucet Page */}
      <div className="faucet-container">
        <div className="faucet-card">
          <div className="faucet-header">
            <h2>🚰 Mock USDT Faucet</h2>
            <p>Claim test USDT tokens to participate in the ROM ICO sale.</p>
          </div>

          <div className="faucet-stats">
            <div className="faucet-stat-box">
              <span className="faucet-stat-label">USDT Token Contract</span>
              <span className="faucet-stat-value" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                <a 
                  href={`/?q=${USDT_ADDRESS}`}
                  title="View Contract in Explorer"
                  style={{ color: "var(--accent)", textDecoration: "none" }}
                  className="clickable-hash"
                >
                  {truncate(USDT_ADDRESS, 8, 8)}
                </a>
                <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(USDT_ADDRESS)} title="Copy Address">📋</button>
              </span>
            </div>
            <div className="faucet-stat-box">
              <span className="faucet-stat-label">Your USDT Balance</span>
              <span className="faucet-stat-value" style={{ color: "var(--primary)", fontSize: "20px" }}>
                {parseFloat(usdtBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT
              </span>
            </div>
            <div className="faucet-stat-box">
              <span className="faucet-stat-label">Faucet Yield</span>
              <span className="faucet-stat-value">1,000.00 USDT</span>
            </div>
            <div className="faucet-stat-box">
              <span className="faucet-stat-label">Request Cooldown</span>
              <span className="faucet-stat-value">10 Minutes</span>
            </div>
          </div>

          {walletConnected ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <button
                className="faucet-claim-btn"
                onClick={handleFaucetClaim}
                disabled={faucetLoading || cooldownRemaining > 0}
              >
                {faucetLoading ? (
                  "Processing Request..."
                ) : cooldownRemaining > 0 ? (
                  `Cooldown Active (${formatCooldown(cooldownRemaining)})`
                ) : (
                  "Request 1,000 USDT"
                )}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <button 
                className="faucet-claim-btn"
                onClick={() => setShowWalletModal(true)}
              >
                👄 Connect Wallet to Claim
              </button>
            </div>
          )}

          {faucetSuccess && (
            <div className="success-alert" style={{ marginTop: "24px", textAlign: "left" }}>
              <div>🎉 <strong>Tokens Minted Successfully!</strong></div>
              <div style={{ marginTop: "8px", fontSize: "12px", opacity: 0.9 }}>
                Claimed 1,000.00 USDT. Your balance has been updated.
              </div>
              <div style={{ marginTop: "6px", fontSize: "12px" }}>
                Transaction:{" "}
                <a
                  href={`/?q=${faucetSuccess.hash}`}
                  style={{ textDecoration: "underline", fontWeight: "bold", color: "#4ade80" }}
                >
                  {truncate(faucetSuccess.hash, 10, 10)}
                </a>
              </div>
            </div>
          )}

          {faucetError && (
            <div className="error-alert" style={{ marginTop: "24px", textAlign: "left" }}>
              ❌ <strong>Error claiming tokens:</strong> {faucetError}
            </div>
          )}

          <div className="faucet-info-section">
            <div className="faucet-info-title">
              <span>ℹ️</span> Faucet Information & Rules
            </div>
            <ul className="faucet-info-list">
              <li>This faucet distributes mock USDT for use strictly on the local Hyperledger Besu private network.</li>
              <li>Each request mints exactly 1,000 USDT (with 6 decimal places) directly to your connected EVM wallet.</li>
              <li>To prevent abuse, there is a 10-minute cooldown period per account between requests.</li>
              <li>Ensure you have a small amount of native ETH to cover the transaction gas fees (gas price is 0 on this network, but standard validation still requires basic gas limits).</li>
            </ul>
          </div>
        </div>
      </div>

      {showWalletModal && (
        <div className="wallet-modal-overlay" onClick={() => setShowWalletModal(false)}>
          <div className="wallet-modal" onClick={e => e.stopPropagation()}>
            <div className="wallet-modal-header">
              <h3>Connect a Wallet</h3>
              <button className="close-btn" onClick={() => setShowWalletModal(false)}>×</button>
            </div>
            <div className="wallet-modal-body">
              <button className="wallet-option-btn" onClick={() => connectWallet("metamask")}>
                <span className="wallet-icon">🦊</span>
                <span className="wallet-name">MetaMask</span>
              </button>
              <button className="wallet-option-btn" onClick={() => connectWallet("rabby")}>
                <span className="wallet-icon">🐰</span>
                <span className="wallet-name">Rabby Wallet</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FaucetApp;
