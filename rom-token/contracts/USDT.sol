// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract USDT is ERC20 {
    // 1000 USDT per faucet request
    uint256 public constant FAUCET_AMOUNT = 1000 * 10 ** 6;
    
    // Cooldown mapping to prevent abuse (e.g. 10 minutes cooldown)
    mapping(address => uint256) public lastRequestTime;
    uint256 public constant COOLDOWN_TIME = 10 minutes;

    event FaucetRequested(address indexed receiver, uint256 amount);

    constructor() ERC20("Tether USD", "USDT") {
        // Mint initial supply of 1 billion USDT to the deployer
        _mint(msg.sender, 1000000000 * 10 ** decimals());
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    /**
     * @notice Allows users to request mock USDT tokens for testing on the private blockchain.
     */
    function requestTokens() external {
        require(
            block.timestamp >= lastRequestTime[msg.sender] + COOLDOWN_TIME,
            "USDTFaucet: Cooldown active"
        );
        lastRequestTime[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetRequested(msg.sender, FAUCET_AMOUNT);
    }
}
