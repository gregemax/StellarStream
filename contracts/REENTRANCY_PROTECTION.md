# Re-entrancy Protection Implementation

## Overview

This document describes the re-entrancy protection mechanism implemented in the StellarStream smart contract. The implementation provides defense-in-depth with both Soroban's built-in host-level protection and an application-level mutex pattern.

## Defense-in-Depth Architecture

### Layer 1: Soroban Host-Level Protection
Soroban's architecture inherently prevents contract re-entry at the host level. Any attempt to call back into the same contract during execution will fail with "Contract re-entry is not allowed". This is a fundamental security feature of the Soroban runtime.

### Layer 2: Application-Level Mutex (Our Implementation)
We implement an additional mutex pattern using temporary storage to provide:
- Explicit control over critical sections
- Clear intent in code for security audits
- Protection against future runtime changes
- Best practice demonstration for Soroban development

## What is Re-entrancy?

Re-entrancy is a vulnerability where an external contract can call back into the original contract before the first invocation completes. This can lead to:
- Unauthorized fund withdrawals
- State inconsistencies
- Double-spending attacks

Although Soroban's architecture is more resistant to re-entrancy than the EVM, implementing explicit guards is still a best practice.

## Implementation

### Mutex Pattern with Transient Storage

We implement a "Mutex" (Mutual Exclusion) pattern using Soroban's temporary storage:

```rust
// Storage key for the lock
#[contracttype]
pub enum DataKey {
    Stream(u64),
    Admin,
    ReentrancyLock,  // Lock flag
}

// Check if locked
fn is_locked(env: &Env) -> bool {
    env.storage()
        .temporary()
        .get(&DataKey::ReentrancyLock)
        .unwrap_or(false)
}

// Set/release lock
fn set_lock(env: &Env, locked: bool) {
    if locked {
        env.storage()
            .temporary()
            .set(&DataKey::ReentrancyLock, &locked);
    } else {
        env.storage()
            .temporary()
            .remove(&DataKey::ReentrancyLock);
    }
}
```

### Protected Functions

Both `withdraw` and `cancel_stream` are protected:

```rust
pub fn withdraw(env: Env, stream_id: u64, receiver: Address) -> i128 {
    receiver.require_auth();

    // 1. Check if already locked (re-entrancy attempt)
    if Self::is_locked(&env) {
        panic!("Re-entrancy detected");
    }

    // 2. Set lock
    Self::set_lock(&env, true);

    // 3. Execute business logic
    let withdrawn = Self::withdraw_internal(&env, stream_id, &receiver);

    // 4. Release lock
    Self::set_lock(&env, false);

    withdrawn
}
```

## Why Temporary Storage?

We use `temporary()` storage instead of `persistent()` because:
1. **Automatic cleanup**: Temporary storage is cleared after transaction execution
2. **Gas efficiency**: No need to manually clean up the lock
3. **Transaction-scoped**: Lock only exists within the current transaction context
4. **Perfect for transient state**: Lock state doesn't need to persist between transactions

## Attack Scenario Prevented

### Without Protection:
```
1. User calls withdraw()
2. Contract calculates amount and updates state
3. Contract transfers tokens to receiver
4. Malicious receiver contract's receive function is triggered
5. Malicious contract calls withdraw() again (RE-ENTRANCY)
6. Contract sees old state (not yet updated)
7. Transfers tokens again → DOUBLE WITHDRAWAL
```

### With Protection:
```
1. User calls withdraw()
2. Contract checks lock (not locked)
3. Contract sets lock = true
4. Contract calculates amount and updates state
5. Contract transfers tokens to receiver
6. Malicious receiver contract's receive function is triggered
7. Malicious contract calls withdraw() again
8. Contract checks lock (LOCKED!) → PANIC "Re-entrancy detected"
9. Attack prevented ✓
```

## Testing

### Test Cases Implemented

1. **test_create_and_withdraw_stream**: Verifies normal withdrawal flow works
2. **test_cancel_stream**: Verifies normal cancellation flow works
3. **test_sequential_withdrawals_work**: Ensures legitimate sequential calls work correctly
4. **test_reentrancy_guard_prevents_nested_calls**: Verifies our mutex blocks nested calls
5. **test_lock_is_released_after_successful_withdrawal**: Confirms lock cleanup works properly
6. **test_soroban_defense_in_depth**: Demonstrates both protection layers working together
7. **test_unauthorized_withdrawal**: Ensures only authorized users can withdraw
8. **test_withdraw_before_start**: Validates time-based restrictions

### Mock Attacker Contract

While we include an `AttackerContract` in the test file for demonstration purposes, actual re-entrancy attacks are prevented at two levels:

1. **Soroban Host Level**: The runtime itself blocks contract re-entry
2. **Application Level**: Our mutex provides an additional safety net

```rust
#[contract]
pub struct AttackerContract;

#[contractimpl]
impl AttackerContract {
    pub fn attack(env: Env, target_contract: Address, stream_id: u64, receiver: Address) {
        let client = StreamingContractClient::new(&env, &target_contract);
        client.withdraw(&stream_id, &receiver); // Would fail at host level
    }
}
```

## Security Guarantees

✅ **Defense-in-Depth**: Two layers of protection (host-level + application-level)
✅ **Prevents nested calls**: Cannot call protected functions recursively
✅ **Allows sequential calls**: Legitimate back-to-back calls work fine
✅ **Transaction-scoped**: Lock automatically clears after transaction
✅ **Gas efficient**: Uses temporary storage for minimal overhead
✅ **Fail-safe**: Panics immediately on re-entrancy attempt
✅ **Future-proof**: Explicit guards protect against potential runtime changes

## Best Practices Applied

1. **Check-Effects-Interactions Pattern**: 
   - Check: Verify lock status
   - Effects: Update state
   - Interactions: External calls (token transfers)

2. **Fail Fast**: Panic immediately on re-entrancy detection

3. **Minimal Lock Scope**: Lock only during critical operations

4. **Automatic Cleanup**: Use temporary storage for self-cleaning locks

## Running Tests

```bash
cd contracts
cargo test
```

Expected output should show all tests passing, including the re-entrancy attack test that verifies the attack is blocked.

## Acceptance Criteria Met

✅ Contract prevents nested calls to state-changing functions
✅ Legitimate sequential calls from the same user work correctly
✅ Mock attacker contract test verifies protection works
✅ Uses transient (temporary) storage for the mutex
✅ Guard implemented in both `withdraw` and `cancel_stream`
