import { useEffect, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:3001/api/admin";

function AdminApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    localStorage.removeItem("adminToken");
    return !!sessionStorage.getItem("adminToken");
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const fetchWithAuth = async (url, options = {}) => {
    const token = sessionStorage.getItem("adminToken");
    const headers = {
      ...options.headers,
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
  };

  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard', 'sales', 'settings', 'transactions', 'users', 'referrals'

  // Dashboard Stats
  const [stats, setStats] = useState({
    total_users: 0,
    total_transactions: 0,
    successful_transactions: 0,
    failed_transactions: 0,
    purchased_tokens: 0
  });
  const [lastTransactions, setLastTransactions] = useState([]);

  // Sales list & forms
  const [sales, setSales] = useState([]);
  const [saleForm, setSaleForm] = useState({
    name: "",
    quantity: "",
    minimum: "",
    maximum: "",
    price: "",
    start_at: "",
    end_at: ""
  });
  const [editingSaleId, setEditingSaleId] = useState(null);

  // Settings
  const [settings, setSettings] = useState({
    site_name: "",
    owner_address: "",
    token_name: "",
    token_symbol: "",
    contract_address: "",
    referral_level1: "10.00"
  });

  // Data lists
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]);
  const [referrals, setReferrals] = useState([]);

  // loading/feedback states
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const token = sessionStorage.getItem("adminToken");
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboard();
      fetchSales();
      fetchSettings();
      fetchTransactions();
      fetchUsers();
      fetchReferrals();
    }
  }, [isAuthenticated]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.status) {
        sessionStorage.setItem("adminToken", data.data.token);
        setIsAuthenticated(true);
      } else {
        setLoginError(data.msg || "Invalid credentials.");
      }
    } catch (err) {
      setLoginError("Failed to connect to backend server.");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("adminToken");
    setIsAuthenticated(false);
  };

  const fetchDashboard = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/dashboard`);
      const data = await res.json();
      if (data.status) {
        setStats(data.stats);
        setLastTransactions(data.lastTransactions);
      }
    } catch (err) {
      console.error("Error fetching dashboard stats:", err);
    }
  };

  const fetchSales = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/getActiveSales`);
      const data = await res.json();
      if (data.status) {
        setSales(data.sales);
      }
    } catch (err) {
      console.error("Error fetching sales:", err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/settings`);
      const data = await res.json();
      if (data.status) {
        setSettings(data.data);
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/getTransactionDetails`);
      const data = await res.json();
      if (data.status) {
        setTransactions(data.userData);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/users-list`);
      const data = await res.json();
      if (data.status) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error("Error fetching users list:", err);
    }
  };

  const fetchReferrals = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/getreferralClaimDetails`);
      const data = await res.json();
      if (data.status) {
        setReferrals(data.userData);
      }
    } catch (err) {
      console.error("Error fetching referral claims:", err);
    }
  };

  const handleSaveSale = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      let url = `${API_BASE}/saveNewSale`;
      let method = "POST";
      if (editingSaleId) {
        url = `${API_BASE}/updateSale/${editingSaleId}`;
        method = "PUT";
      }

      const res = await fetchWithAuth(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saleForm)
      });
      const data = await res.json();
      if (data.status) {
        setFeedback({ type: "success", message: data.msg });
        setSaleForm({
          name: "",
          quantity: "",
          minimum: "",
          maximum: "",
          price: "",
          start_at: "",
          end_at: ""
        });
        setEditingSaleId(null);
        fetchSales();
        fetchDashboard();
      } else {
        setFeedback({ type: "error", message: data.msg });
      }
    } catch (err) {
      setFeedback({ type: "error", message: "Failed to save sale round." });
    } finally {
      setLoading(false);
    }
  };

  const handleEditSale = (sale) => {
    setEditingSaleId(sale.id);
    const startIso = sale.start_at ? new Date(sale.start_at).toISOString().slice(0, 16) : "";
    const endIso = sale.end_at ? new Date(sale.end_at).toISOString().slice(0, 16) : "";
    setSaleForm({
      name: sale.name,
      quantity: sale.token_quantity,
      minimum: sale.minimum_purchase,
      maximum: sale.maximum_purchase,
      price: sale.price,
      start_at: startIso,
      end_at: endIso
    });
  };

  const handleDeleteSale = async (id) => {
    if (!window.confirm("Are you sure you want to delete this sale round?")) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/deleteSale/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.status) {
        alert(data.msg);
        fetchSales();
        fetchDashboard();
      }
    } catch (err) {
      alert("Failed to delete sale round.");
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/updatesettings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.status) {
        setFeedback({ type: "success", message: data.msg });
        fetchSettings();
      } else {
        setFeedback({ type: "error", message: data.msg });
      }
    } catch (err) {
      setFeedback({ type: "error", message: "Failed to update settings." });
    } finally {
      setLoading(false);
    }
  };

  const truncate = (str, start = 8, end = 8) => {
    if (!str) return "";
    if (str.length <= start + end) return str;
    return `${str.substring(0, start)}...${str.substring(str.length - end)}`;
  };

  if (!isAuthenticated) {
    return (
      <div className="explorer-container" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div className="faucet-card" style={{ maxWidth: "420px", padding: "40px" }}>
          <div className="faucet-header" style={{ marginBottom: "30px" }}>
            <h2>🪙 ROM ICO</h2>
            <p style={{ fontSize: "14px", marginTop: "8px" }}>Administrator Panel Sign In</p>
          </div>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="form-group" style={{ textAlign: "left" }}>
              <label className="form-label">Email Address</label>
              <input
                type="email"
                placeholder="admin@psyche.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                required
              />
            </div>
            <div className="form-group" style={{ textAlign: "left" }}>
              <label className="form-label">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                required
              />
            </div>
            {loginError && <div style={{ color: "#ef4444", fontSize: "13px" }}>⚠️ {loginError}</div>}
            <button type="submit" className="faucet-claim-btn" style={{ margin: "10px 0 0 0", maxWidth: "none" }}>
              Log In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="explorer-container">
      {/* Header */}
      <header className="header">
        <div className="title-section">
          <h1>ROM ICO ADMIN</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Launchpad Configuration, Rounds Management, & Transaction Logs
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Logged in as Admin</span>
          <button
            onClick={handleLogout}
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              padding: "8px 16px",
              borderRadius: "8px",
              fontWeight: "600",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Navigation */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "30px", flexWrap: "wrap" }}>
        <button className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>📊 Overview</button>
        <button className={`tab-btn ${activeTab === "sales" ? "active" : ""}`} onClick={() => setActiveTab("sales")}>🪙 Sales Rounds</button>
        <button className={`tab-btn ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")}>⚙️ Site Settings</button>
        <button className={`tab-btn ${activeTab === "transactions" ? "active" : ""}`} onClick={() => setActiveTab("transactions")}>📝 Purchases</button>
        <button className={`tab-btn ${activeTab === "users" ? "active" : ""}`} onClick={() => setActiveTab("users")}>👥 Investors</button>
      </div>

      {/* Feedback Panel */}
      {feedback && (
        <div className={feedback.type === "success" ? "success-alert" : "error-alert"} style={{ marginBottom: "20px" }}>
          {feedback.type === "success" ? "🎉" : "❌"} {feedback.message}
        </div>
      )}

      {/* DASHBOARD TAB */}
      {activeTab === "dashboard" && (
        <div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Users</div>
              <div className="stat-value" style={{ fontSize: "28px", color: "var(--accent)" }}>{stats.total_users}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">ROM Tokens Sold</div>
              <div className="stat-value" style={{ fontSize: "28px", color: "var(--success)" }}>
                {stats.purchased_tokens.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Transactions</div>
              <div className="stat-value" style={{ fontSize: "28px" }}>{stats.total_transactions}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Successful / Failed</div>
              <div className="stat-value" style={{ fontSize: "20px", color: "var(--text-secondary)" }}>
                <span style={{ color: "#4ade80" }}>{stats.successful_transactions}</span> / <span style={{ color: "#f87171" }}>{stats.failed_transactions}</span>
              </div>
            </div>
          </div>

          <div className="table-container" style={{ marginTop: "30px" }}>
            <h3 style={{ margin: "0 0 20px 0" }}>Recent Purchases</h3>
            <table className="explorer-table">
              <thead>
                <tr>
                  <th>Investor Address</th>
                  <th>Crypto Spent</th>
                  <th>ROM Purchased</th>
                  <th>Hash</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lastTransactions.length > 0 ? (
                  lastTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td style={{ fontFamily: "monospace", fontSize: "13px" }}>{tx.address}</td>
                      <td>{parseFloat(tx.crypto_value).toFixed(2)} {tx.payment_type}</td>
                      <td style={{ color: "var(--accent)", fontWeight: "600" }}>{parseFloat(tx.ptc_tokens).toLocaleString()} ROM</td>
                      <td style={{ fontFamily: "monospace", fontSize: "13px" }}>{truncate(tx.trans_hash, 6, 6)}</td>
                      <td>
                        <span className="status-badge" style={{
                          background: tx.status === "success" ? "rgba(74, 222, 128, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: tx.status === "success" ? "#4ade80" : "#f87171",
                          border: tx.status === "success" ? "1px solid rgba(74, 222, 128, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)"
                        }}>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: "center", color: "var(--text-secondary)" }}>No purchases registered yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SALES ROUNDS TAB */}
      {activeTab === "sales" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "30px" }}>
          {/* Sale Round Form */}
          <div className="faucet-card" style={{ margin: 0, height: "fit-content" }}>
            <div className="faucet-header" style={{ marginBottom: "24px" }}>
              <h2>{editingSaleId ? "Edit Presale Round" : "Create New Presale Round"}</h2>
              <p>Configure a token sale phase</p>
            </div>
            <form onSubmit={handleSaveSale} style={{ display: "flex", flexDirection: "column", gap: "16px", textAlign: "left" }}>
              <div className="form-group">
                <label className="form-label">Round Name</label>
                <input
                  type="text"
                  placeholder="Presale Phase 2"
                  value={saleForm.name}
                  onChange={(e) => setSaleForm({ ...saleForm, name: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Total Token Quantity</label>
                <input
                  type="number"
                  placeholder="1000000"
                  value={saleForm.quantity}
                  onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label className="form-label">Min Purchase (USDT)</label>
                  <input
                    type="number"
                    placeholder="10"
                    value={saleForm.minimum}
                    onChange={(e) => setSaleForm({ ...saleForm, minimum: e.target.value })}
                    className="form-input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Max Purchase (USDT)</label>
                  <input
                    type="number"
                    placeholder="1000"
                    value={saleForm.maximum}
                    onChange={(e) => setSaleForm({ ...saleForm, maximum: e.target.value })}
                    className="form-input"
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Exchange Rate (ROM per USDT)</label>
                <input
                  type="number"
                  placeholder="10"
                  value={saleForm.price}
                  onChange={(e) => setSaleForm({ ...saleForm, price: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Start Time</label>
                <input
                  type="datetime-local"
                  value={saleForm.start_at}
                  onChange={(e) => setSaleForm({ ...saleForm, start_at: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Time</label>
                <input
                  type="datetime-local"
                  value={saleForm.end_at}
                  onChange={(e) => setSaleForm({ ...saleForm, end_at: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" className="faucet-claim-btn" style={{ margin: 0, maxWidth: "none", flexGrow: 1 }} disabled={loading}>
                  {loading ? "Saving..." : editingSaleId ? "Update Round" : "Create Round"}
                </button>
                {editingSaleId && (
                  <button
                    type="button"
                    className="tab-btn"
                    onClick={() => {
                      setEditingSaleId(null);
                      setSaleForm({ name: "", quantity: "", minimum: "", maximum: "", price: "", start_at: "", end_at: "" });
                    }}
                    style={{ margin: 0 }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Rounds List */}
          <div className="table-container" style={{ margin: 0 }}>
            <h3 style={{ margin: "0 0 20px 0" }}>Active & Scheduled Rounds</h3>
            <table className="explorer-table">
              <thead>
                <tr>
                  <th>Round Name</th>
                  <th>Tokens</th>
                  <th>Rate</th>
                  <th>Limits (Min/Max)</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.length > 0 ? (
                  sales.map((sale) => (
                    <tr key={sale.id}>
                      <td style={{ fontWeight: "600" }}>{sale.name}</td>
                      <td>{parseInt(sale.token_quantity).toLocaleString()} ROM</td>
                      <td style={{ color: "var(--accent)" }}>1 USDT = {sale.price} ROM</td>
                      <td>{sale.minimum_purchase} / {sale.maximum_purchase} USDT</td>
                      <td>
                        <span className="status-badge" style={{ background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.3)" }}>
                          {sale.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            onClick={() => handleEditSale(sale)}
                            style={{ background: "rgba(129, 140, 248, 0.15)", color: "var(--accent)", border: "1px solid rgba(129, 140, 248, 0.3)", padding: "4px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteSale(sale.id)}
                            style={{ background: "rgba(239, 68, 68, 0.15)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "4px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", color: "var(--text-secondary)" }}>No active presale rounds configured</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === "settings" && (
        <div className="faucet-card" style={{ maxWidth: "600px", margin: "0 auto" }}>
          <div className="faucet-header" style={{ marginBottom: "24px" }}>
            <h2>⚙️ Launchpad & Token Settings</h2>
            <p>Configure core metadata and referral rewards</p>
          </div>
          <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "20px", textAlign: "left" }}>
            <div className="form-group">
              <label className="form-label">Site Name</label>
              <input
                type="text"
                value={settings.site_name}
                onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
                className="form-input"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Token Name</label>
              <input
                type="text"
                value={settings.token_name}
                onChange={(e) => setSettings({ ...settings, token_name: e.target.value })}
                className="form-input"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Token Symbol</label>
              <input
                type="text"
                value={settings.token_symbol}
                onChange={(e) => setSettings({ ...settings, token_symbol: e.target.value })}
                className="form-input"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Token Contract Address</label>
              <input
                type="text"
                value={settings.contract_address}
                onChange={(e) => setSettings({ ...settings, contract_address: e.target.value })}
                className="form-input"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Treasury/Owner Wallet Address</label>
              <input
                type="text"
                value={settings.owner_address}
                onChange={(e) => setSettings({ ...settings, owner_address: e.target.value })}
                className="form-input"
                required
              />
            </div>

            <button type="submit" className="faucet-claim-btn" style={{ margin: "10px 0 0 0", maxWidth: "none" }} disabled={loading}>
              {loading ? "Saving Settings..." : "Save Configuration"}
            </button>
          </form>
        </div>
      )}

      {/* TRANSACTIONS TAB */}
      {activeTab === "transactions" && (
        <div className="table-container">
          <h3 style={{ margin: "0 0 20px 0" }}>Purchase Transaction History</h3>
          <table className="explorer-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Investor Wallet</th>
                <th>Payment Type</th>
                <th>Crypto Amount</th>
                <th>Tokens Credited</th>
                <th>USD Value</th>
                <th>On-Chain Hash</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length > 0 ? (
                transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{new Date(tx.created_at).toLocaleString()}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "13px" }}>{tx.address}</td>
                    <td>{tx.payment_type}</td>
                    <td>{parseFloat(tx.crypto_value).toFixed(2)}</td>
                    <td style={{ color: "var(--success)", fontWeight: "600" }}>{parseFloat(tx.ptc_tokens).toLocaleString()} ROM</td>
                    <td>${parseFloat(tx.usd_value_of_crypto).toFixed(2)}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "13px" }}>
                      <a href={`/?q=${tx.trans_hash}`} style={{ color: "var(--accent)", textDecoration: "none" }} className="clickable-hash">
                        {truncate(tx.trans_hash, 8, 8)}
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", color: "var(--text-secondary)" }}>No purchases registered yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* USERS TAB */}
      {activeTab === "users" && (
        <div className="table-container">
          <h3 style={{ margin: "0 0 20px 0" }}>Investors List</h3>
          <table className="explorer-table">
            <thead>
              <tr>
                <th>Investor Wallet Address</th>
                <th>Total Tokens Purchased</th>
                <th>Total USD Spent</th>
              </tr>
            </thead>
            <tbody>
              {users.length > 0 ? (
                users.map((user, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: "monospace", fontSize: "13px" }}>{user.wallet_address}</td>
                    <td style={{ color: "var(--accent)", fontWeight: "600" }}>{parseFloat(user.ptc_tokens_purchased).toLocaleString()} ROM</td>
                    <td style={{ color: "var(--success)", fontWeight: "600" }}>${parseFloat(user.total_usd_invested).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" style={{ textAlign: "center", color: "var(--text-secondary)" }}>No users registered yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

export default AdminApp;
