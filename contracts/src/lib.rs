#![no_std]

pub mod math;
mod test;
mod types;

use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env, Vec};
pub use types::{DataKey, Stream, StreamRequest};

const THRESHOLD: u32 = 518400; // ~30 days
const LIMIT: u32 = 1036800; // ~60 days

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
        let is_paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::IsPaused)
            .unwrap_or(false);
        if is_paused {
            panic!("Contract is paused");
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_stream(
        env: Env,
        sender: Address,
        receiver: Address,
        token: Address,
        amount: i128,
        start_time: u64,
        cliff_time: u64,
        end_time: u64,
    ) -> u64 {
        Self::check_not_paused(&env);
        sender.require_auth();

        if end_time <= start_time {
            panic!("End time must be after start time");
        }
        if cliff_time < start_time || cliff_time >= end_time {
            panic!("Cliff time must be between start and end time");
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
        env.storage().instance().extend_ttl(THRESHOLD, LIMIT);

        let stream = Stream {
            sender: sender.clone(),
            receiver,
            token,
            amount,
            start_time,
            cliff_time,
            end_time,
            withdrawn_amount: 0,
        };

        let stream_key = DataKey::Stream(stream_id);
        env.storage().persistent().set(&stream_key, &stream);
        env.storage()
            .persistent()
            .extend_ttl(&stream_key, THRESHOLD, LIMIT);

        env.events()
            .publish((symbol_short!("create"), sender), stream_id);

        stream_id
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_batch_streams(
        env: Env,
        sender: Address,
        token: Address,
        requests: Vec<StreamRequest>,
    ) -> Vec<u64> {
        sender.require_auth();

        let mut total_amount: i128 = 0;
        for request in requests.iter() {
            if request.end_time <= request.start_time {
                panic!("End time must be after start time");
            }
            if request.amount <= 0 {
                panic!("Amount must be greater than zero");
            }
            total_amount += request.amount;
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &total_amount);

        let mut stream_ids = Vec::new(&env);
        let mut stream_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::StreamId)
            .unwrap_or(0);

        for request in requests.iter() {
            stream_id += 1;

            let stream = Stream {
                sender: sender.clone(),
                receiver: request.receiver.clone(),
                token: token.clone(),
                amount: request.amount,
                start_time: request.start_time,
                cliff_time: request.cliff_time,
                end_time: request.end_time,
                withdrawn_amount: 0,
            };

            env.storage()
                .persistent()
                .set(&DataKey::Stream(stream_id), &stream);

            env.events()
                .publish((symbol_short!("create"), sender.clone()), stream_id);

            stream_ids.push_back(stream_id);
        }

        env.storage().instance().set(&DataKey::StreamId, &stream_id);

        stream_ids
    }

    pub fn withdraw(env: Env, stream_id: u64, receiver: Address) -> i128 {
        Self::check_not_paused(&env);
        receiver.require_auth();

        let stream_key = DataKey::Stream(stream_id);
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&stream_key)
            .expect("Stream does not exist");

        if receiver != stream.receiver {
            panic!("Unauthorized: You are not the receiver of this stream");
        }

        let now = env.ledger().timestamp();
        let total_unlocked = math::calculate_unlocked(
            stream.amount,
            stream.start_time,
            stream.cliff_time,
            stream.end_time,
            now,
        );

        let withdrawable_amount = total_unlocked - stream.withdrawn_amount;

        if withdrawable_amount <= 0 {
            panic!("No funds available to withdraw at this time");
        }

        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(
            &env.current_contract_address(),
            &receiver,
            &withdrawable_amount,
        );

        stream.withdrawn_amount += withdrawable_amount;
        env.storage().persistent().set(&stream_key, &stream);
        env.storage()
            .persistent()
            .extend_ttl(&stream_key, THRESHOLD, LIMIT);

        env.events().publish(
            (symbol_short!("withdraw"), receiver),
            (stream_id, withdrawable_amount),
        );

        withdrawable_amount
    }

    pub fn cancel_stream(env: Env, stream_id: u64) {
        Self::check_not_paused(&env);
        let stream_key = DataKey::Stream(stream_id);
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&stream_key)
            .expect("Stream does not exist");

        stream.sender.require_auth();

        let now = env.ledger().timestamp();

        if now >= stream.end_time {
            panic!("Stream has already completed and cannot be cancelled");
        }

        let total_unlocked = math::calculate_unlocked(
            stream.amount,
            stream.start_time,
            stream.cliff_time,
            stream.end_time,
            now,
        );

        let withdrawable_to_receiver = total_unlocked - stream.withdrawn_amount;
        let refund_to_sender = stream.amount - total_unlocked;

        let token_client = token::Client::new(&env, &stream.token);
        let contract_address = env.current_contract_address();

        if withdrawable_to_receiver > 0 {
            token_client.transfer(
                &contract_address,
                &stream.receiver,
                &withdrawable_to_receiver,
            );
        }

        if refund_to_sender > 0 {
            token_client.transfer(&contract_address, &stream.sender, &refund_to_sender);
        }

        env.storage().persistent().remove(&stream_key);

        env.events()
            .publish((symbol_short!("cancel"), stream_id), stream.sender);
    }

    pub fn transfer_receiver(env: Env, stream_id: u64, new_receiver: Address) {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .expect("Stream does not exist");

        stream.receiver.require_auth();

        stream.receiver = new_receiver.clone();
        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        env.events()
            .publish((symbol_short!("transfer"), stream_id), new_receiver);
    }

    pub fn extend_stream_ttl(env: Env, stream_id: u64) {
        let stream_key = DataKey::Stream(stream_id);
        env.storage()
            .persistent()
            .extend_ttl(&stream_key, THRESHOLD, LIMIT);
    }
}
