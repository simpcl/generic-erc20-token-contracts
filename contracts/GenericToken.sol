// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title GenericToken
 * @dev A generic ERC20 token with EIP-2612 (permit) functionality,
 * enhanced security features, and comprehensive access controls.
 *
 * Features:
 * - ERC20 standard implementation
 * - EIP-2612 permit functionality (gasless approvals)
 * - Ownable access control
 * - Pausable functionality
 * - Burnable tokens
 * - Role-based operations
 * - Emergency controls
 * - Comprehensive events for monitoring
 */
contract GenericToken is
    ERC20,
    ERC20Permit,
    ERC20Burnable,
    ERC20Pausable,
    Ownable
{
    // ============ Events ============

    /**
     * @dev Emitted when tokens are minted
     */
    event TokensMinted(address indexed to, uint256 amount);

    /**
     * @dev Emitted when the contract is paused
     */
    event ContractPaused(address indexed by);

    /**
     * @dev Emitted when the contract is unpaused
     */
    event ContractUnpaused(address indexed by);

    /**
     * @dev Emitted when a new minter is added
     */
    event MinterAdded(address indexed minter);

    /**
     * @dev Emitted when a minter is removed
     */
    event MinterRemoved(address indexed minter);

    /**
     * @dev Emitted when emergency functions are triggered
     */
    event EmergencyAction(address indexed by, string action);

    // ============ State Variables ============

    // EIP-3009 authorization states
    enum AuthorizationState {
        Unused,
        Used,
        Canceled
    }
    mapping(address => mapping(bytes32 => uint8)) private _authorizationStates;

    // EIP-3009 EIP-712 typehashes
    bytes32 private constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
    bytes32 private constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
    bytes32 private constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    // EIP-3009 events
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(
        address indexed authorizer,
        bytes32 indexed nonce
    );

    /**
     * @dev Mapping of addresses that have minting privileges
     */
    mapping(address => bool) private _minters;

    /**
     * @dev Custom decimals for the token
     */
    uint8 private immutable _decimals;

    /**
     * @dev Maximum supply cap (in smallest units)
     */
    uint256 public immutable MAX_SUPPLY;

    /**
     * @dev Daily minting limit to prevent spam attacks (in smallest units)
     */
    uint256 public immutable DAILY_MINT_LIMIT;

    /**
     * @dev Tracking of daily minted amounts
     */
    mapping(uint256 => uint256) private _dailyMinted;

    /**
     * @dev Blacklist for malicious addresses
     */
    mapping(address => bool) private _blacklisted;

    /**
     * @dev Emergency flag for critical situations
     */
    bool private _emergencyMode;

    // ============ Modifiers ============

    /**
     * @dev Restricts function to minters only
     */
    modifier onlyMinter() {
        require(
            _minters[msg.sender] || msg.sender == owner(),
            "GenericToken: Caller is not a minter"
        );
        _;
    }

    /**
     * @dev Prevents blacklisted addresses from executing functions
     */
    modifier notBlacklisted() {
        require(
            !_blacklisted[msg.sender],
            "GenericToken: Caller is blacklisted"
        );
        _;
    }

    /**
     * @dev Ensures recipient is not blacklisted
     */
    modifier recipientNotBlacklisted(address to) {
        require(!_blacklisted[to], "GenericToken: Recipient is blacklisted");
        _;
    }

    /**
     * @dev Checks daily minting limit
     */
    modifier respectsDailyLimit(uint256 amount) {
        uint256 today = block.timestamp / 1 days;
        uint256 dailyTotal = _dailyMinted[today] + amount;
        require(
            dailyTotal <= DAILY_MINT_LIMIT,
            "GenericToken: Daily mint limit exceeded"
        );
        _;
        _dailyMinted[today] = dailyTotal;
    }

    /**
     * @dev Only callable when not in emergency mode
     */
    modifier notEmergencyMode() {
        require(!_emergencyMode, "GenericToken: Contract in emergency mode");
        _;
    }

    // ============ Constructor ============

    /**
     * @dev Initializes the token with name, symbol, decimals, initial supply, max supply, and daily mint limit
     * @param name The token name
     * @param symbol The token symbol
     * @param decimals_ The number of decimals (e.g., 18 for standard, 6 for stablecoins)
     * @param initialSupply Initial tokens to mint for the owner (in smallest units)
     * @param maxSupply_ Maximum supply cap (in smallest units)
     * @param dailyMintLimit_ Daily minting limit (in smallest units)
     */
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 initialSupply,
        uint256 maxSupply_,
        uint256 dailyMintLimit_
    ) ERC20(name, symbol) ERC20Permit(name) Ownable(msg.sender) {
        require(decimals_ <= 18, "GenericToken: Decimals cannot exceed 18");
        require(
            maxSupply_ > 0,
            "GenericToken: Max supply must be greater than 0"
        );
        require(
            dailyMintLimit_ > 0,
            "GenericToken: Daily mint limit must be greater than 0"
        );
        require(
            initialSupply <= maxSupply_,
            "GenericToken: Initial supply exceeds max supply"
        );

        _decimals = decimals_;
        MAX_SUPPLY = maxSupply_;
        DAILY_MINT_LIMIT = dailyMintLimit_;

        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
            emit TokensMinted(msg.sender, initialSupply);
        }

        // Owner is automatically a minter
        _minters[msg.sender] = true;
        emit MinterAdded(msg.sender);
    }

    // ============ External Functions ============

    /**
     * @dev EIP-3009: Transfer tokens with signed authorization.
     */
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external notEmergencyMode {
        require(
            !_blacklisted[from] && !_blacklisted[to],
            "GenericToken: Blacklisted address"
        );
        require(
            block.timestamp > validAfter,
            "GenericToken: Authorization not yet valid"
        );
        require(
            block.timestamp < validBefore,
            "GenericToken: Authorization expired"
        );
        require(
            _authorizationStates[from][nonce] ==
                uint8(AuthorizationState.Unused),
            "GenericToken: Authorization used or canceled"
        );

        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );

        address signer = ECDSA.recover(_hashTypedDataV4(structHash), v, r, s);
        require(signer == from, "GenericToken: Invalid signature");

        _authorizationStates[from][nonce] = uint8(AuthorizationState.Used);
        emit AuthorizationUsed(from, nonce);

        _transfer(from, to, value);
    }

    /**
     * @dev EIP-3009: Receive tokens with signed authorization. Caller must be the recipient.
     */
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external notEmergencyMode {
        require(msg.sender == to, "GenericToken: Caller must be recipient");
        require(
            !_blacklisted[from] && !_blacklisted[to],
            "GenericToken: Blacklisted address"
        );
        require(
            block.timestamp > validAfter,
            "GenericToken: Authorization not yet valid"
        );
        require(
            block.timestamp < validBefore,
            "GenericToken: Authorization expired"
        );
        require(
            _authorizationStates[from][nonce] ==
                uint8(AuthorizationState.Unused),
            "GenericToken: Authorization used or canceled"
        );

        bytes32 structHash = keccak256(
            abi.encode(
                RECEIVE_WITH_AUTHORIZATION_TYPEHASH,
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );

        address signer = ECDSA.recover(_hashTypedDataV4(structHash), v, r, s);
        require(signer == from, "GenericToken: Invalid signature");

        _authorizationStates[from][nonce] = uint8(AuthorizationState.Used);
        emit AuthorizationUsed(from, nonce);

        _transfer(from, to, value);
    }

    /**
     * @dev EIP-3009: Cancel a signed authorization that has not been used yet.
     */
    function cancelAuthorization(
        address authorizer,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external notEmergencyMode {
        require(
            _authorizationStates[authorizer][nonce] ==
                uint8(AuthorizationState.Unused),
            "GenericToken: Authorization used or canceled"
        );

        bytes32 structHash = keccak256(
            abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce)
        );

        address signer = ECDSA.recover(_hashTypedDataV4(structHash), v, r, s);
        require(signer == authorizer, "GenericToken: Invalid signature");

        _authorizationStates[authorizer][nonce] = uint8(
            AuthorizationState.Canceled
        );
        emit AuthorizationCanceled(authorizer, nonce);
    }

    /**
     * @dev View authorization state for an (authorizer, nonce).
     */
    function authorizationState(
        address authorizer,
        bytes32 nonce
    ) external view returns (uint8) {
        return _authorizationStates[authorizer][nonce];
    }

    /**
     * @dev Mints new tokens to the specified address
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(
        address to,
        uint256 amount
    )
        external
        onlyMinter
        notBlacklisted
        recipientNotBlacklisted(to)
        respectsDailyLimit(amount)
        notEmergencyMode
    {
        require(to != address(0), "GenericToken: Cannot mint to zero address");
        require(
            totalSupply() + amount <= MAX_SUPPLY,
            "GenericToken: Max supply exceeded"
        );

        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @dev Burns tokens from the caller's account
     * @param amount The amount of tokens to burn
     */
    function burn(
        uint256 amount
    ) public override notBlacklisted notEmergencyMode {
        super.burn(amount);
    }

    /**
     * @dev Burns tokens from a specified account
     * @param account The account to burn from
     * @param amount The amount of tokens to burn
     */
    function burnFrom(
        address account,
        uint256 amount
    ) public override notBlacklisted notEmergencyMode {
        super.burnFrom(account, amount);
    }

    /**
     * @dev Transfers tokens between addresses
     * @param to The recipient address
     * @param amount The amount to transfer
     * @return bool True if successful
     */
    function transfer(
        address to,
        uint256 amount
    )
        public
        override
        notBlacklisted
        recipientNotBlacklisted(to)
        notEmergencyMode
        returns (bool)
    {
        return super.transfer(to, amount);
    }

    /**
     * @dev Transfers tokens from one address to another
     * @param from The sender address
     * @param to The recipient address
     * @param amount The amount to transfer
     * @return bool True if successful
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    )
        public
        override
        notBlacklisted
        recipientNotBlacklisted(to)
        notEmergencyMode
        returns (bool)
    {
        return super.transferFrom(from, to, amount);
    }

    /**
     * @dev Approves spending of tokens with additional safety checks
     * @param spender The address to approve
     * @param amount The amount to approve
     * @return bool True if successful
     */
    function approve(
        address spender,
        uint256 amount
    ) public override notBlacklisted notEmergencyMode returns (bool) {
        return super.approve(spender, amount);
    }

    /**
     * @dev Permits spending of tokens via signature (EIP-2612)
     * @param owner The token owner
     * @param spender The approved spender
     * @param value The amount to approve
     * @param deadline The deadline for the signature
     * @param v Recovery parameter
     * @param r Recovery parameter
     * @param s Recovery parameter
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override notEmergencyMode {
        super.permit(owner, spender, value, deadline, v, r, s);
    }

    /**
     * @dev Pauses all token transfers and operations
     */
    function pause() external onlyOwner {
        _pause();
        emit ContractPaused(msg.sender);
    }

    /**
     * @dev Unpauses all token transfers and operations
     */
    function unpause() external onlyOwner {
        _unpause();
        emit ContractUnpaused(msg.sender);
    }

    /**
     * @dev Adds a new minter
     * @param minter The address to add as minter
     */
    function addMinter(address minter) external onlyOwner {
        require(
            minter != address(0),
            "GenericToken: Cannot add zero address as minter"
        );
        require(!_minters[minter], "GenericToken: Address is already a minter");

        _minters[minter] = true;
        emit MinterAdded(minter);
    }

    /**
     * @dev Removes a minter
     * @param minter The address to remove as minter
     */
    function removeMinter(address minter) external onlyOwner {
        require(_minters[minter], "GenericToken: Address is not a minter");
        require(
            minter != owner(),
            "GenericToken: Cannot remove owner as minter"
        );

        _minters[minter] = false;
        emit MinterRemoved(minter);
    }

    /**
     * @dev Blacklists an address from using the token
     * @param account The address to blacklist
     */
    function blacklist(address account) external onlyOwner {
        require(
            account != address(0),
            "GenericToken: Cannot blacklist zero address"
        );
        require(account != owner(), "GenericToken: Cannot blacklist owner");

        _blacklisted[account] = true;
        emit EmergencyAction(msg.sender, "BLACKLIST");
    }

    /**
     * @dev Removes an address from the blacklist
     * @param account The address to unblacklist
     */
    function unblacklist(address account) external onlyOwner {
        _blacklisted[account] = false;
        emit EmergencyAction(msg.sender, "UNBLACKLIST");
    }

    /**
     * @dev Activates emergency mode, restricting most operations
     */
    function activateEmergencyMode() external onlyOwner {
        _emergencyMode = true;
        emit EmergencyAction(msg.sender, "EMERGENCY_MODE_ACTIVATED");
    }

    /**
     * @dev Deactivates emergency mode
     */
    function deactivateEmergencyMode() external onlyOwner {
        _emergencyMode = false;
        emit EmergencyAction(msg.sender, "EMERGENCY_MODE_DEACTIVATED");
    }

    /**
     * @dev Emergency function to transfer tokens from any account (in case of lost keys)
     * Only usable in emergency mode and requires owner privileges
     * @param from The address to transfer from
     * @param to The address to transfer to
     * @param amount The amount to transfer
     */
    function emergencyTransfer(
        address from,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(_emergencyMode, "GenericToken: Not in emergency mode");
        require(
            to != address(0),
            "GenericToken: Cannot transfer to zero address"
        );

        _transfer(from, to, amount);
        emit EmergencyAction(msg.sender, "EMERGENCY_TRANSFER");
    }

    // ============ View Functions ============

    /**
     * @dev Checks if an address is a minter
     * @param account The address to check
     * @return bool True if the address is a minter
     */
    function isMinter(address account) external view returns (bool) {
        return _minters[account];
    }

    /**
     * @dev Checks if an address is blacklisted
     * @param account The address to check
     * @return bool True if the address is blacklisted
     */
    function isBlacklisted(address account) external view returns (bool) {
        return _blacklisted[account];
    }

    /**
     * @dev Checks if the contract is in emergency mode
     * @return bool True if in emergency mode
     */
    function emergencyMode() external view returns (bool) {
        return _emergencyMode;
    }

    /**
     * @dev Gets the amount minted today
     * @return uint256 Amount minted today
     */
    function dailyMinted() external view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        return _dailyMinted[today];
    }

    /**
     * @dev Gets the remaining daily mint limit
     * @return uint256 Remaining daily limit
     */
    function remainingDailyLimit() external view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        return DAILY_MINT_LIMIT - _dailyMinted[today];
    }

    /**
     * @dev Returns the number of decimals used to get its user representation
     * @return uint8 The number of decimals
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev Gets the maximum supply
     * @return uint256 Maximum supply
     */
    function maxSupply() external view returns (uint256) {
        return MAX_SUPPLY;
    }

    // ============ Internal Functions ============

    /**
     * @dev Override the _update function to resolve conflict between ERC20 and ERC20Pausable
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, amount);
    }

    /**
     * @dev Returns the version string for EIP-712 signature
     * @return string The version string
     */
    function version() external pure returns (string memory) {
        return "1";
    }

    /**
     * @dev Returns the EIP-712 domain separator
     * @return bytes32 The domain separator
     */
    function DOMAIN_SEPARATOR() external view override returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @dev Returns the current nonce for an owner
     * @param owner The address to query
     * @return uint256 The current nonce
     */
    function nonces(address owner) public view override returns (uint256) {
        return super.nonces(owner);
    }
}
