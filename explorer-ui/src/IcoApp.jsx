import { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";

const ROMICO_ADDRESS = "0x15Ac0c5ece00CF08b30a5138cb2776603E04CC72";
const USDT_ADDRESS = "0x0d0d2B8C892D8f44733BFe8a657e1D9D4Fa9996C";
const ROM_ADDRESS = "0x51Dc997cDB30770f82AB0f4EFB00863a6A42922a";
const PRIVATE_ROMICO_ADDRESS = "0x4d674208c3411d424c4918a2d81bf5d8a7632054";
// Deployer private key used as the off-chain signer for authorizing purchases
const OFFC_SIGNER_KEY = "f02b8ba9cc5bcf8a77a3de9004917eb688280e3ee68474ad0fa4ae4b9bcc3133";

function IcoApp() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const [userBalance, setUserBalance] = useState("0");
  const [walletType, setWalletType] = useState(null); // 'metamask' | 'rabby'
  const [showWalletModal, setShowWalletModal] = useState(false);

  // Balances & Allowances
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [romBalance, setRomBalance] = useState("0");
  const [usdtAllowance, setUsdtAllowance] = useState("0");

  // Contract Stats
  const [icoRomLiquidity, setIcoRomLiquidity] = useState("0");
  const [icoUsdtRaised, setIcoUsdtRaised] = useState("0");
  const [romPricePerUsdt, setRomPricePerUsdt] = useState("10");
  const [minPurchaseUsdt, setMinPurchaseUsdt] = useState("0");
  const [maxPurchaseUsdt, setMaxPurchaseUsdt] = useState("0");

  // Referral & Database Profile States
  const [userReferralCode, setUserReferralCode] = useState("");
  const [userReferralsList, setUserReferralsList] = useState([]);
  const [userPurchasesList, setUserPurchasesList] = useState([]);
  const [userReferrer, setUserReferrer] = useState("ADMIN");
  const [userReferrerAddress, setUserReferrerAddress] = useState("");
  const [userBonusEarnings, setUserBonusEarnings] = useState("0");

  // Form States
  const [buyAmountUsdt, setBuyAmountUsdt] = useState("");
  const [buyAmountRom, setBuyAmountRom] = useState("0");

  // Action States
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Tessera Privacy States
  const [txPrivacy, setTxPrivacy] = useState({
    isPrivate: false,
    privateFrom: "0eMM6/iQGolPG59LDQztDXNRocBfoTu0y+9pOXT2CG8=",
    privateFor: "85GsqP5wO3mBC4ipRt5b64Wxm5f1XnNp0j04WuMDiQE="
  });

  useEffect(() => {
    fetchStats();
    if (userAddress) {
      fetchUserBalances(userAddress);
    }
  }, [txPrivacy.isPrivate, userAddress]);

  const getCleanErrorMessage = (err) => {
    if (
      err.code === "ACTION_REJECTED" || 
      err.code === 4001 || 
      (err.message && (
        err.message.toLowerCase().includes("reject") ||
        err.message.toLowerCase().includes("denied")
      ))
    ) {
      return "Transaction rejected by user.";
    }
    let errorMsg = err.reason || err.message || "Action failed.";
    if (err.data && err.data.message) {
      errorMsg = err.data.message;
    }
    if (
      errorMsg.toLowerCase().includes("user rejected") ||
      errorMsg.toLowerCase().includes("action_rejected") ||
      errorMsg.toLowerCase().includes("denied")
    ) {
      return "Transaction rejected by user.";
    }
    return errorMsg;
  };

  // Parse referral query code on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode) {
      localStorage.setItem("referrerCode", refCode);
    }
    fetchStats();
  }, []);

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

  const registerAndLoadUser = async (walletAddr) => {
    try {
      const refCode = localStorage.getItem("referrerCode") || "";
      // Register user with optional referral code
      await fetch(`http://localhost:3001/api/v2/RegisterNewUser?wallet_address=${walletAddr}&ref_id=${refCode}`);
      
      // Load user profile statistics and transactions
      const res = await fetch(`http://localhost:3001/api/v2/getUserData?address=${walletAddr}`);
      const data = await res.json();
      if (data.status) {
        const profile = data.UserData[0];
        setUserReferralCode(profile.ptc_ref_id);
        setUserReferrer(profile.referred_by);
        setUserReferrerAddress(profile.referrer_address);
        setUserReferralsList(data.referrals || []);
        setUserPurchasesList(data.transactions || []);
        
        // Calculate total referral bonus
        const totalEarned = (data.basictransactions || []).reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);
        setUserBonusEarnings(totalEarned.toFixed(2));
      }
    } catch (err) {
      console.error("Error synchronizing investor data with API server:", err);
    }
  };

  const fetchStats = async () => {
    try {
      // 1. Fetch active sale round details from database API (works even when wallet is disconnected)
      const saleRes = await fetch("http://localhost:3001/api/v2/getActiveSales");
      const saleData = await saleRes.json();
      if (saleData.status && saleData.sales && saleData.sales.length > 0) {
        const activeSale = saleData.sales[0];
        setIcoRomLiquidity(activeSale.token_quantity);
        setRomPricePerUsdt(activeSale.price);
        setMinPurchaseUsdt(activeSale.minimum_purchase || "0");
        setMaxPurchaseUsdt(activeSale.maximum_purchase || "0");
      }

      // 2. Fetch on-chain details if wallet is connected
      if (txPrivacy.isPrivate) {
        const fetchPrivate = async (contractAddr, functionName, params) => {
          const res = await fetch(`http://localhost:3001/contract/${contractAddr}/read`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              functionName,
              params,
              isPrivate: true,
              privateFrom: txPrivacy.privateFrom,
              privateFor: txPrivacy.privateFor
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Read failed");
          return data.result;
        };

        const uRaisedHex = await fetchPrivate(USDT_ADDRESS, "balanceOf", [ROMICO_ADDRESS]).catch(() => "0x0");
        const uRaisedVal = Array.isArray(uRaisedHex) ? uRaisedHex[0] : uRaisedHex;
        const usdtRaised = BigInt(uRaisedVal || 0);
        setIcoUsdtRaised(ethers.formatUnits(usdtRaised, 6));
      } else {
        const rawProvider = getConnectedProvider();
        if (!rawProvider) return;
        const provider = new ethers.BrowserProvider(rawProvider);
        
        const usdtContract = new ethers.Contract(USDT_ADDRESS, [
          "function balanceOf(address) view returns (uint256)"
        ], provider);

        const usdtRaised = await usdtContract.balanceOf(ROMICO_ADDRESS).catch(() => 0n);
        setIcoUsdtRaised(ethers.formatUnits(usdtRaised, 6));
      }
    } catch (err) {
      console.error("Error fetching ICO contract stats:", err);
    }
  };

  const fetchUserBalances = async (address) => {
    if (!address) return;
    try {
      if (txPrivacy.isPrivate) {
        const fetchPrivate = async (contractAddr, functionName, params) => {
          const res = await fetch(`http://localhost:3001/contract/${contractAddr}/read`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              functionName,
              params,
              isPrivate: true,
              privateFrom: txPrivacy.privateFrom,
              privateFor: txPrivacy.privateFor
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Read failed");
          return data.result;
        };

        // Fetch USDT balance from public ledger because it is common/public
        const rawProvider = getConnectedProvider();
        let publicUsdtBalance = "0";
        if (rawProvider) {
          try {
            const pubProvider = new ethers.BrowserProvider(rawProvider);
            const pubUsdtContract = new ethers.Contract(USDT_ADDRESS, [
              "function balanceOf(address) view returns (uint256)"
            ], pubProvider);
            const pubBal = await pubUsdtContract.balanceOf(address);
            publicUsdtBalance = ethers.formatUnits(pubBal, 6);
          } catch (e) {
            console.error("Error fetching public USDT balance:", e);
          }
        }

        const [uAllowanceHex, rBalHex] = await Promise.all([
          fetchPrivate(USDT_ADDRESS, "allowance", ["0x6EA6A6B067e69317C8c278d006f0064CCfedb687", PRIVATE_ROMICO_ADDRESS]).catch(() => "0x0"),
          fetchPrivate(ROM_ADDRESS, "balanceOf", [address]).catch(() => "0x0")
        ]);

        const uAllowanceVal = Array.isArray(uAllowanceHex) ? uAllowanceHex[0] : uAllowanceHex;
        const rBalVal = Array.isArray(rBalHex) ? rBalHex[0] : rBalHex;

        const uAllowance = BigInt(uAllowanceVal || 0);
        const rBal = BigInt(rBalVal || 0);

        setUsdtBalance(publicUsdtBalance);
        setUsdtAllowance(ethers.formatUnits(uAllowance, 6));
        setRomBalance(ethers.formatEther(rBal));
      } else {
        const rawProvider = getConnectedProvider();
        if (!rawProvider) return;
        const provider = new ethers.BrowserProvider(rawProvider);

        const usdtContract = new ethers.Contract(USDT_ADDRESS, [
          "function balanceOf(address) view returns (uint256)",
          "function allowance(address,address) view returns (uint256)"
        ], provider);
        const romContract = new ethers.Contract(ROM_ADDRESS, [
          "function balanceOf(address) view returns (uint256)"
        ], provider);

        const [uBal, uAllowance, rBal] = await Promise.all([
          usdtContract.balanceOf(address),
          usdtContract.allowance(address, ROMICO_ADDRESS),
          romContract.balanceOf(address)
        ]);

        setUsdtBalance(ethers.formatUnits(uBal, 6));
        setUsdtAllowance(ethers.formatUnits(uAllowance, 6));
        setRomBalance(ethers.formatEther(rBal));
      }
    } catch (err) {
      console.error("Error fetching user balances:", err);
    }
  };

  const handleApprove = async () => {
    if (!buyAmountUsdt || parseFloat(buyAmountUsdt) <= 0) {
      setActionError("Please enter a valid amount of USDT to spend.");
      return;
    }

    const amount = parseFloat(buyAmountUsdt);
    const minVal = parseFloat(minPurchaseUsdt);
    const maxVal = parseFloat(maxPurchaseUsdt);

    if (minVal > 0 && amount < minVal) {
      setActionError(`Minimum purchase is ${minVal} USDT.`);
      return;
    }
    if (maxVal > 0 && amount > maxVal) {
      setActionError(`Maximum purchase is ${maxVal} USDT.`);
      return;
    }
    setActionLoading(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      let txHash = "";
      if (txPrivacy.isPrivate) {
        const rawProvider = getConnectedProvider();
        if (!rawProvider) throw new Error("No wallet provider found.");
        const provider = new ethers.BrowserProvider(rawProvider);
        const signer = await provider.getSigner();

        const approveAmount = ethers.parseUnits(buyAmountUsdt, 6).toString();
        
        // Request confirmation signature from user's connected wallet
        const confirmationMessage = `Authorize Private USDT Approval:\nSpender: ${PRIVATE_ROMICO_ADDRESS}\nAmount: ${buyAmountUsdt} USDT`;
        await signer.signMessage(confirmationMessage);

        const res = await fetch(`http://localhost:3001/contract/${USDT_ADDRESS}/write`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            functionName: "approve",
            params: [PRIVATE_ROMICO_ADDRESS, approveAmount],
            isPrivate: true,
            privateFrom: txPrivacy.privateFrom,
            privateFor: txPrivacy.privateFor
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Approval failed");
        txHash = data.hash;
      } else {
        const rawProvider = getConnectedProvider();
        if (!rawProvider) throw new Error("No wallet provider found.");
        const provider = new ethers.BrowserProvider(rawProvider);
        const signer = await provider.getSigner();

        const usdtContract = new ethers.Contract(USDT_ADDRESS, [
          "function approve(address,uint256) returns (bool)"
        ], signer);

        const approveAmount = ethers.parseUnits(buyAmountUsdt, 6);
        const tx = await usdtContract.approve(ROMICO_ADDRESS, approveAmount);
        await tx.wait();
        txHash = tx.hash;
      }

      setActionSuccess({
        type: "approve",
        hash: txHash
      });

      await fetchUserBalances(userAddress);
    } catch (err) {
      console.error("Approval error:", err);
      setActionError(getCleanErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleBuy = async () => {
    if (!buyAmountUsdt || parseFloat(buyAmountUsdt) <= 0) {
      setActionError("Please enter a valid amount of USDT to buy ROM.");
      return;
    }

    const amount = parseFloat(buyAmountUsdt);
    const minVal = parseFloat(minPurchaseUsdt);
    const maxVal = parseFloat(maxPurchaseUsdt);

    if (minVal > 0 && amount < minVal) {
      setActionError(`Minimum purchase is ${minVal} USDT.`);
      return;
    }
    if (maxVal > 0 && amount > maxVal) {
      setActionError(`Maximum purchase is ${maxVal} USDT.`);
      return;
    }
    setActionLoading(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const usdtAmount = ethers.parseUnits(buyAmountUsdt, 6);
      const nonce = Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const callerAddress = txPrivacy.isPrivate
        ? "0x6EA6A6B067e69317C8c278d006f0064CCfedb687"
        : userAddress;

      const verifyingContract = txPrivacy.isPrivate ? PRIVATE_ROMICO_ADDRESS : ROMICO_ADDRESS;
      const domain = {
        name: "ROMICO",
        version: "1",
        chainId: 1337,
        verifyingContract: verifyingContract,
      };

      const types = {
        Purchase: [
          { name: "recipient", type: "address" },
          { name: "caller", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        recipient: userAddress,
        caller: callerAddress,
        amount: usdtAmount,
        nonce: nonce,
        deadline: deadline,
      };

      const signerWallet = new ethers.Wallet(OFFC_SIGNER_KEY);
      const signature = await signerWallet.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);

      const signStruct = [
        sig.v,
        sig.r,
        sig.s,
        nonce,
        deadline,
      ];

      let txHash = "";
      if (txPrivacy.isPrivate) {
        const rawProvider = getConnectedProvider();
        if (!rawProvider) throw new Error("No wallet provider found.");
        const provider = new ethers.BrowserProvider(rawProvider);
        const signer = await provider.getSigner();

        // Transfer USDT publicly to the admin/signer address (0x6EA6A6B067e69317C8c278d006f0064CCfedb687)
        const usdtContract = new ethers.Contract(USDT_ADDRESS, [
          "function transfer(address,uint256) returns (bool)"
        ], signer);
        const publicUsdtTx = await usdtContract.transfer("0x6EA6A6B067e69317C8c278d006f0064CCfedb687", usdtAmount);
        await publicUsdtTx.wait();

        const res = await fetch(`http://localhost:3001/contract/${ROMICO_ADDRESS}/write`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            functionName: "buyToken",
            params: [
              userAddress,
              usdtAmount.toString(),
              [sig.v, sig.r, sig.s, nonce.toString(), deadline.toString()]
            ],
            isPrivate: true,
            privateFrom: txPrivacy.privateFrom,
            privateFor: txPrivacy.privateFor
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Purchase failed");
        txHash = data.hash;
      } else {
        const rawProvider = getConnectedProvider();
        if (!rawProvider) throw new Error("No wallet provider found.");
        const provider = new ethers.BrowserProvider(rawProvider);
        const signer = await provider.getSigner();

        const icoContract = new ethers.Contract(ROMICO_ADDRESS, [
          "function buyToken(address,uint256,(uint8,bytes32,bytes32,uint256,uint256)) external"
        ], signer);

        const tx = await icoContract.buyToken(userAddress, usdtAmount, signStruct);
        const receipt = await tx.wait();
        txHash = tx.hash;
      }

      // Record transaction to Express API backend database
      const romAmountCalculated = (parseFloat(buyAmountUsdt) * parseFloat(romPricePerUsdt)).toString();
      const referrerBonusCalculated = "0";

      try {
        await fetch("http://localhost:3001/api/v2/savePurchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: userAddress,
            CryptoValue: buyAmountUsdt,
            payment_type: "USDT",
            PTC_tokens: romAmountCalculated,
            transHash: txHash,
            USDvalue_of_crypto_purchased: buyAmountUsdt,
            sale_type: "presale",
            referrer_bonus: referrerBonusCalculated,
            referrer_address: userReferrerAddress || ""
          })
        });
      } catch (apiErr) {
        console.error("Failed to register purchase with backend database:", apiErr);
      }

      setActionSuccess({
        type: "buy",
        hash: txHash
      });

      setBuyAmountUsdt("");
      setBuyAmountRom("0");

      setTimeout(() => {
        window.location.reload();
      }, 8000);
      
      // Reload UI states and backend data
      await fetchUserBalances(userAddress);
      await fetchStats();
      await registerAndLoadUser(userAddress);
      
      const rawProvider = getConnectedProvider();
      if (rawProvider && !txPrivacy.isPrivate) {
        const provider = new ethers.BrowserProvider(rawProvider);
        const ethBal = await provider.getBalance(userAddress);
        setUserBalance(ethers.formatEther(ethBal));
      }
    } catch (err) {
      console.error("Token purchase error:", err);
      setActionError(getCleanErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (userAddress) {
      fetchUserBalances(userAddress);
      fetchStats();
      registerAndLoadUser(userAddress);
    } else {
      setUsdtBalance("0");
      setRomBalance("0");
      setUsdtAllowance("0");
      setUserReferralCode("");
      setUserReferralsList([]);
      setUserPurchasesList([]);
    }
  }, [userAddress]);

  // Handle live calculation of ROM from USDT input
  const handleUsdtInputChange = (val) => {
    setBuyAmountUsdt(val);
    if (!val || isNaN(val) || parseFloat(val) <= 0) {
      setBuyAmountRom("0");
      return;
    }
    const romAmt = parseFloat(val) * parseFloat(romPricePerUsdt);
    setBuyAmountRom(romAmt.toLocaleString(undefined, { maximumFractionDigits: 4 }));
  };

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
                rpcUrls: ["http://127.0.0.1:8545"],
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

  const isAllowanceSufficient = parseFloat(usdtAllowance) >= parseFloat(buyAmountUsdt || "0");

  return (
    <div className="explorer-container">
      {/* Header */}
      <header className="header">
        <div className="title-section">
          <h1>ROM TOKEN ICO SALE</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Hyperledger Besu Private QBFT Ledger Token Launchpad
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {walletConnected ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "6px 12px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                <span style={{ color: "var(--success)" }}>●</span>
                <span style={{ fontWeight: "600" }} title={userAddress}>{truncate(userAddress, 6, 4)}</span>
                <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(userAddress)} title="Copy Connected Address">📋</button>
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

      {/* Navigation Menu */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "30px" }}>
        <a
          href="/"
          className="tab-btn"
          style={{ padding: "10px 24px", fontSize: "15px", borderRadius: "10px", textDecoration: "none", display: "inline-block" }}
        >
          🔍 Block Explorer
        </a>
        <a
          href="/faucet"
          className="tab-btn"
          style={{ padding: "10px 24px", fontSize: "15px", borderRadius: "10px", textDecoration: "none", display: "inline-block" }}
        >
          🚰 USDT Faucet
        </a>
        <button
          className="tab-btn active"
          style={{ padding: "10px 24px", fontSize: "15px", borderRadius: "10px" }}
        >
          🪙 ROM ICO Sale
        </button>
      </div>

      {/* Faucet/Sale Layout */}
      <div className="faucet-container">
        <div className="faucet-card" style={{ maxWidth: "700px" }}>
          <div className="faucet-header">
            <h2>🪙 ROM Token Launchpad</h2>
            <p>Purchase ROM tokens directly using USDT. Rate: 1 USDT = {romPricePerUsdt} ROM.</p>
          </div>

          <div className="faucet-stats">
            <div className="faucet-stat-box">
              <span className="faucet-stat-label">ICO Contract Address</span>
              <span className="faucet-stat-value" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                <a 
                  href={`/?q=${ROMICO_ADDRESS}`}
                  style={{ color: "var(--accent)", textDecoration: "none" }}
                  className="clickable-hash"
                >
                  {truncate(ROMICO_ADDRESS, 8, 8)}
                </a>
                <button className="copy-btn-small" onClick={() => navigator.clipboard.writeText(ROMICO_ADDRESS)} title="Copy Address">📋</button>
              </span>
            </div>
            <div className="faucet-stat-box">
              <span className="faucet-stat-label">ROM Tokens For Sale</span>
              <span className="faucet-stat-value" style={{ color: "#4ade80", fontSize: "18px" }}>
                {parseFloat(icoRomLiquidity).toLocaleString(undefined, { maximumFractionDigits: 2 })} ROM
              </span>
            </div>
            <div className="faucet-stat-box">
              <span className="faucet-stat-label">Total USDT Raised</span>
              <span className="faucet-stat-value" style={{ color: "var(--primary)", fontSize: "18px" }}>
                {parseFloat(icoUsdtRaised).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
              </span>
            </div>
            <div className="faucet-stat-box">
              <span className="faucet-stat-label">Exchange Rate</span>
              <span className="faucet-stat-value">1 USDT = {romPricePerUsdt} ROM</span>
            </div>
          </div>

          {walletConnected && (
            <div className="faucet-stats" style={{ marginTop: "-20px", marginBottom: "35px", background: "rgba(255,255,255,0.02)", padding: "16px", borderRadius: "12px", border: "1px solid var(--card-border)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", textAlign: "left" }}>
                <span className="faucet-stat-label">Your USDT Balance</span>
                <span style={{ fontSize: "16px", fontWeight: "700", color: "#ffffff" }}>
                  {parseFloat(usdtBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", textAlign: "left" }}>
                <span className="faucet-stat-label">Your ROM Balance</span>
                <span style={{ fontSize: "16px", fontWeight: "700", color: "var(--accent)" }}>
                  {parseFloat(romBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ROM
                </span>
              </div>
            </div>
          )}

          {walletConnected ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Tessera Privacy Toggle */}
              <div 
                style={{ 
                  background: txPrivacy.isPrivate ? "rgba(168, 85, 247, 0.08)" : "rgba(255,255,255,0.02)", 
                  padding: "16px", 
                  borderRadius: "12px", 
                  border: txPrivacy.isPrivate ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid var(--card-border)", 
                  textAlign: "left",
                  transition: "all 0.3s ease",
                  marginBottom: "5px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "20px" }}>🔒</span>
                    <div>
                      <strong style={{ color: "#ffffff", fontSize: "14px" }}>Send as Private Transaction</strong>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        Executes privately in the Tessera privacy group
                      </div>
                    </div>
                  </div>
                  <label className="switch" style={{ position: "relative", display: "inline-block", width: "44px", height: "24px" }}>
                    <input 
                      type="checkbox" 
                      checked={txPrivacy.isPrivate}
                      onChange={(e) => {
                        const nextPrivate = e.target.checked;
                        setTxPrivacy(prev => ({ ...prev, isPrivate: nextPrivate }));
                      }}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span 
                      style={{ 
                        position: "absolute", 
                        cursor: "pointer", 
                        top: 0, left: 0, right: 0, bottom: 0, 
                        backgroundColor: txPrivacy.isPrivate ? "var(--accent)" : "#475569", 
                        borderRadius: "24px",
                        transition: "0.4s"
                      }}
                    >
                      <span 
                        style={{ 
                          position: "absolute", 
                          content: '""', 
                          height: "18px", width: "18px", 
                          left: txPrivacy.isPrivate ? "22px" : "3px", 
                          bottom: "3px", 
                          backgroundColor: "white", 
                          borderRadius: "50%",
                          transition: "0.4s"
                        }}
                      />
                    </span>
                  </label>
                </div>

                {txPrivacy.isPrivate && (
                  <div style={{ marginTop: "12px", borderTop: "1px solid rgba(168, 85, 247, 0.2)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block" }}>Tessera Private From (Sender)</span>
                      <code style={{ fontSize: "11px", color: "#e2e8f0", wordBreak: "break-all" }}>{txPrivacy.privateFrom}</code>
                    </div>
                    <div>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block" }}>Tessera Private For (Recipient)</span>
                      <code style={{ fontSize: "11px", color: "#e2e8f0", wordBreak: "break-all" }}>{txPrivacy.privateFor}</code>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className="form-label" style={{ margin: 0 }}>USDT to Spend</label>
                  {parseFloat(minPurchaseUsdt) > 0 && (
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: "500" }}>
                      Min: {parseFloat(minPurchaseUsdt).toLocaleString()} | Max: {parseFloat(maxPurchaseUsdt).toLocaleString()} USDT
                    </span>
                  )}
                </div>
                <div style={{ position: "relative", marginTop: "6px" }}>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={buyAmountUsdt}
                    onChange={(e) => handleUsdtInputChange(e.target.value)}
                    className="form-input"
                    disabled={actionLoading}
                    style={{ fontSize: "16px", padding: "12px 16px" }}
                  />
                  <span style={{ position: "absolute", right: "16px", top: "12px", color: "var(--text-secondary)", fontWeight: "bold" }}>USDT</span>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: "-10px", textAlign: "left" }}>
                <label className="form-label">ROM to Receive</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={buyAmountRom}
                    className="form-input"
                    disabled
                    style={{ fontSize: "16px", padding: "12px 16px", background: "rgba(0,0,0,0.3)", borderColor: "transparent", color: "var(--success)" }}
                  />
                  <span style={{ position: "absolute", right: "16px", top: "12px", color: "var(--success)", fontWeight: "bold" }}>ROM</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
                {!isAllowanceSufficient && parseFloat(buyAmountUsdt || "0") > 0 ? (
                  <button
                    className="faucet-claim-btn"
                    onClick={handleApprove}
                    disabled={actionLoading}
                    style={{ margin: "0", maxWidth: "none", flexGrow: 1 }}
                  >
                    {actionLoading ? "Approving USDT..." : "Step 1: Approve USDT"}
                  </button>
                ) : (
                  <button
                    className="faucet-claim-btn"
                    onClick={handleBuy}
                    disabled={actionLoading || !buyAmountUsdt || parseFloat(buyAmountUsdt) <= 0 || parseFloat(buyAmountUsdt) > parseFloat(usdtBalance)}
                    style={{ margin: "0", maxWidth: "none", flexGrow: 1 }}
                  >
                    {actionLoading ? "Processing Purchase..." : parseFloat(buyAmountUsdt) > parseFloat(usdtBalance) ? "Insufficient USDT Balance" : "Buy ROM Tokens"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <button 
                className="faucet-claim-btn"
                onClick={() => setShowWalletModal(true)}
              >
                👄 Connect Wallet to Participate
              </button>
            </div>
          )}

          {actionSuccess && (
            <div className="success-alert" style={{ marginTop: "24px", textAlign: "left" }}>
              {actionSuccess.type === "approve" ? (
                <>
                  <div>🎉 <strong>USDT Allowance Approved!</strong></div>
                  <div style={{ marginTop: "6px", fontSize: "12px" }}>
                    Transaction:{" "}
                    <a
                      href={`/?q=${actionSuccess.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "underline", fontWeight: "bold", color: "#4ade80" }}
                    >
                      {truncate(actionSuccess.hash, 10, 10)}
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <div>🎉 <strong>Purchase Complete!</strong></div>
                  <div style={{ marginTop: "8px", fontSize: "12px", opacity: 0.9 }}>
                    Your transaction has been processed and ROM tokens have been transferred.
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "12px" }}>
                    Transaction:{" "}
                    <a
                      href={`/?q=${actionSuccess.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "underline", fontWeight: "bold", color: "#4ade80" }}
                    >
                      {truncate(actionSuccess.hash, 10, 10)}
                    </a>
                  </div>
                </>
              )}
            </div>
          )}

          {actionError && (
            <div className="error-alert" style={{ marginTop: "24px", textAlign: "left" }}>
              ❌ <strong>Action Failed:</strong> {actionError}
            </div>
          )}



          <div className="faucet-info-section">
            <div className="faucet-info-title">
              <span>ℹ️</span> ICO Guidelines & Rules
            </div>
            <ul className="faucet-info-list">
              <li>ROM ICO operates on the local Hyperledger Besu private network.</li>
              <li>You can obtain test USDT from the <a href="/faucet" style={{ color: "var(--accent)", fontWeight: "600", textDecoration: "none" }}>USDT Faucet</a>.</li>
              <li>Approval is required prior to making a purchase so the ICO contract can transfer USDT on your behalf.</li>
              <li>All purchase authorizations are protected by secure off-chain cryptographical signatures.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Purchases History */}
      {walletConnected && userPurchasesList.length > 0 && (
        <div className="table-container" style={{ marginTop: "40px", maxWidth: "700px", margin: "40px auto 0 auto" }}>
          <h3 style={{ margin: "0 0 15px 0", textAlign: "left" }}>Your Purchase History</h3>
          <table className="explorer-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>USDT Spent</th>
                <th>ROM Received</th>
                <th>Transaction Hash</th>
              </tr>
            </thead>
            <tbody>
              {userPurchasesList.map((tx) => (
                <tr key={tx.id}>
                  <td>{new Date(tx.created_at).toLocaleString()}</td>
                  <td>{parseFloat(tx.crypto_value).toFixed(2)} USDT</td>
                  <td style={{ color: "#4ade80", fontWeight: "600" }}>{parseFloat(tx.ptc_tokens).toLocaleString()} ROM</td>
                  <td style={{ fontFamily: "monospace", fontSize: "12px" }}>
                    <a href={`/?q=${tx.trans_hash}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                      {truncate(tx.trans_hash, 8, 8)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

export default IcoApp;
