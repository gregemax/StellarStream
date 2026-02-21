#![no_std]

pub mod math;
mod test;
mod types;

use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env};
pub use types::{DataKey, Stream};

#[contract]
pub struct StellarStream;

#[contractimpl]
impl StellarStream {
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::IsPaused, &false);
    }

    pub fn set_pause(env: Env, admin: Address, paused: bool) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        if admin != stored_admin {
            panic!("Unauthorized: Only admin can pause");
        }
        env.storage().instance().set(&DataKey::IsPaused, &paused);
    }

    fn check_not_paused(env: &Env) {
        let is_paused: bool = env.storage().instance().get(&DataKey::IsPaused).unwrap_or(false);
        if is_paused {
            panic!("Contract is paused");
        }
    }

    pub fn create_stream(
        env: Env,
        sender: Address,
        receiver: Address,
        token: Address,
        amount: i128,
        start_time: u64,
        end_time: u64,
    ) -> u64 {
        Self::check_not_paused(&env);
        sender.require_auth();

        if end_time <= start_time {
            panic!("End time must be after start time");
        }
        if amount <= 0 {
            panic!("Amount must be greater than zero");
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        let mut stream_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::StreamId)
            .unwrap_or(0);
        stream_id += 1;
        env.storage().instance().set(&DataKey::StreamId, &stream_id);

        // 5. State Management: Populate the Stream struct
        let stream = Stream {
            sender: sender.clone(),
            receiver,
            token,
            amount,
            start_time,
            end_time,
            withdrawn_amount: 0, // Initialized at zero per the issue
        };

        // Save to Persistent storage so it doesn't expire quickly
        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        // 6. Events: Inform indexers/frontends of the new stream
        env.events()
            .publish((symbol_short!("create"), sender), stream_id);

        stream_id
    }

    pub fn withdraw(env: Env, stream_id: u64, receiver: Address) -> i128 {
        Self::check_not_paused(&env);
        receiver.require_auth();

        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .unwrap_or_else(|| panic!("Stream does not exist"));

        if receiver != stream.receiver {
            panic!("Unauthorized: You are not the receiver of this stream");
        }

        // 4. Time Calculation: Get current ledger time
        let now = env.ledger().timestamp();

        // 5. Math Logic: Calculate total unlocked amount based on time
        // We pass the stream details to our math module
        let total_unlocked =
            math::calculate_unlocked(stream.amount, stream.start_time, stream.end_time, now);

        // 6. Calculate Withdrawable: (Unlocked so far) - (Already withdrawn)
        let withdrawable_amount = total_unlocked - stream.withdrawn_amount;

        if withdrawable_amount <= 0 {
            panic!("No funds available to withdraw at this time");
        }

        // 7. Token Transfer: Move funds from contract to receiver
        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(
            &env.current_contract_address(),
            &receiver,
            &withdrawable_amount,
        );

        // 8. Update State: Increment the withdrawn_amount and save back to storage
        stream.withdrawn_amount += withdrawable_amount;
        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        // 9. Emit Event
        env.events().publish(
            (symbol_short!("withdraw"), receiver),
            (stream_id, withdrawable_amount),
        );

        withdrawable_amount
    }

    pub fn cancel_stream(env: Env, stream_id: u64) {
        Self::check_not_paused(&env);
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .unwrap_or_else(|| panic!("Stream does not exist"));

        stream.sender.require_auth();

        let now = env.ledger().timestamp();

        // 3. Validation: If the stream is already finished, there's nothing to cancel
        if now >= stream.end_time {
            panic!("Stream has already completed and cannot be cancelled");
        }

        // 4. Calculate Final Split
        // Total Unlocked is what the receiver is entitled to up to this second
        let total_unlocked =
            math::calculate_unlocked(stream.amount, stream.start_time, stream.end_time, now);

        // Receiver gets: (What they are owed now) - (What they already took)
        let withdrawable_to_receiver = total_unlocked - stream.withdrawn_amount;

        // Sender gets: (Original Total) - (Total Unlocked for receiver)
        let refund_to_sender = stream.amount - total_unlocked;

        let token_client = token::Client::new(&env, &stream.token);
        let contract_address = env.current_contract_address();

        // 5. Execute Payouts
        // Step 1: Pay the receiver their final piece of the pie
        if withdrawable_to_receiver > 0 {
            token_client.transfer(
                &contract_address,
                &stream.receiver,
                &withdrawable_to_receiver,
            );
        }

        // Step 2: Refund the remaining balance to the sender
        if refund_to_sender > 0 {
            token_client.transfer(&contract_address, &stream.sender, &refund_to_sender);
        }

        // 6. Cleanup: Remove from Persistent storage to save ledger space and prevent re-entry
        env.storage()
            .persistent()
            .remove(&DataKey::Stream(stream_id));

        // 7. Emit Event
        env.events()
            .publish((symbol_short!("cancel"), stream_id), stream.sender);
    }
}
