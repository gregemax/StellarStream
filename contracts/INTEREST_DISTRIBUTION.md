# Interest Distribution Implementation

## Overview

This implementation adds interest distribution capabilities to the StellarStream contract, allowing streams to benefit from yield generated when principal is deposited in external yield vaults.

## Features Implemented

### 1. Interest Strategy Parameter

Added `interest_strategy: u32` to the `Stream` struct to control how interest is distributed:

- `0b001` (1): All interest to sender
- `0b010` (2): All interest to receiver  
- `0b100` (4): All interest to protocol
- `0b011` (3): 50/50 split between sender and receiver
- `0b111` (7): 33/33/33 split among all three parties

### 2. Vault Integration

Added `vault_address: Option<Address>` to support external yield vaults:
- When `Some(vault)`, tokens are deposited to the vault instead of the contract
- Interest is calculated as the difference between current vault balance and original principal
- Interest is distributed according to the strategy on withdrawal or cancellation

### 3. Interest Calculation Module

Created `interest.rs` module with:
- `calculate_interest_distribution()`: Distributes interest based on strategy
- `calculate_vault_interest()`: Calculates interest earned from vault
- Comprehensive unit tests for all distribution strategies

### 4. Updated Contract Functions

#### `create_stream()`
Now accepts:
- `interest_strategy: u32`: Strategy for interest distribution (0-7)
- `vault_address: Option<Address>`: Optional vault for yield generation

#### `withdraw()`
Enhanced to:
- Calculate proportional interest for the withdrawal amount
- Distribute interest to sender, receiver, and/or protocol based on strategy
- Transfer principal and interest from vault (if used) or contract
- Emit interest distribution events

#### `cancel_stream()`
Enhanced to:
- Calculate and distribute all accumulated interest
- Handle vault withdrawals properly
- Distribute interest before returning principal

#### `get_interest_info()`
New query function that returns current interest distribution without executing transfers.

## Data Structures

### InterestDistribution
```rust
pub struct InterestDistribution {
    pub to_sender: i128,
    pub to_receiver: i128,
    pub to_protocol: i128,
    pub total_interest: i128,
}
```

### Updated Stream
```rust
pub struct Stream {
    // ... existing fields ...
    pub interest_strategy: u32,
    pub vault_address: Option<Address>,
    pub deposited_principal: i128,
}
```

## Interest Distribution Logic

### Strategy Bits
The strategy uses a 3-bit system where each bit represents a party:
- Bit 0 (0b001): Sender
- Bit 1 (0b010): Receiver
- Bit 2 (0b100): Protocol

Multiple bits can be set to split interest proportionally.

### Distribution Algorithm
1. Count enabled parties (bits set to 1)
2. Divide interest equally among enabled parties
3. Give any remainder to the first enabled party (sender > receiver > protocol)

### Examples
- Strategy 1 (0b001): 100% to sender
- Strategy 2 (0b010): 100% to receiver
- Strategy 3 (0b011): 50% sender, 50% receiver
- Strategy 7 (0b111): 33.33% each (remainder to sender)

## Proportional Interest Calculation

When withdrawing a portion of a stream, interest is calculated proportionally:

```
proportional_interest = (total_interest * withdrawable_principal) / total_principal
```

This ensures fair distribution as the stream is gradually withdrawn.

## Use Cases

### 1. Sender Discount Model
**Strategy: 1 (All to Sender)**
- Sender deposits funds in yield vault
- Interest reduces the effective cost of streaming
- Receiver gets guaranteed principal amount
- Sender benefits from time value of locked money

### 2. Receiver Bonus Model
**Strategy: 2 (All to Receiver)**
- Receiver gets principal + all interest
- Attractive for employee compensation or grants
- Sender pays fixed amount, receiver gets more

### 3. Protocol Fee Model
**Strategy: 4 (All to Protocol)**
- Protocol earns yield on locked funds
- Alternative revenue model to upfront fees
- Users pay no fees, protocol earns from yield

### 4. Shared Benefit Model
**Strategy: 3 or 7 (Split)**
- Both parties benefit from yield
- Fair distribution of time value
- Can include protocol in 3-way split

## Security Considerations

### Re-entrancy Protection
Both `withdraw()` and `cancel_stream()` are protected with re-entrancy guards to prevent attacks during interest distribution.

### Vault Trust
- Vault addresses are provided by stream creator
- Contract trusts vault to hold and return funds
- Users should only use audited, trusted vaults
- No negative interest: if vault value < principal, interest = 0

### Authorization
- Interest distribution respects existing authorization model
- Only authorized parties can trigger withdrawals
- Vault transfers require proper authorization

## Testing

### Unit Tests (Passing)
- ✅ Interest distribution calculations for all strategies
- ✅ Vault interest calculation (positive, zero, negative)
- ✅ Proportional interest calculation
- ✅ Remainder distribution
- ✅ Stream creation with interest parameters
- ✅ Invalid strategy rejection

### Integration Tests (Require Vault Contract)
- ⚠️ Withdrawal with vault interest
- ⚠️ Cancellation with vault interest
- ⚠️ Interest info query with vault

Note: Full vault integration tests require a mock vault contract with proper authorization. The logic is implemented and unit-tested; integration tests need vault infrastructure.

## Events

### Interest Distribution Event
```rust
env.events().publish(
    (symbol_short!("interest"), stream_id),
    InterestDistribution { ... },
);
```

Emitted whenever interest is distributed during withdrawal or cancellation.

## API Changes

### Breaking Changes
- `create_stream()` now requires 2 additional parameters
- `StreamRequest` struct has 2 new fields
- `Stream` struct has 3 new fields

### Migration Guide
For existing code:
```rust
// Old
client.create_stream(&sender, &receiver, &token, &amount, &start, &cliff, &end)

// New - add interest strategy and vault
client.create_stream(
    &sender, &receiver, &token, &amount, &start, &cliff, &end,
    &2,    // Strategy: all interest to receiver
    &None, // No vault (direct contract deposit)
)
```

## Future Enhancements

1. **Vault Registry**: Whitelist of approved vaults
2. **Dynamic Strategies**: Allow strategy changes mid-stream
3. **Interest Compounding**: Reinvest interest automatically
4. **Multi-Vault Support**: Split principal across multiple vaults
5. **Interest Caps**: Maximum interest limits for risk management

## Acceptance Criteria

✅ **Strategy Parameter**: Added `interest_strategy: u32` to Stream struct
✅ **Calculation**: Withdraw calculates difference between vault value and principal
✅ **Distribution**: Interest split based on strategy chosen at creation
✅ **Principal vs Yield**: Contract accurately distinguishes between them
✅ **User Choice**: Users can choose who benefits from time value of money

## Files Modified/Created

- `contracts/src/types.rs`: Added interest fields and constants
- `contracts/src/interest.rs`: New module for interest calculations
- `contracts/src/lib.rs`: Updated contract functions
- `contracts/src/interest_test.rs`: Comprehensive test suite
- `contracts/src/test.rs`: Updated existing tests for new parameters
- `contracts/INTEREST_DISTRIBUTION.md`: This documentation

## Branch Information

- Branch: `feature/interest-distribution`
- Based on: `feature/reentrancy-guard`
- Status: Ready for review

## Next Steps

1. Code review
2. Create mock vault contract for integration testing
3. Security audit of interest distribution logic
4. Deploy to testnet with sample vault
5. Document vault integration guide for users
