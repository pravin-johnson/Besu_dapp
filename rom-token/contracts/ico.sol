// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title ROMICO
 * @dev Token sale contract for ROM Token using USDT as payment asset,
 * protected by an off-chain signer.
 */
contract ROMICO is ReentrancyGuard, AccessControl, Pausable, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    /// @notice Emitted when tokens are purchased
    /// @param to Recipient address
    /// @param amount Amount of tokens purchased
    event TokenPurchased(address indexed to, uint256 amount);

    /// @notice Emitted when token price per USD is updated
    /// @param amount New token amount per USD
    event TokenPerUSDPriceUpdated(uint256 amount);

    /// @notice Emitted when USDT token address is updated
    /// @param tokenAddress New USDT token address
    event USDTAddressUpdated(address indexed tokenAddress);

    /// @notice Emitted when sale token address is updated
    /// @param tokenAddress New token address
    event TokenAddressUpdated(address indexed tokenAddress);

    /// @notice Emitted when signer address is updated
    /// @param previousSigner Old signer address
    /// @param newSigner New signer address
    event SignerAddressUpdated(
        address indexed previousSigner,
        address indexed newSigner
    );

    /// @notice Emitted when ownership is transferred
    /// @param previousOwner Old owner address
    /// @param newOwner New owner address
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /// @notice Emitted when ERC20 tokens are recovered from contract
    /// @param token Token address
    /// @param to Recipient address
    /// @param amount Amount recovered
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    /// @notice Emitted when contract is paused
    /// @param by Address that paused the contract
    event ContractPaused(address indexed by);

    /// @notice Emitted when contract is unpaused
    /// @param by Address that unpaused the contract
    event ContractUnpaused(address indexed by);

    /// @notice Emitted when an address is added to or removed from the blacklist
    /// @param account The address whose status changed
    /// @param status True if blacklisted, false if removed
    event Blacklisted(address indexed account, bool status);

    /// @notice Nonces used for signed purchase authorizations.
    mapping(uint256 => bool) public usedNonce;
    /// @notice Addresses blocked from participating in the ICO.
    mapping(address => bool) public blacklisted;

    /// @notice ERC20 token being sold (ROM).
    IERC20 public tokenAddress;

    /// @notice ERC20 token used for payment (USDT).
    IERC20 public usdtAddress;

    /// @notice Off-chain signer that authorizes purchases.
    address public signer;
    /// @notice Contract owner (also has ADMIN_ROLE).
    address public owner;
    
    /// @notice Number of ROM units (in 18 decimals) per 1 USD (1 USDT).
    /// @dev Default: 10 ROM tokens per 1 USDT.
    uint256 public tokenAmountPerUSD = 10 * 10 ** 18;

    /// @notice Role identifier for admin privileges.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // EIP-712 domain + typed data
    bytes32 private constant PURCHASE_TYPEHASH =
        keccak256(
            "Purchase(address recipient,address caller,uint256 amount,uint256 nonce,uint256 deadline)"
        );

    struct Sign {
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 nonce;
        uint256 deadline;
    }

    /**
     * @notice Deploy the ROMICO contract.
     * @param _ownerAddress Address that will receive ADMIN_ROLE and ownership.
     * @param _signerAddress Initial off-chain signer address.
     * @param _tokenAddress ERC20 token being sold (ROM).
     * @param _usdtAddress ERC20 token used for payment (USDT).
     */
    constructor(
        address _ownerAddress,
        address _signerAddress,
        IERC20 _tokenAddress,
        IERC20 _usdtAddress
    )
        EIP712("ROMICO", "1")
    {
        require(_ownerAddress != address(0), "Invalid owner");
        require(_signerAddress != address(0), "Invalid signer");
        require(address(_tokenAddress) != address(0), "Invalid token");
        require(address(_usdtAddress) != address(0), "Invalid USDT");
        
        owner = _ownerAddress;
        signer = _signerAddress;
        tokenAddress = _tokenAddress;
        usdtAddress = _usdtAddress;
        _grantRole(ADMIN_ROLE, owner);
    }

    /**
     * @notice Transfer the admin ownership of the ICO contract.
     * @param newOwner Address of the new owner/admin.
     */
    function transferOwnership(address newOwner)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(newOwner != address(0), "New owner cannot be zero address");
        require(newOwner != owner, "Same owner address");
        _revokeRole(ADMIN_ROLE, owner);
        address oldOwner = owner;
        owner = newOwner;
        _grantRole(ADMIN_ROLE, owner);
        emit OwnershipTransferred(oldOwner, owner);
    }

    /**
    * @notice Update the signer address used for purchase authorization.
    * @param signerAddress New signer address.
    */
    function setSignerAddress(address signerAddress)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(signerAddress != address(0), "Signer address cannot be zero");
        require(signerAddress != signer, "Same signer address");
        address oldSigner = signer;
        signer = signerAddress;
        emit SignerAddressUpdated(oldSigner, signer);
    }

    /**
    * @notice Pause all token purchase operations.
    */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
        emit ContractPaused(msg.sender);
    }

    /**
    * @notice Resume token purchase operations.
    */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
        emit ContractUnpaused(msg.sender);
    }

    /**
     * @notice Add or remove an address from the blacklist.
     */
    function setBlacklist(address account, bool status) external onlyRole(ADMIN_ROLE) {
        require(account != address(0), "Invalid address");
        require(blacklisted[account] != status, "Status unchanged");
        blacklisted[account] = status;
        emit Blacklisted(account, status);
    }

    modifier notBlacklisted(address account) {
        require(!blacklisted[account], "Address blacklisted");
        _;
    }

    /**
    * @notice Purchase ROM tokens using USDT.
    *
    * @dev
    * - Requires a valid off-chain signature from the authorized signer.
    * - Each signature nonce is globally unique and can only be used once.
    * - Reverts if the contract is paused.
    * - USDT is transferred from the caller.
    *
    * @param recipient Address that will receive the purchased ROM.
    * @param usdtAmount Amount of USDT paid (6 decimals).
    * @param sign Off-chain signature authorizing this purchase.
    */
    function buyToken(
        address recipient,
        uint256 usdtAmount,
        Sign memory sign
    ) external nonReentrant whenNotPaused notBlacklisted(msg.sender) notBlacklisted(recipient) {
        require(!usedNonce[sign.nonce], "Invalid Nonce");
        require(recipient != address(0), "Invalid recipient");
        require(block.timestamp <= sign.deadline, "Signature expired");
        require(usdtAmount > 0, "Invalid USDT amount");

        usedNonce[sign.nonce] = true;

        verifySign(recipient, msg.sender, usdtAmount, sign);
        
        uint256 romAmount = getToken(usdtAmount);
        
        require(
            tokenAddress.balanceOf(address(this)) >= romAmount,
            "Insufficient sale liquidity"
        );

        usdtAddress.safeTransferFrom(msg.sender, address(this), usdtAmount);
        tokenAddress.safeTransfer(recipient, romAmount);
        
        emit TokenPurchased(recipient, romAmount);
    }

    /**
    * @notice Compute the number of ROM tokens for a USDT amount.
    *
    * @dev
    * - Math: (usdtAmount * tokenAmountPerUSD) / (10 ** 6)
    *
    * @param usdtAmount Amount of USDT in 6 decimals.
    * @return romAmount Amount of ROM to be issued.
    */
    function getToken(uint256 usdtAmount)
        public
        view
        returns (uint256 romAmount)
    {
        require(usdtAmount > 0, "Zero USDT amount");

        // USDT decimals = 6
        // tokenAmountPerUSD represents ROM tokens (18 decimals) per 1 USD
        romAmount = Math.mulDiv(
            usdtAmount,
            tokenAmountPerUSD,
            1e6
        );

        require(romAmount > 0, "Output amount too small");
    }

    /**
     * @notice Withdraw a specific ERC20 token from the ICO to a wallet.
     */
    function recoverToken(address _tokenAddress, address walletAddress, uint256 amount)
        external
        onlyRole(ADMIN_ROLE)
        nonReentrant
    {
        require(walletAddress != address(0), "Token recipient cannot be zero address");
        require(amount <= IERC20(_tokenAddress).balanceOf(address(this)), "Insufficient amount");
        IERC20(_tokenAddress).safeTransfer(
            walletAddress,
            amount
        );
        emit TokenRecovered(_tokenAddress, walletAddress, amount);
    }

    /**
     * @notice Update the ERC20 token being sold.
     */
    function setTokenAddress(address _tokenAddress)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(_tokenAddress != address(0), "Token address cannot be zero");
        tokenAddress = IERC20(_tokenAddress);
        emit TokenAddressUpdated(_tokenAddress);
    }

    /**
     * @notice Update the ERC20 token used for payment.
     */
    function setUSDTAddress(address _usdtAddress)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(_usdtAddress != address(0), "USDT address cannot be zero");
        usdtAddress = IERC20(_usdtAddress);
        emit USDTAddressUpdated(_usdtAddress);
    }

    /**
     * @notice Update the number of ROM units per USD.
     */
    function setTokenPricePerUSD(uint256 tokenAmount)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(tokenAmount > 0, "Price must be positive");
        tokenAmountPerUSD = tokenAmount;
        emit TokenPerUSDPriceUpdated(tokenAmount);
    }

    /**
    * @notice Verify an off-chain signature authorizing a token purchase.
    */
    function verifySign(
        address recipient,
        address caller,
        uint256 amount,
        Sign memory sign
    ) internal view {
        require(signer != address(0), "Signer not set");

        bytes32 structHash = keccak256(
            abi.encode(
                PURCHASE_TYPEHASH,
                recipient,
                caller,
                amount,
                sign.nonce,
                sign.deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        address recoveredSigner = ECDSA.recover(digest, sign.v, sign.r, sign.s);

        require(recoveredSigner != address(0), "Invalid signature");
        require(recoveredSigner == signer, "Signer verification failed");
    }

    /**
    * @notice Reject direct ETH transfers.
    */
    receive() external payable {
        revert("ETH not accepted");
    }

    /**
    * @notice Reject calls to non-existent functions.
    */
    fallback() external payable {
        revert("Function does not exist");
    }
}