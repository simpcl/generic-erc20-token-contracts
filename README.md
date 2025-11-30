# Generic ERC20 Token that supports EIP-2612 & EIP-3009

A comprehensive, generic ERC20 token implementation featuring EIP-2612 (permit) and EIP-3009 (transfer with authorization) functionality, enhanced security measures, and extensive access controls built with OpenZeppelin contracts.

## Features

### Core ERC20 + EIP-2612 + EIP-3009
- Full ERC20 compliance
- EIP-2612 permit functionality (gasless approvals)
- EIP-3009 transfer with authorization (gasless transfers)
- ERC20Permit with signature-based approvals
- Authorization state management (Unused/Used/Canceled)
- Nonce management for replay protection

### Security & Access Control
- Ownable access control
- Role-based minting system
- Pausable functionality
- Emergency mode for critical situations
- Address blacklisting
- Daily minting limits to prevent spam
- Maximum supply cap

### Advanced Features
- Burnable tokens
- Emergency transfer capabilities
- Comprehensive event logging
- Gas-optimized operations
- Frontend-friendly integration helpers
- Time-windowed authorizations (validAfter/validBefore)
- Flexible authorization management (create, use, cancel)

## Contract Overview

### GenericToken.sol

The main contract implements all the features mentioned above with a focus on security and production readiness.

#### Key Parameters:
- **Max Supply**: 18 million tokens
- **Daily Mint Limit**: 1 million tokens
- **Decimals**: 18
- **EIP-2612 Version**: 1
- **EIP-3009 Authorization States**: Unused (0), Used (1), Canceled (2)

## Installation & Setup

### Prerequisites
- Node.js (v16+)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd erc20-token-with-eip2612-contracts

# Install dependencies
npm install

# Compile contracts
npm run compile
```

## Usage

### Local Development

```bash
# Start local Hardhat network
npm run node

# Deploy to local network (in separate terminal)
npm run deploy

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Deployment to Testnet/Mainnet

```bash
# Deploy to specified network
npx hardhat run scripts/deploy.js --network localnetwork

# Environment variables for customization
export TOKEN_NAME="MyToken"
export TOKEN_SYMBOL="MTK"
export INITIAL_SUPPLY="1000000"
```

## Scripts

### deploy.js
Automated deployment script that:
- Deploys the token contract
- Verifies deployment parameters
- Saves deployment information
- Outputs frontend environment variables

### interact.js
Interactive script for token management:
- Mint tokens
- Transfer tokens
- Manage permissions
- Test EIP-2612 functionality
- Test EIP-3009 functionality
- Emergency controls

## Testing

The project includes comprehensive test suites:

### Main Tests (GenericToken.test.js)
- Basic ERC20 functionality
- EIP-2612 permit operations
- Minting and burning
- Access controls
- Pausable features
- Emergency mode
- Blacklist functionality
- Gas optimization

### EIP-2612 Specific Tests (EIP2612.test.js)
- Domain separator validation
- Signature verification
- Nonce management
- Deadline enforcement
- Replay attack prevention
- Integration with other features

### EIP-3009 Specific Tests (EIP3009.test.js)
- Transfer with authorization functionality
- Receive with authorization (recipient enforcement)
- Authorization state management
- Time window enforcement
- Authorization cancellation
- Replay protection
- Security scenarios (blacklist, emergency mode, pause)

## Security Features

### Access Control
- **Owner**: Full control over the contract
- **Minters**: Can mint tokens within limits
- **Blacklist**: Prevent malicious addresses from using the token
- **Emergency Mode**: Critical situation handling

### Protection Mechanisms
- Daily minting limits (1M tokens/day)
- Maximum supply cap (18M tokens)
- Signature replay protection
- Deadline enforcement for permits
- Zero address checks

### Emergency Functions
- Emergency mode activation/deactivation
- Emergency transfer from any account
- Contract pause/unpause
- Address blacklist management

## EIP-2612 (Permit) Usage

EIP-2612 allows users to approve token spending with a signature instead of an on-chain transaction:

```javascript
// Example of permit usage
const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
const nonce = await token.nonces(owner.address);

const domain = {
  name: await token.name(),
  version: "1",
  chainId: await ethers.provider.getNetwork().then(n => n.chainId),
  verifyingContract: token.address
};

const types = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};

const value = {
  owner: owner.address,
  spender: spender.address,
  value: ethers.utils.parseUnits("1000", 18),
  nonce: nonce,
  deadline: deadline
};

// Sign the permit data
const signature = await owner._signTypedData(domain, types, value);
const { v, r, s } = ethers.utils.splitSignature(signature);

// Execute permit
await token.permit(owner.address, spender.address, value.value, deadline, v, r, s);
```

## EIP-3009 (Transfer With Authorization) Usage

EIP-3009 allows users to transfer tokens with a signature, enabling gasless transfers and third-party submission:

### Transfer With Authorization

```javascript
// Example of transferWithAuthorization usage
const validAfter = 0; // Valid immediately
const validBefore = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour
const nonce = ethers.hexlify(ethers.randomBytes(32)); // Random nonce

const domain = {
  name: await token.name(),
  version: "1",
  chainId: await ethers.provider.getNetwork().then(n => n.chainId),
  verifyingContract: token.address
};

const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
};

const value = {
  from: fromAddress,
  to: toAddress,
  value: ethers.utils.parseUnits("1000", 18),
  validAfter: validAfter,
  validBefore: validBefore,
  nonce: nonce
};

// Sign the authorization
const signature = await fromSigner._signTypedData(domain, types, value);
const { v, r, s } = ethers.utils.splitSignature(signature);

// Anyone can submit the transfer (not just the signer)
await token.transferWithAuthorization(
  fromAddress,
  toAddress,
  value.value,
  validAfter,
  validBefore,
  nonce,
  v, r, s
);
```

### Receive With Authorization

```javascript
// Example of receiveWithAuthorization usage
// Caller must be the recipient (to address)
const types = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
};

// The recipient signs and submits
const signature = await fromSigner._signTypedData(domain, types, value);
const { v, r, s } = ethers.utils.splitSignature(signature);

// Recipient must be the caller
await token.connect(recipient).receiveWithAuthorization(
  fromAddress,
  recipient.address,
  value.value,
  validAfter,
  validBefore,
  nonce,
  v, r, s
);
```

### Cancel Authorization

```javascript
// Cancel an unused authorization
const cancelTypes = {
  CancelAuthorization: [
    { name: "authorizer", type: "address" },
    { name: "nonce", type: "bytes32" }
  ]
};

const cancelValue = {
  authorizer: fromAddress,
  nonce: nonce
};

const cancelSignature = await fromSigner._signTypedData(domain, cancelTypes, cancelValue);
const { v, r, s } = ethers.utils.splitSignature(cancelSignature);

await token.cancelAuthorization(fromAddress, nonce, v, r, s);

// Check authorization state
const state = await token.authorizationState(fromAddress, nonce);
// Returns: 0 = Unused, 1 = Used, 2 = Canceled
```

## Frontend Integration

### Environment Variables

After deployment, use these environment variables in your frontend:

```bash
NEXT_PUBLIC_TOKEN_ADDRESS=<deployed_contract_address>
NEXT_PUBLIC_TOKEN_NAME=<token_name>
NEXT_PUBLIC_TOKEN_SYMBOL=<token_symbol>
NEXT_PUBLIC_TOKEN_DECIMALS=18
```

### Example Integration

```javascript
import { ethers } from 'ethers';

const provider = new ethers.providers.Web3Provider(window.ethereum);
const token = new ethers.Contract(TOKEN_ADDRESS, ABI, provider);

// Get token info
const name = await token.name();
const symbol = await token.symbol();
const totalSupply = await token.totalSupply();

// Get balance
const balance = await token.balanceOf(userAddress);
const formattedBalance = ethers.utils.formatUnits(balance, 18);

// Permit functionality (gasless approval)
const permitSignature = await signPermit(owner, spender, amount, deadline);
await token.permit(owner.address, spender.address, amount, deadline, v, r, s);

// EIP-3009 transfer with authorization (gasless transfer)
const transferAuth = await signTransferAuthorization(from, to, amount, nonce, validAfter, validBefore);
await token.transferWithAuthorization(from, to, amount, validAfter, validBefore, nonce, v, r, s);

// Check authorization state
const authState = await token.authorizationState(from, nonce);
console.log('Authorization state:', authState); // 0: Unused, 1: Used, 2: Canceled
```

## Gas Optimization

The contract is optimized for gas efficiency:

- **Transfer**: ~60,000 gas
- **Approve**: ~50,000 gas
- **Permit (EIP-2612)**: ~95,000 gas
- **TransferWithAuthorization (EIP-3009)**: ~91,000 gas
- **ReceiveWithAuthorization (EIP-3009)**: ~91,000 gas
- **CancelAuthorization (EIP-3009)**: ~54,000 gas
- **TransferFrom after Permit**: ~65,000 gas
- **Mint**: ~86,000 gas

## Monitoring & Events

The contract emits comprehensive events for monitoring:

```solidity
// ERC20 & Management Events
event TokensMinted(address indexed to, uint256 amount);
event ContractPaused(address indexed by);
event ContractUnpaused(address indexed by);
event MinterAdded(address indexed minter);
event MinterRemoved(address indexed minter);
event EmergencyAction(address indexed by, string action);

// EIP-3009 Events
event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);
```

## Audit Considerations

This implementation includes security best practices:

1. **Access Control**: Proper role-based permissions
2. **Input Validation**: Comprehensive parameter checks
3. **Reentrancy Protection**: Built-in with OpenZeppelin contracts
4. **Integer Overflow**: Protected by Solidity 0.8+ and OpenZeppelin
5. **Emergency Controls**: Multiple layers of emergency protection
6. **Gas Limit Protection**: Reasonable limits on operations
7. **Signature Replay Protection**: Nonce-based authorization tracking
8. **Time Window Enforcement**: Valid after/before timestamps
9. **Authorization State Management**: Complete lifecycle tracking
10. **EIP-712 Compliance**: Secure typed data signing

## API Reference

### Core Functions

#### ERC20 Functions
- `balanceOf(address)`: Get token balance
- `transfer(address, uint256)`: Transfer tokens
- `approve(address, uint256)`: Approve spending
- `transferFrom(address, address, uint256)`: Transfer with allowance

#### EIP-2612 Functions
- `permit(address, address, uint256, uint256, uint8, bytes32, bytes32)`: Gasless approval
- `nonces(address)`: Get current nonce
- `DOMAIN_SEPARATOR()`: Get EIP-712 domain separator
- `version()`: Get EIP-712 version string

#### EIP-3009 Functions
- `transferWithAuthorization(address, address, uint256, uint256, uint256, bytes32, uint8, bytes32, bytes32)`: Transfer tokens with signed authorization
- `receiveWithAuthorization(address, address, uint256, uint256, uint256, bytes32, uint8, bytes32, bytes32)`: Receive tokens (caller must be recipient)
- `cancelAuthorization(address, bytes32, uint8, bytes32, bytes32)`: Cancel unused authorization
- `authorizationState(address, bytes32)`: Get authorization state (0=Unused, 1=Used, 2=Canceled)

#### Management Functions
- `mint(address, uint256)`: Mint new tokens (minter only)
- `burn(uint256)`: Burn tokens
- `pause()`: Pause contract (owner only)
- `addMinter(address)`: Add new minter (owner only)
- `blacklist(address)`: Blacklist address (owner only)
- `activateEmergencyMode()`: Activate emergency mode (owner only)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Disclaimer

This smart contract is provided as-is, without warranty. Use at your own risk. Always conduct thorough testing and security audits before deploying to mainnet.

## Support

For questions or support:
- Open an issue on GitHub
- Review the test files for usage examples
- Check the interactive script for functionality demonstrations