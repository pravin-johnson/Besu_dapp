import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { ethers } from "ethers";
import "./App.css";

const API_BASE = "http://localhost:3001";
const USDT_ADDRESS = "0x0d0d2B8C892D8f44733BFe8a657e1D9D4Fa9996C";
const ROM_ADDRESS = "0x51Dc997cDB30770f82AB0f4EFB00863a6A42922a";

function App() {
  const [stats, setStats] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [validators, setValidators] = useState([]);
  const initialValidatorsBaseline = useRef(null);
  const [romMetadata, setRomMetadata] = useState(null);

  // Main column tab state: 'blocks' | 'validators'
  const [mainTab, setMainTab] = useState("blocks");

  // Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchType, setSearchType] = useState(null); // 'address' | 'tx' | 'block'
  const [searchError, setSearchError] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // Address Details Tab State
  const [activeTab, setActiveTab] = useState("portfolio"); // 'portfolio' | 'txs' | 'transfers' | 'contract'
  const [walletTxs, setWalletTxs] = useState([]);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [tokenTransfers, setTokenTransfers] = useState([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);

  // Write Contract States
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeResult, setWriteResult] = useState(null);
  const [writeError, setWriteError] = useState(null);
  const [formInputs, setFormInputs] = useState({
    transferTo: "",
    transferAmount: "",
    approveSpender: "",
    approveAmount: "",
    transferFromFrom: "",
    transferFromTo: "",
    transferFromAmount: "",
    balanceOfOwner: "",
    allowanceOwner: "",
    allowanceSpender: ""
  });
  const [readLoading, setReadLoading] = useState(false);
  const [readResults, setReadResults] = useState({
    balanceOf: null,
    allowance: null
  });
  const [txPrivacy, setTxPrivacy] = useState({
    isPrivate: false,
    privateFrom: "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=",
    privateFor: "85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE="
  });

  const [walletConnected, setWalletConnected] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const [userBalance, setUserBalance] = useState("0");
  const [walletType, setWalletType] = useState(null); // 'metamask' | 'rabby'
  const [showWalletModal, setShowWalletModal] = useState(false);

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

  // Current View state: 'explorer' | 'faucet'
  const [currentView, setCurrentView] = useState("explorer");

  // USDT Faucet States
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetSuccess, setFaucetSuccess] = useState(null);
  const [faucetError, setFaucetError] = useState(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

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

  // Initial load & polling
  useEffect(() => {
    // Clear admin tokens on mount of any public views to terminate active admin sessions
    localStorage.removeItem("adminToken");
    sessionStorage.removeItem("adminToken");

    // Load static ROM metadata once
    axios.get(`${API_BASE}/rom/metadata`)
      .then(res => setRomMetadata(res.data))
      .catch(err => console.error("Error fetching ROM metadata", err));

    const fetchData = () => {
      // Fetch network stats
      axios.get(`${API_BASE}/network/stats`)
        .then(res => setStats(res.data))
        .catch(err => console.error("Error fetching stats", err));

      // Fetch recent blocks
      axios.get(`${API_BASE}/blocks`)
        .then(res => setBlocks(res.data))
        .catch(err => console.error("Error fetching blocks", err));

      // Fetch validator metrics
      axios.get(`${API_BASE}/validators`)
        .then(res => {
          if (!initialValidatorsBaseline.current) {
            initialValidatorsBaseline.current = res.data;
          }
          const baseline = initialValidatorsBaseline.current;
          let totalSessionBlocks = 0;
          
          const sessionData = res.data.map(current => {
            const base = baseline.find(v => v.address === current.address);
            const baseBlocks = base ? base.blocksProposed : 0;
            const sessionBlocks = Math.max(0, current.blocksProposed - baseBlocks);
            totalSessionBlocks += sessionBlocks;
            return { ...current, blocksProposed: sessionBlocks };
          });

          const finalizedData = sessionData.map(v => ({
            ...v,
            percentage: totalSessionBlocks === 0 ? "0.0" : ((v.blocksProposed / totalSessionBlocks) * 100).toFixed(1)
          }));
          
          setValidators(finalizedData);
        })
        .catch(err => console.error("Error fetching validators", err));
    };

    fetchData();
    const interval = setInterval(fetchData, 4000); // refresh every 4 seconds

    return () => clearInterval(interval);
  }, []);

  const handleSearch = async (e, queryToSearch = null, skipPushState = false) => {
    if (e) e.preventDefault();
    const query = (queryToSearch !== null ? queryToSearch : searchQuery).trim();
    if (!query) return;

    setLoadingSearch(true);
    setSearchError(null);
    setSearchResult(null);
    setSearchType(null);
    setActiveTab("portfolio");
    setWalletTxs([]);
    setTokenTransfers([]);

    // Update URL query parameters to enable standard browser back/forward buttons
    if (!skipPushState) {
      const newUrl = `${window.location.pathname}?q=${encodeURIComponent(query)}`;
      window.history.pushState({ query }, "", newUrl);
    }

    try {
      if (query.startsWith("0x") && query.length === 66) {
        // Search Transaction
        const res = await axios.get(`${API_BASE}/tx/${query}`);
        setSearchResult(res.data);
        setSearchType("tx");
      } else if (query.startsWith("0x") && query.length === 42) {
        // Search Address
        const res = await axios.get(`${API_BASE}/address/${query}`);
        setSearchResult(res.data);
        setSearchType("address");
        
        // Fetch wallet txs and token transfers in parallel
        const [txsRes, transfersRes] = await Promise.all([
          axios.get(`${API_BASE}/address/${res.data.address}/txs`).catch(() => ({ data: [] })),
          axios.get(`${API_BASE}/address/${res.data.address}/transfers`).catch(() => ({ data: [] }))
        ]);

        setWalletTxs(txsRes.data);
        setTokenTransfers(transfersRes.data);
      } else if (!isNaN(query)) {
        // Search Block Number
        const res = await axios.get(`${API_BASE}/blocks/${query}`);
        setSearchResult(res.data);
        setSearchType("block");
      } else {
        setSearchError("Invalid search query. Enter a valid Address, Tx Hash, or Block Number.");
      }
    } catch (err) {
      setSearchError(
        err.response?.data?.error || "Search target not found in the Besu network."
      );
    } finally {
      setLoadingSearch(false);
    }
  };

  const fetchWalletTxs = async (address) => {
    try {
      const res = await axios.get(`${API_BASE}/address/${address}/txs`);
      setWalletTxs(res.data);
    } catch (err) {
      console.error("Error fetching wallet txs", err);
    }
  };

  const fetchTokenTransfers = async (address) => {
    try {
      const res = await axios.get(`${API_BASE}/address/${address}/transfers`);
      setTokenTransfers(res.data);
    } catch (err) {
      console.error("Error fetching token transfers", err);
    }
  };


  // Browser Back/Forward history navigation listener
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q") || "";
      setSearchQuery(q);
      if (q) {
        handleSearch(null, q, true);
      } else {
        setSearchResult(null);
        setSearchType(null);
        setSearchError(null);
      }
    };

    window.addEventListener("popstate", handlePopState);

    // Run search on initial page load if q parameter is present
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      setSearchQuery(q);
      handleSearch(null, q, true);
    }

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleQuickSearch = (value) => {
    setSearchQuery(value);
    handleSearch(null, value);
  };

  const handleWriteContract = async (functionName, e) => {
    e.preventDefault();
    setWriteLoading(true);
    setWriteResult(null);
    setWriteError(null);

    const decimals = searchResult.tokenMetadata?.decimals || 18;
    const params = [];
    if (functionName === "transfer") {
      if (!formInputs.transferTo || !formInputs.transferAmount) {
        setWriteError("Please fill in both Recipient and Amount fields.");
        setWriteLoading(false);
        return;
      }
      params.push(formInputs.transferTo);
      try {
        const valueInWei = (parseFloat(formInputs.transferAmount) * Math.pow(10, decimals)).toLocaleString('fullwide', { useGrouping: false });
        params.push(valueInWei);
      } catch (err) {
        setWriteError("Invalid Amount value.");
        setWriteLoading(false);
        return;
      }
    } else if (functionName === "approve") {
      if (!formInputs.approveSpender || !formInputs.approveAmount) {
        setWriteError("Please fill in both Spender and Amount fields.");
        setWriteLoading(false);
        return;
      }
      params.push(formInputs.approveSpender);
      try {
        const valueInWei = (parseFloat(formInputs.approveAmount) * Math.pow(10, decimals)).toLocaleString('fullwide', { useGrouping: false });
        params.push(valueInWei);
      } catch (err) {
        setWriteError("Invalid Amount value.");
        setWriteLoading(false);
        return;
      }
    } else if (functionName === "transferFrom") {
      if (!formInputs.transferFromFrom || !formInputs.transferFromTo || !formInputs.transferFromAmount) {
        setWriteError("Please fill in Source, Recipient, and Amount fields.");
        setWriteLoading(false);
        return;
      }
      params.push(formInputs.transferFromFrom);
      params.push(formInputs.transferFromTo);
      try {
        const valueInWei = (parseFloat(formInputs.transferFromAmount) * Math.pow(10, decimals)).toLocaleString('fullwide', { useGrouping: false });
        params.push(valueInWei);
      } catch (err) {
        setWriteError("Invalid Amount value.");
        setWriteLoading(false);
        return;
      }
    }

    if (!txPrivacy.isPrivate && walletConnected) {
      try {
        const rawProvider = getConnectedProvider();
        if (!rawProvider) throw new Error("No active wallet provider found.");
        const provider = new ethers.BrowserProvider(rawProvider);
        const signer = await provider.getSigner();
        
        const minABI = [
          "function transfer(address to, uint256 value) public returns (bool)",
          "function approve(address spender, uint256 value) public returns (bool)",
          "function transferFrom(address from, address to, uint256 value) public returns (bool)"
        ];
        
        const contract = new ethers.Contract(searchResult.address, minABI, signer);
        
        const nonce = await provider.getTransactionCount(userAddress);
        
        let tx;
        if (functionName === "transfer") {
          tx = await contract.transfer(params[0], params[1], { nonce: nonce });
        } else if (functionName === "approve") {
          tx = await contract.approve(params[0], params[1], { nonce: nonce });
        } else if (functionName === "transferFrom") {
          tx = await contract.transferFrom(params[0], params[1], params[2], { nonce: nonce });
        }
        
        const receipt = await tx.wait();
        setWriteResult({
          hash: tx.hash,
          blockNumber: Number(receipt.blockNumber),
          gasUsed: receipt.gasUsed.toString()
        });
        
        setFormInputs(prev => ({
          ...prev,
          transferTo: "",
          transferAmount: "",
          approveSpender: "",
          approveAmount: "",
          transferFromFrom: "",
          transferFromTo: "",
          transferFromAmount: ""
        }));
        
        const updatedBal = await provider.getBalance(userAddress);
        setUserBalance(ethers.formatEther(updatedBal));
        
        const updatedAddr = await axios.get(`${API_BASE}/address/${searchResult.address}`);
        setSearchResult(updatedAddr.data);
        fetchWalletTxs(searchResult.address);
        fetchTokenTransfers(searchResult.address);
        setWriteLoading(false);
        return;
      } catch (walletErr) {
        setWriteError(walletErr.message || "Wallet transaction failed.");
        setWriteLoading(false);
        return;
      }
    }

    try {
      const res = await axios.post(`${API_BASE}/contract/${searchResult.address}/write`, {
        functionName,
        params,
        isPrivate: txPrivacy.isPrivate,
        privateFrom: txPrivacy.privateFrom,
        privateFor: txPrivacy.privateFor
      });
      setWriteResult(res.data);
      setFormInputs(prev => ({
        ...prev,
        transferTo: "",
        transferAmount: "",
        approveSpender: "",
        approveAmount: "",
        transferFromFrom: "",
        transferFromTo: "",
        transferFromAmount: ""
      }));
      const updatedAddr = await axios.get(`${API_BASE}/address/${searchResult.address}`);
      setSearchResult(updatedAddr.data);
      fetchWalletTxs(searchResult.address);
      fetchTokenTransfers(searchResult.address);
    } catch (err) {
      setWriteError(err.response?.data?.error || "Transaction execution failed.");
    } finally {
      setWriteLoading(false);
    }
  };

  const handleReadContract = async (functionName, e) => {
    e.preventDefault();
    setReadLoading(true);
    setReadResults(prev => ({ ...prev, [functionName]: null }));

    const params = [];
    if (functionName === "balanceOf") {
      if (!formInputs.balanceOfOwner) {
        alert("Please enter Owner Address");
        setReadLoading(false);
        return;
      }
      params.push(formInputs.balanceOfOwner);
    } else if (functionName === "allowance") {
      if (!formInputs.allowanceOwner || !formInputs.allowanceSpender) {
        alert("Please enter both Owner and Spender Addresses");
        setReadLoading(false);
        return;
      }
      params.push(formInputs.allowanceOwner);
      params.push(formInputs.allowanceSpender);
    }

    try {
      const res = await axios.post(`${API_BASE}/contract/${searchResult.address}/read`, {
        functionName,
        params,
        isPrivate: txPrivacy.isPrivate,
        privateFrom: txPrivacy.privateFrom,
        privateFor: txPrivacy.privateFor
      });

      let displayValue = "";
      if (res.data.result) {
        const rawRes = res.data.result;
        const val = Array.isArray(rawRes) ? rawRes[0] : rawRes;
        
        const decimals = searchResult.tokenMetadata?.decimals || 18;
        displayValue = ethers.formatUnits(val, decimals);
      }
      
      setReadResults(prev => ({ ...prev, [functionName]: displayValue }));
    } catch (err) {
      alert(err.response?.data?.error || "Failed to read contract state.");
    } finally {
      setReadLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormInputs(prev => ({ ...prev, [field]: value }));
  };

  const truncate = (str, start = 8, end = 8) => {
    if (!str) return "";
    if (str.length <= start + end) return str;
    return `${str.substring(0, start)}...${str.substring(str.length - end)}`;
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const date = new Date(ts * 1000);
    return date.toLocaleTimeString();
  };

  return (
    <div className="explorer-container">
      {/* Header */}
      <header className="header">
        <div className="title-section">
          <h1>BESU NETWORK EXPLORER</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Hyperledger Besu Private QBFT Ledger Dashboard
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

          {/* <div className="status-badge">
            <span className="status-dot"></span>
            <span>Besu Network Connected</span>
          </div> */}
        </div>
      </header>

      {/* Network Stats Cards */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Current Height</div>
          <div className="stat-value">#{stats?.blockHeight ?? "..."}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Peers</div>
          <div className="stat-value">{stats?.peerCount ?? "..."}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gas Price</div>
          <div className="stat-value">{stats?.gasPrice ? `${stats.gasPrice} Gwei` : "..."}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Current TPS</div>
          <div className="stat-value">{stats?.tps !== undefined ? `${stats.tps} tx/s` : "..."}</div>
        </div>
      </section>

      {/* Navigation Menu */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "30px" }}>
        <button
          className="tab-btn active"
          style={{ padding: "10px 24px", fontSize: "15px", borderRadius: "10px" }}
        >
          🔍 Block Explorer
        </button>
        <a
          href="/faucet"
          className="tab-btn"
          style={{ padding: "10px 24px", fontSize: "15px", borderRadius: "10px", textDecoration: "none", display: "inline-block" }}
        >
          🚰 USDT Faucet
        </a>
        <a
          href="/ico"
          className="tab-btn"
          style={{ padding: "10px 24px", fontSize: "15px", borderRadius: "10px", textDecoration: "none", display: "inline-block" }}
        >
          🪙 ROM ICO Sale
        </a>
      </div>

      {currentView === "explorer" ? (
        <>
          {/* Search Bar */}
      <section className="search-card">
        <div className="search-title">Search Address, Transaction Hash or Block Number</div>
        <form onSubmit={handleSearch} className="search-bar">
          <input
            className="search-input"
            type="text"
            placeholder="Address (0x...) / Tx Hash (0x...) / Block Number (e.g. 100)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button id="search-submit-btn" className="search-button" type="submit" disabled={loadingSearch}>
            {loadingSearch ? "Searching..." : "Search"}
          </button>
        </form>
        {searchError && (
          <p className="error-text" style={{ marginTop: "12px", marginBottom: 0 }}>
            ⚠️ {searchError}
          </p>
        )}
      </section>

      {/* Search Results Display */}
      {searchResult && (
        <section className="result-panel">
          <div className="result-header">
            <div className="result-title">
              🔍 Search Result: {searchType === "address" ? "Account Profile" : searchType === "tx" ? "Transaction Details" : "Block Details"}
            </div>
            <button className="close-btn" onClick={() => setSearchResult(null)}>×</button>
          </div>

          {searchType === "address" ? (
            <div>
              <div className="tab-bar">
                <button className={`tab-btn ${activeTab === "portfolio" ? "active" : ""}`} onClick={() => setActiveTab("portfolio")}>
                  Balance & Info
                </button>
                <button className={`tab-btn ${activeTab === "txs" ? "active" : ""}`} onClick={() => { setActiveTab("txs"); fetchWalletTxs(searchResult.address); }}>
                  Transactions ({walletTxs.length})
                </button>
                <button className={`tab-btn ${activeTab === "transfers" ? "active" : ""}`} onClick={() => { setActiveTab("transfers"); fetchTokenTransfers(searchResult.address); }}>
                  Token Transfers ({tokenTransfers.length})
                </button>
                {searchResult.isContract && (
                  <button className={`tab-btn ${activeTab === "contract" ? "active" : ""}`} onClick={() => setActiveTab("contract")}>
                    Contract Panel
                  </button>
                )}
              </div>

              <div className="tab-content">
                {activeTab === "portfolio" && (
                  <div className="result-grid">
                    <div className="result-row">
                      <span className="result-key">Address:</span>
                      <div className="result-val" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontFamily: "ui-monospace, monospace" }}>{searchResult.address}</span>
                        <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(searchResult.address)} title="Copy Address">📋</button>
                      </div>
                    </div>
                    <div className="result-row">
                      <span className="result-key">Native Balance:</span>
                      <span className="result-val">{searchResult.balance} ETH</span>
                    </div>
                    <div className="result-row">
                      <span className="result-key">ROM Token Balance:</span>
                      <span className="result-val">
                        {parseFloat(searchResult.romBalance || "0").toLocaleString(undefined, { maximumFractionDigits: 4 })} ROM
                        <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--text-secondary)", opacity: 0.7 }}>(public chain)</span>
                      </span>
                    </div>
                    {searchResult.privateRomBalance !== undefined && (
                      <div className="result-row" style={{ background: "rgba(130,80,255,0.06)", borderRadius: "8px", border: "1px solid rgba(130,80,255,0.2)", padding: "8px 12px" }}>
                        <span className="result-key" style={{ color: "#b48cff" }}>
                          🔒 Private ROM Balance:
                        </span>
                        <span className="result-val" style={{ color: "#b48cff", fontWeight: 700 }}>
                          {parseFloat(searchResult.privateRomBalance || "0").toLocaleString(undefined, { maximumFractionDigits: 4 })} ROM
                          <span style={{ marginLeft: "8px", fontSize: "11px", background: "rgba(130,80,255,0.25)", border: "1px solid rgba(130,80,255,0.4)", borderRadius: "4px", padding: "1px 6px", fontWeight: 600 }}>Tessera Private</span>
                        </span>
                      </div>
                    )}
                    <div className="result-row">
                      <span className="result-key">Nonce (Transaction Count):</span>
                      <span className="result-val">{searchResult.nonce}</span>
                    </div>
                    <div className="result-row">
                      <span className="result-key">Account Type:</span>
                      <span className="result-val">
                        {searchResult.isContract ? "Smart Contract 📜" : "User Wallet (EOA) 🔑"}
                      </span>
                    </div>
                  </div>

                )}

                {activeTab === "txs" && (
                  <div className="table-container">
                    {loadingTxs ? (
                      <p style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>Scanning database for transactions...</p>
                    ) : walletTxs.length === 0 ? (
                      <p style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>No transactions found in database.</p>
                    ) : (
                      <table className="explorer-table">
                        <thead>
                          <tr>
                            <th>Tx Hash</th>
                            <th>Block</th>
                            <th>From</th>
                            <th>Direction</th>
                            <th>To</th>
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {walletTxs.map(tx => {
                            const isIncoming = tx.to && tx.to.toLowerCase() === searchResult.address.toLowerCase();
                            return (
                              <tr key={tx.hash}>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(tx.hash)}>
                                      {truncate(tx.hash, 6, 6)}
                                    </span>
                                    {tx.isPrivate && (
                                      <span style={{ fontSize: "12px" }} title="Private Transaction (Tessera)">🔒</span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <a href="#" className="block-link" onClick={(e) => { e.preventDefault(); handleQuickSearch(tx.blockNumber.toString()); }}>
                                    #{tx.blockNumber}
                                  </a>
                                </td>
                                <td>
                                  <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(tx.from)}>
                                    {truncate(tx.from, 6, 6)}
                                  </span>
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  <span className={`badge-status ${isIncoming ? "success" : "failed"}`} style={{ fontSize: "11px", padding: "2px 6px" }}>
                                    {isIncoming ? "IN" : "OUT"}
                                  </span>
                                </td>
                                <td>
                                  {tx.to ? (
                                    <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(tx.to)}>
                                      {truncate(tx.to, 6, 6)}
                                    </span>
                                  ) : (
                                    <span className="hash-text" style={{ fontStyle: "italic", color: "var(--text-secondary)" }}>Contract Creation</span>
                                  )}
                                </td>
                                <td>{tx.value} ETH</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {activeTab === "transfers" && (
                  <div className="table-container">
                    {loadingTransfers ? (
                      <p style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>Scanning database for transfers...</p>
                    ) : tokenTransfers.length === 0 ? (
                      <p style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>No token transfers found in database.</p>
                    ) : (
                      <table className="explorer-table">
                        <thead>
                          <tr>
                            <th>Tx Hash</th>
                            <th>Block</th>
                            <th>From</th>
                            <th>Direction</th>
                            <th>To</th>
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tokenTransfers.map(tr => {
                            const isIncoming = tr.to && tr.to.toLowerCase() === searchResult.address.toLowerCase();
                            return (
                              <tr key={tr.id}>
                                <td>
                                  <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(tr.txHash)}>
                                    {truncate(tr.txHash, 6, 6)}
                                  </span>
                                </td>
                                <td>
                                  <a href="#" className="block-link" onClick={(e) => { e.preventDefault(); handleQuickSearch(tr.blockNumber.toString()); }}>
                                    #{tr.blockNumber}
                                  </a>
                                </td>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(tr.from)}>
                                      {truncate(tr.from, 6, 6)}
                                    </span>
                                    <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(tr.from)} title="Copy Address">📋</button>
                                  </div>
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  <span className={`badge-status ${isIncoming ? "success" : "failed"}`} style={{ fontSize: "11px", padding: "2px 6px" }}>
                                    {isIncoming ? "IN" : "OUT"}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(tr.to)}>
                                      {truncate(tr.to, 6, 6)}
                                    </span>
                                    <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(tr.to)} title="Copy Address">📋</button>
                                  </div>
                                </td>
                                <td style={{ fontWeight: "600" }}>
                                  {tr.value}{" "}
                                  <span 
                                    className="clickable-hash" 
                                    style={{ color: "var(--primary)", fontWeight: "bold" }}
                                    onClick={() => handleQuickSearch(tr.tokenAddress || ROM_ADDRESS)}
                                    title="View Contract Details"
                                  >
                                    ROM
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {activeTab === "contract" && (
                  <div>
                    <div style={{ marginBottom: "24px" }}>
                      <h4 style={{ color: "#fff", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "8px", margin: "0 0 12px 0" }}>
                        🔍 Read Contract ({searchResult.tokenMetadata ? searchResult.tokenMetadata.symbol : "Contract"} Public Properties)
                      </h4>
                      {searchResult.tokenMetadata ? (
                        <div className="result-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                          <div className="result-row"><span className="result-key">name()</span><span className="result-val">{searchResult.tokenMetadata.name}</span></div>
                          <div className="result-row"><span className="result-key">symbol()</span><span className="result-val">{searchResult.tokenMetadata.symbol}</span></div>
                          <div className="result-row"><span className="result-key">decimals()</span><span className="result-val">{searchResult.tokenMetadata.decimals}</span></div>
                          <div className="result-row"><span className="result-key">totalSupply()</span><span className="result-val">{parseFloat(searchResult.tokenMetadata.totalSupply).toLocaleString()} {searchResult.tokenMetadata.symbol}</span></div>
                        </div>
                      ) : (
                        <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>Properties unavailable for this custom contract address.</p>
                      )}
                    </div>

                    {searchResult.tokenMetadata && (
                      <div style={{ marginBottom: "24px" }}>
                        <h4 style={{ color: "#fff", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "8px", margin: "0 0 16px 0" }}>
                          ✍️ Write Contract (Execute Signed Admin Transactions)
                        </h4>

                        {/* Tessera Privacy Configuration Toggle */}
                        <div style={{ background: "rgba(138, 43, 226, 0.08)", border: "1px solid rgba(138, 43, 226, 0.25)", padding: "14px", borderRadius: "10px", marginBottom: "20px", textAlign: "left" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", color: "#d1a3ff", fontWeight: "600" }}>
                            <input
                              type="checkbox"
                              checked={txPrivacy.isPrivate}
                              onChange={(e) => setTxPrivacy({ ...txPrivacy, isPrivate: e.target.checked })}
                            />
                            🔒 Send as Private Transaction (Tessera)
                          </label>
                          {txPrivacy.isPrivate && (
                            <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                              <div>
                                <label className="form-label" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Private From (Tessera Public Key)</label>
                                <input
                                  className="form-input"
                                  style={{ padding: "6px 10px", fontSize: "12px", background: "rgba(0,0,0,0.3)" }}
                                  type="text"
                                  value={txPrivacy.privateFrom}
                                  onChange={(e) => setTxPrivacy({ ...txPrivacy, privateFrom: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="form-label" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Private For (Comma-separated Tessera Keys)</label>
                                <input
                                  className="form-input"
                                  style={{ padding: "6px 10px", fontSize: "12px", background: "rgba(0,0,0,0.3)" }}
                                  type="text"
                                  placeholder="e.g. Key1, Key2"
                                  value={txPrivacy.privateFor}
                                  onChange={(e) => setTxPrivacy({ ...txPrivacy, privateFor: e.target.value })}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", textAlign: "left" }}>
                          <form onSubmit={(e) => handleWriteContract("transfer", e)} style={{ background: "rgba(0,0,0,0.2)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <h5 style={{ color: "var(--primary)", margin: "0 0 12px 0", fontSize: "14px" }}>1. transfer(to, value)</h5>
                            <div className="form-group">
                              <label className="form-label">Recipient Address</label>
                              <input
                                className="form-input"
                                type="text"
                                placeholder="0x..."
                                value={formInputs.transferTo}
                                onChange={(e) => handleInputChange("transferTo", e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Amount ({searchResult.tokenMetadata.symbol} Tokens)</label>
                              <input
                                className="form-input"
                                type="number"
                                step="any"
                                placeholder="e.g. 100"
                                value={formInputs.transferAmount}
                                onChange={(e) => handleInputChange("transferAmount", e.target.value)}
                              />
                            </div>
                            <button className="form-submit" type="submit" disabled={writeLoading}>
                              {writeLoading ? "Executing..." : "Execute Transfer"}
                            </button>
                          </form>

                          <form onSubmit={(e) => handleWriteContract("approve", e)} style={{ background: "rgba(0,0,0,0.2)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <h5 style={{ color: "var(--accent)", margin: "0 0 12px 0", fontSize: "14px" }}>2. approve(spender, value)</h5>
                            <div className="form-group">
                              <label className="form-label">Spender Address</label>
                              <input
                                className="form-input"
                                type="text"
                                placeholder="0x..."
                                value={formInputs.approveSpender}
                                onChange={(e) => handleInputChange("approveSpender", e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Amount ({searchResult.tokenMetadata.symbol} Tokens)</label>
                              <input
                                className="form-input"
                                type="number"
                                step="any"
                                placeholder="e.g. 500"
                                value={formInputs.approveAmount}
                                onChange={(e) => handleInputChange("approveAmount", e.target.value)}
                              />
                            </div>
                            <button className="form-submit" type="submit" disabled={writeLoading}>
                              {writeLoading ? "Executing..." : "Execute Approve"}
                            </button>
                          </form>

                          <form onSubmit={(e) => handleWriteContract("transferFrom", e)} style={{ background: "rgba(0,0,0,0.2)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <h5 style={{ color: "#d1a3ff", margin: "0 0 12px 0", fontSize: "14px" }}>3. transferFrom(from, to, value)</h5>
                            <div className="form-group">
                              <label className="form-label">Source Address (From)</label>
                              <input
                                className="form-input"
                                type="text"
                                placeholder="0x..."
                                value={formInputs.transferFromFrom}
                                onChange={(e) => handleInputChange("transferFromFrom", e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Recipient Address (To)</label>
                              <input
                                className="form-input"
                                type="text"
                                placeholder="0x..."
                                value={formInputs.transferFromTo}
                                onChange={(e) => handleInputChange("transferFromTo", e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Amount ({searchResult.tokenMetadata.symbol} Tokens)</label>
                              <input
                                className="form-input"
                                type="number"
                                step="any"
                                placeholder="e.g. 100"
                                value={formInputs.transferFromAmount}
                                onChange={(e) => handleInputChange("transferFromAmount", e.target.value)}
                              />
                            </div>
                            <button className="form-submit" type="submit" disabled={writeLoading}>
                              {writeLoading ? "Executing..." : "Execute TransferFrom"}
                            </button>
                          </form>
                        </div>

                        {writeResult && (
                          <div className="success-alert">
                            🎉 Transaction Executed Successfully!
                            {writeResult.isPrivate && (
                              <span style={{ marginLeft: "8px", background: "rgba(130,80,255,0.25)", border: "1px solid rgba(130,80,255,0.5)", borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: 700, color: "#b48cff", verticalAlign: "middle" }}>
                                🔒 PRIVATE (Tessera)
                              </span>
                            )}
                            <br />
                            <b>Hash:</b> {writeResult.hash} <br />
                            <b>Block:</b> {writeResult.blockNumber != null ? `#${writeResult.blockNumber}` : "Confirming..."} | <b>Gas Used:</b> {writeResult.gasUsed || "—"}
                          </div>
                        )}

                        {writeError && (
                          <div className="error-alert">
                            ❌ Error: {writeError}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Read Contract (Query State) Section */}
                    {searchResult.tokenMetadata && (
                      <div style={{ marginBottom: "24px" }}>
                        <h4 style={{ color: "#fff", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "8px", margin: "16px 0 16px 0" }}>
                          🔍 Read Contract (Query State)
                        </h4>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", textAlign: "left" }}>
                          <form onSubmit={(e) => handleReadContract("balanceOf", e)} style={{ background: "rgba(0,0,0,0.2)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <h5 style={{ color: "var(--primary)", margin: "0 0 12px 0", fontSize: "14px" }}>1. balanceOf(owner)</h5>
                            <div className="form-group">
                              <label className="form-label">Owner Address</label>
                              <input
                                className="form-input"
                                type="text"
                                placeholder="0x..."
                                value={formInputs.balanceOfOwner}
                                onChange={(e) => handleInputChange("balanceOfOwner", e.target.value)}
                              />
                            </div>
                            <button className="form-submit" type="submit" disabled={readLoading}>
                              {readLoading ? "Querying..." : "Query Balance"}
                            </button>
                            {readResults.balanceOf !== null && (
                              <div style={{ marginTop: "12px", background: "rgba(255,255,255,0.04)", padding: "8px", borderRadius: "6px", fontSize: "13px" }}>
                                <b>Result:</b> {readResults.balanceOf} {searchResult.tokenMetadata.symbol}
                              </div>
                            )}
                          </form>

                          <form onSubmit={(e) => handleReadContract("allowance", e)} style={{ background: "rgba(0,0,0,0.2)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <h5 style={{ color: "var(--accent)", margin: "0 0 12px 0", fontSize: "14px" }}>2. allowance(owner, spender)</h5>
                            <div className="form-group">
                              <label className="form-label">Owner Address</label>
                              <input
                                className="form-input"
                                type="text"
                                placeholder="0x..."
                                value={formInputs.allowanceOwner}
                                onChange={(e) => handleInputChange("allowanceOwner", e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Spender Address</label>
                              <input
                                className="form-input"
                                type="text"
                                placeholder="0x..."
                                value={formInputs.allowanceSpender}
                                onChange={(e) => handleInputChange("allowanceSpender", e.target.value)}
                              />
                            </div>
                            <button className="form-submit" type="submit" disabled={readLoading}>
                              {readLoading ? "Querying..." : "Query Allowance"}
                            </button>
                            {readResults.allowance !== null && (
                              <div style={{ marginTop: "12px", background: "rgba(255,255,255,0.04)", padding: "8px", borderRadius: "6px", fontSize: "13px" }}>
                                <b>Result:</b> {readResults.allowance} {searchResult.tokenMetadata.symbol}
                              </div>
                            )}
                          </form>
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 style={{ color: "#fff", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "8px", margin: "16px 0 12px 0" }}>
                        💾 Contract Bytecode (eth_getCode)
                      </h4>
                      <div className="bytecode-box">{searchResult.bytecode}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="result-grid">
              {searchType === "tx" && (() => {
                const isAuthorized = walletConnected && userAddress && (
                  userAddress.toLowerCase() === searchResult.from?.toLowerCase() ||
                  userAddress.toLowerCase() === searchResult.privateFromAddress?.toLowerCase() ||
                  userAddress.toLowerCase() === searchResult.privateToAddress?.toLowerCase() ||
                  // Special DApp flow participant check
                  ((searchResult.from?.toLowerCase() === "0x5c8f4a8953b1e57f82268acd465efd694bd978b9" ||
                    searchResult.from?.toLowerCase() === "0x6ea6a6b067e69317c8c278d006f0064ccfedb687" ||
                    searchResult.privateFromAddress?.toLowerCase() === "0x6ea6a6b067e69317c8c278d006f0064ccfedb687") &&
                   (userAddress.toLowerCase() === "0x71d88765b4956b14a4c85cebc926334ae5bfd7a4" ||
                    userAddress.toLowerCase() === "0x6ea6a6b067e69317c8c278d006f0064ccfedb687")) ||
                  (searchResult.tokenTransfers && searchResult.tokenTransfers.some(t => t.from?.toLowerCase() === userAddress.toLowerCase() || t.to?.toLowerCase() === userAddress.toLowerCase()))
                );

                return (
                  <>
                    <div className="result-row">
                      <span className="result-key">Tx Hash:</span>
                      <span className="result-val">{searchResult.hash}</span>
                    </div>
                    <div className="result-row">
                      <span className="result-key">Classification:</span>
                      <span className="result-val">
                        {searchResult.isPrivate ? (
                          <span className="badge-status failed" style={{ background: "rgba(168, 85, 247, 0.2)", color: "#c084fc", border: "1px solid rgba(168, 85, 247, 0.4)", fontWeight: "bold" }}>
                            🔒 Private Transaction
                          </span>
                        ) : (
                          <span className="badge-status success" style={{ fontWeight: "bold" }}>
                            🔓 Public Transaction
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="result-row">
                      <span className="result-key">Status:</span>
                      <span className="result-val">
                        <span className={`badge-status ${searchResult.status === "Success" ? "success" : "failed"}`}>
                          {searchResult.status}
                        </span>
                      </span>
                    </div>

                    {searchResult.isPrivate && (
                      <div className="result-row" style={{ gridColumn: "1 / -1", flexDirection: "column", alignItems: "flex-start", background: "rgba(168, 85, 247, 0.05)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(168, 85, 247, 0.15)", margin: "8px 0" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "#c084fc", marginBottom: "6px" }}>TESSERA PRIVACY METADATA</span>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", width: "100%" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
                            <span>Privacy Group ID:</span>
                            <span style={{ fontFamily: "monospace", color: "#fff" }}>{isAuthorized ? (searchResult.privacyGroupId || "Restricted / Encrypted") : "Restricted / Encrypted"}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
                            <span>Private From:</span>
                            <span style={{ fontFamily: "monospace", color: "#fff" }}>{isAuthorized ? (searchResult.privateFrom || "Restricted / Encrypted") : "Restricted / Encrypted"}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
                            <span>Private For:</span>
                            <span style={{ fontFamily: "monospace", color: "#fff", maxWidth: "70%", textAlign: "right", wordBreak: "break-all" }}>
                              {isAuthorized && searchResult.privateFor ? searchResult.privateFor.join(", ") : "Restricted / Encrypted"}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: "11px", color: "#c084fc", fontStyle: "italic", marginTop: "8px", borderTop: "1px solid rgba(168, 85, 247, 0.1)", paddingTop: "6px", width: "100%", textAlign: "left" }}>
                          {isAuthorized && searchResult.privateFrom ? "🔓 Participant Access: decrypted via connected wallet authorization." : "🔒 Restricted Access: transaction payload is encrypted and unauthorized."}
                        </div>
                      </div>
                    )}

                    <div className="result-row">
                      <span className="result-key">Block:</span>
                      <span className="result-val clickable-hash" onClick={() => handleQuickSearch(searchResult.blockNumber.toString())}>
                        #{searchResult.blockNumber}
                      </span>
                    </div>
                    <div className="result-row">
                      <span className="result-key">From:</span>
                      <div className="result-val" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="clickable-hash" onClick={() => handleQuickSearch(searchResult.from)}>
                          {searchResult.from}
                        </span>
                        <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(searchResult.from)} title="Copy Address">📋</button>
                      </div>
                    </div>
                    <div className="result-row">
                      <span className="result-key">To:</span>
                      <div className="result-val" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="clickable-hash" onClick={() => handleQuickSearch(searchResult.to)}>
                          {searchResult.to}
                        </span>
                        <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(searchResult.to)} title="Copy Address">📋</button>
                      </div>
                    </div>
                    <div className="result-row">
                      <span className="result-key">Value:</span>
                      <span className="result-val">{searchResult.value} ETH</span>
                    </div>
                    <div className="result-row">
                      <span className="result-key">Gas Price:</span>
                      <span className="result-val">{searchResult.gasPrice} Gwei</span>
                    </div>
                    <div className="result-row">
                      <span className="result-key">Gas Used:</span>
                      <span className="result-val">{searchResult.gasUsed} / {searchResult.gasLimit}</span>
                    </div>

                    {searchResult.tokenTransfers && searchResult.tokenTransfers.length > 0 && (() => {
                      if (searchResult.isPrivate && !isAuthorized) {
                        return null;
                      }
                      const visibleTransfers = searchResult.tokenTransfers;

                      if (visibleTransfers.length === 0) return null;

                      return (
                        <div className="result-row" style={{ gridColumn: "1 / -1", flexDirection: "column", alignItems: "flex-start", background: "rgba(255,255,255,0.03)", padding: "14px", borderRadius: "10px", border: "1px solid var(--card-border)", marginTop: "10px" }}>
                          <span className="result-key" style={{ color: "var(--primary)", fontWeight: "700", marginBottom: "8px" }}>Tokens Transferred / Approved:</span>
                          {visibleTransfers.map((tr, index) => (
                            <div key={index} style={{ fontSize: "13px", display: "flex", gap: "6px", alignItems: "center", width: "100%", flexWrap: "wrap", margin: "4px 0", color: "#e2e8f0" }}>
                              {tr.isApproval ? (
                                <>
                                  <span>• Approved Spender</span>
                                  <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(tr.to)}>{truncate(tr.to)}</span>
                                  <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(tr.to)} title="Copy Address">📋</button>
                                  <span>to spend</span>
                                  <strong style={{ color: "var(--accent)" }}>
                                    {tr.value}{" "}
                                    <span 
                                      className="clickable-hash" 
                                      style={{ color: "var(--primary)", fontWeight: "bold" }}
                                      onClick={() => handleQuickSearch(tr.tokenAddress || ROM_ADDRESS)}
                                      title="View Contract Details"
                                    >
                                      {tr.symbol || "ROM"}
                                    </span>
                                  </strong>
                                  <span>(Owner:</span>
                                  <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(tr.from)}>{truncate(tr.from)}</span>
                                  <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(tr.from)} title="Copy Address">📋</button>
                                  <span>)</span>
                                </>
                              ) : (
                                <>
                                  <span>• From</span>
                                  <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(tr.from)}>{truncate(tr.from)}</span>
                                  <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(tr.from)} title="Copy Address">📋</button>
                                  <span>to</span>
                                  <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(tr.to)}>{truncate(tr.to)}</span>
                                  <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(tr.to)} title="Copy Address">📋</button>
                                  <span>for</span>
                                  <strong style={{ color: "var(--accent)" }}>
                                    {tr.value}{" "}
                                    <span 
                                      className="clickable-hash" 
                                      style={{ color: "var(--primary)", fontWeight: "bold" }}
                                      onClick={() => handleQuickSearch(tr.tokenAddress || ROM_ADDRESS)}
                                      title="View Contract Details"
                                    >
                                      {tr.symbol || "ROM"}
                                    </span>
                                  </strong>
                                </>
                              )}
                              {tr.isPrivate && (
                                <span style={{ fontSize: "12px", marginLeft: "8px" }} title="Private Event">🔒</span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                );
              })()}

              {searchType === "block" && (
                <>
                  <div className="result-row">
                    <span className="result-key">Block Number:</span>
                    <span className="result-val">#{searchResult.number}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-key">Hash:</span>
                    <div className="result-val" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontFamily: "ui-monospace, monospace" }}>{searchResult.hash}</span>
                      <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(searchResult.hash)} title="Copy Hash">📋</button>
                    </div>
                  </div>
                  <div className="result-row">
                    <span className="result-key">Validator (Proposer):</span>
                    <div className="result-val" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="clickable-hash" onClick={() => handleQuickSearch(searchResult.miner)}>
                        {searchResult.miner}
                      </span>
                      <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(searchResult.miner)} title="Copy Address">📋</button>
                    </div>
                  </div>
                  <div className="result-row">
                    <span className="result-key">Transactions:</span>
                    <span className="result-val">{searchResult.txCount ?? searchResult.transactions?.length ?? 0}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-key">Gas Details:</span>
                    <span className="result-val">{searchResult.gasUsed} used / {searchResult.gasLimit} limit</span>
                  </div>
                  <div className="result-row">
                    <span className="result-key">Timestamp:</span>
                    <span className="result-val">{formatTime(searchResult.timestamp)} ({new Date(searchResult.timestamp * 1000).toLocaleDateString()})</span>
                  </div>

                  {searchResult.transactions && searchResult.transactions.length > 0 && (
                    <div style={{ marginTop: "24px", gridColumn: "1 / -1", textAlign: "left" }}>
                      <h4 style={{ color: "#fff", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "8px", margin: "0 0 12px 0", fontSize: "14px" }}>
                        Transactions in Block #{searchResult.number}
                      </h4>
                      <div style={{ overflowX: "auto" }}>
                        <table className="tx-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}>
                              <th style={{ textAlign: "left", padding: "8px" }}>Tx Hash</th>
                              <th style={{ textAlign: "left", padding: "8px" }}>From</th>
                              <th style={{ textAlign: "center", padding: "8px", width: "40px" }}></th>
                              <th style={{ textAlign: "left", padding: "8px" }}>To</th>
                              <th style={{ textAlign: "left", padding: "8px" }}>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {searchResult.transactions.map((tx) => {
                              const txHash = typeof tx === "string" ? tx : tx.hash;
                              const txFrom = tx.from ? tx.from : (tx.fromAddress ? tx.fromAddress : "...");
                              const txTo = tx.to ? tx.to : (tx.toAddress ? tx.toAddress : null);
                              const txValue = tx.value ? tx.value : "0";
                              const isPrivate = tx.isPrivate;

                              return (
                                <tr key={txHash} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                  <td style={{ padding: "8px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(txHash)}>
                                        {truncate(txHash, 8, 8)}
                                      </span>
                                      <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(txHash)} title="Copy Hash">📋</button>
                                      {isPrivate && (
                                        <span style={{ fontSize: "12px" }} title="Private Transaction (Tessera)">🔒</span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ padding: "8px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(txFrom)}>
                                        {truncate(txFrom, 6, 6)}
                                      </span>
                                      <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(txFrom)} title="Copy Address">📋</button>
                                    </div>
                                  </td>
                                  <td style={{ padding: "8px", textAlign: "center", color: "var(--text-secondary)" }}>➔</td>
                                  <td style={{ padding: "8px" }}>
                                    {txTo ? (
                                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(txTo)}>
                                          {truncate(txTo, 6, 6)}
                                        </span>
                                        <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(txTo)} title="Copy Address">📋</button>
                                      </div>
                                    ) : (
                                      <span style={{ fontStyle: "italic", color: "var(--text-secondary)" }}>Contract Creation</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "8px", fontWeight: "600", color: "var(--accent)" }}>{txValue} ETH</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Main Grid Panels */}
      <div className="dashboard-grid">
        {/* Left Column (Dynamic Tabs) */}
        <div className="main-column">
          <div className="panel-card">
            <div className="panel-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
              <div className="tab-bar" style={{ margin: 0, width: "100%" }}>
                <button className={`tab-btn ${mainTab === "blocks" ? "active" : ""}`} onClick={() => setMainTab("blocks")}>
                  Recent Blocks (Live)
                </button>
                <button className={`tab-btn ${mainTab === "validators" ? "active" : ""}`} onClick={() => setMainTab("validators")}>
                  Validator Node Analytics
                </button>
              </div>
            </div>

            {mainTab === "blocks" ? (
              <div className="table-container" style={{ marginTop: "15px" }}>
                <table className="explorer-table">
                  <thead>
                    <tr>
                      <th>Block</th>
                      <th>Time</th>
                      <th>Validator</th>
                      <th style={{ textAlign: "center" }}>TXs</th>
                      <th>Gas Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocks.map((b) => (
                      <tr key={b.number}>
                        <td>
                          <a href="#" className="block-link" onClick={(e) => { e.preventDefault(); handleQuickSearch(b.number.toString()); }}>
                            #{b.number}
                          </a>
                        </td>
                        <td>{formatTime(b.timestamp)}</td>
                        <td>
                          <span className="hash-text clickable-hash" onClick={() => handleQuickSearch(b.validator)}>
                            {truncate(b.validator)}
                          </span>
                        </td>
                        <td style={{ textAlign: "center", fontWeight: "600" }}>{b.txCount}</td>
                        <td className="hash-text">{parseInt(b.gasUsed).toLocaleString()}</td>
                      </tr>
                    ))}
                    {blocks.length === 0 && (
                      <tr>
                        <td colSpan="5" style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                          Fetching block data from Besu network...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Validator Node Analytics Details */
              <div className="validator-grid-card">
                {validators.map((val) => (
                  <div className="val-box" key={val.name}>
                    <div className="val-box-header">
                      <h3 className="val-title">{val.name}</h3>
                      <span style={{ display: "flex", alignItems: "center", fontSize: "13px", fontWeight: "600" }}>
                        <span className={`indicator-dot ${val.online ? "online" : "offline"}`}></span>
                        {val.online ? "Online" : "Offline"}
                      </span>
                    </div>

                    <div className="result-grid" style={{ fontSize: "13px", gap: "6px" }}>
                      <div className="result-row">
                        <span className="result-key">Address:</span>
                        <span className="result-val clickable-hash" onClick={() => handleQuickSearch(val.address)}>
                          {truncate(val.address, 6, 6)}
                        </span>
                      </div>
                      <div className="result-row">
                        <span className="result-key">IP & P2P Port:</span>
                        <span className="result-val">{val.online ? `${val.ip}:${val.p2pPort}` : "Disconnected"}</span>
                      </div>
                      <div className="result-row">
                        <span className="result-key">Block Height:</span>
                        <span className="result-val">
                          {val.online ? (val.height !== null ? `#${val.height}` : "Syncing") : "N/A"}
                        </span>
                      </div>
                      <div className="result-row">
                        <span className="result-key">Last Proposed:</span>
                        <span className="result-val">
                          {val.lastBlockProposed !== null ? (
                            <span className="clickable-hash" onClick={() => handleQuickSearch(val.lastBlockProposed.toString())}>
                              #{val.lastBlockProposed}
                            </span>
                          ) : "None"}
                        </span>
                      </div>
                      <div className="result-row">
                        <span className="result-key">Proposals: </span>
                        <span className="result-val">{val.blocksProposed} blocks</span>
                      </div>
                    </div>

                    <div style={{ marginTop: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px", color: "var(--text-secondary)" }}>
                        <span>Proposal Share</span>
                        <span>{val.percentage}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${(val.blocksProposed / Math.max(...validators.map(v => v.blocksProposed), 1)) * 100}%` }}></div>
                      </div>
                    </div>
                  </div>
                ))}
                {validators.length === 0 && (
                  <p style={{ color: "var(--text-secondary)", textAlign: "center", width: "100%", gridColumn: "1 / -1" }}>
                    Fetching node metrics...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Validator summary & ROM Details */}
        <div className="side-column">
          {/* Validator Share High level */}
          <div className="panel-card">
            <div className="panel-header">
              <h2 className="panel-title">Validator Share (Current Session)</h2>
            </div>
            <div>
              {validators.map((val) => (
                <div className="validator-row" key={val.name}>
                  <div className="validator-info">
                    <span className="validator-name clickable-hash" onClick={() => handleQuickSearch(val.address)}>
                      {val.name}
                    </span>
                    <span className="validator-count">
                      {val.blocksProposed} blks ({val.percentage}%)
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(val.blocksProposed / Math.max(...validators.map(v => v.blocksProposed), 1)) * 100}%` }}></div>
                  </div>
                </div>
              ))}
              {validators.length === 0 && (
                <p style={{ color: "var(--text-secondary)", textAlign: "center" }}>
                  Calculating validator share...
                </p>
              )}
            </div>
          </div>

          {/* Token Details Card */}
          {romMetadata && (
            <div className="panel-card">
              <div className="panel-header">
                <h2 className="panel-title">ROM Token Information</h2>
              </div>
              <div className="result-grid" style={{ fontSize: "14px" }}>
                <div className="result-row">
                  <span className="result-key">Token Name:</span>
                  <span className="result-val" style={{ fontWeight: 600 }}>{romMetadata.name}</span>
                </div>
                <div className="result-row">
                  <span className="result-key">Symbol:</span>
                  <span className="result-val">{romMetadata.symbol}</span>
                </div>
                <div className="result-row">
                  <span className="result-key">Total Supply:</span>
                  <span className="result-val">{parseInt(romMetadata.totalSupply).toLocaleString()} ROM</span>
                </div>
                <div className="result-row">
                  <span className="result-key">Contract:</span>
                  <div className="result-val" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="clickable-hash" onClick={() => handleQuickSearch(romMetadata.address)}>
                      {truncate(romMetadata.address, 6, 6)}
                    </span>
                    <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(romMetadata.address)} title="Copy Address">📋</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      </>
      ) : (
        /* USDT Faucet Page */
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
                  <span 
                    className="clickable-hash" 
                    onClick={() => {
                      setCurrentView("explorer");
                      handleQuickSearch(USDT_ADDRESS);
                    }}
                    title="View Contract in Explorer"
                  >
                    {truncate(USDT_ADDRESS, 8, 8)}
                  </span>
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
                    `Cooldown Active (${cooldownRemaining}s)`
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
                  <span
                    className="clickable-hash"
                    onClick={() => {
                      setCurrentView("explorer");
                      handleQuickSearch(faucetSuccess.hash);
                    }}
                    style={{ textDecoration: "underline", fontWeight: "bold" }}
                  >
                    {truncate(faucetSuccess.hash, 10, 10)}
                  </span>
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
      )}
      
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

export default App;