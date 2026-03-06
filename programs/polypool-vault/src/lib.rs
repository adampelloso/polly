use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("JAswU7ZVvS72MBLdqM5koucR93ZKWu1BNRNNYDLYgrbN");

/// Maximum length for a contest_id string.
const MAX_CONTEST_ID_LEN: usize = 64;

#[program]
pub mod polypool_vault {
    use super::*;

    /// Creates a new contest with a PDA vault to hold USDC entries.
    pub fn initialize_contest(
        ctx: Context<InitializeContest>,
        contest_id: String,
        entry_fee: u64,
    ) -> Result<()> {
        require!(
            contest_id.len() <= MAX_CONTEST_ID_LEN,
            VaultError::ContestIdTooLong
        );

        let contest = &mut ctx.accounts.contest;
        contest.contest_id = contest_id;
        contest.authority = ctx.accounts.authority.key();
        contest.entry_fee = entry_fee;
        contest.entry_count = 0;
        contest.total_deposited = 0;
        contest.is_active = true;
        contest.vault_bump = ctx.bumps.vault;
        contest.bump = ctx.bumps.contest;

        Ok(())
    }

    /// User enters a contest by transferring USDC to the vault.
    pub fn enter_contest(ctx: Context<EnterContest>, contest_id: String) -> Result<()> {
        let contest = &mut ctx.accounts.contest;

        require!(contest.is_active, VaultError::ContestNotActive);

        // Transfer USDC from user to vault
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, contest.entry_fee)?;

        contest.entry_count = contest.entry_count.checked_add(1).unwrap();
        contest.total_deposited = contest
            .total_deposited
            .checked_add(contest.entry_fee)
            .unwrap();

        emit!(EntryEvent {
            contest_id,
            wallet: ctx.accounts.user.key(),
            amount: contest.entry_fee,
            entry_number: contest.entry_count,
        });

        Ok(())
    }

    /// Authority distributes payouts from the vault to winners.
    pub fn distribute_payouts<'a>(
        ctx: Context<'_, '_, 'a, 'a, DistributePayouts<'a>>,
        contest_id: String,
        payouts: Vec<Payout>,
    ) -> Result<()> {
        let contest = &mut ctx.accounts.contest;

        require!(
            contest.authority == ctx.accounts.authority.key(),
            VaultError::Unauthorized
        );
        require!(contest.is_active, VaultError::ContestNotActive);

        let total_payout: u64 = payouts.iter().map(|p| p.amount).sum();
        require!(
            total_payout <= ctx.accounts.vault.amount,
            VaultError::PayoutExceedsBalance
        );

        let contest_id_bytes = contest.contest_id.as_bytes();
        let vault_bump = contest.vault_bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", contest_id_bytes, &[vault_bump]]];

        // Transfer to each recipient
        for payout in &payouts {
            // Find the recipient token account from remaining_accounts
            let recipient_token_info = ctx
                .remaining_accounts
                .iter()
                .find(|a| {
                    // Deserialize to check the owner field matches the payout wallet
                    if let Ok(token_acc) =
                        TokenAccount::try_deserialize(&mut &a.try_borrow_data().unwrap()[..])
                    {
                        token_acc.owner == payout.wallet
                    } else {
                        false
                    }
                })
                .ok_or(VaultError::PayoutExceedsBalance)?;

            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: recipient_token_info.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(transfer_ctx, payout.amount)?;
        }

        contest.is_active = false;

        emit!(PayoutEvent {
            contest_id,
            total_distributed: total_payout,
            num_recipients: payouts.len() as u32,
        });

        Ok(())
    }

    /// Authority refunds entry fees to participants when a contest is cancelled.
    pub fn refund_contest<'a>(
        ctx: Context<'_, '_, 'a, 'a, RefundContest<'a>>,
        contest_id: String,
        wallets: Vec<Pubkey>,
    ) -> Result<()> {
        let contest = &mut ctx.accounts.contest;

        require!(
            contest.authority == ctx.accounts.authority.key(),
            VaultError::Unauthorized
        );
        require!(contest.is_active, VaultError::ContestNotActive);

        let total_refund = contest
            .entry_fee
            .checked_mul(wallets.len() as u64)
            .unwrap();
        require!(
            total_refund <= ctx.accounts.vault.amount,
            VaultError::PayoutExceedsBalance
        );

        let contest_id_bytes = contest.contest_id.as_bytes();
        let vault_bump = contest.vault_bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", contest_id_bytes, &[vault_bump]]];

        for wallet in &wallets {
            // Find the recipient token account from remaining_accounts
            let recipient_token_info = ctx
                .remaining_accounts
                .iter()
                .find(|a| {
                    if let Ok(token_acc) =
                        TokenAccount::try_deserialize(&mut &a.try_borrow_data().unwrap()[..])
                    {
                        token_acc.owner == *wallet
                    } else {
                        false
                    }
                })
                .ok_or(VaultError::PayoutExceedsBalance)?;

            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: recipient_token_info.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(transfer_ctx, contest.entry_fee)?;
        }

        contest.is_active = false;

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Account structures
// ---------------------------------------------------------------------------

#[account]
pub struct Contest {
    /// Unique identifier for the contest (max 64 chars).
    pub contest_id: String,
    /// The authority (admin) that created and controls this contest.
    pub authority: Pubkey,
    /// Entry fee in USDC (6-decimal lamports).
    pub entry_fee: u64,
    /// Number of entries received.
    pub entry_count: u32,
    /// Total USDC deposited into the vault.
    pub total_deposited: u64,
    /// Whether the contest is still accepting entries / active.
    pub is_active: bool,
    /// Bump seed for the vault PDA.
    pub vault_bump: u8,
    /// Bump seed for the contest PDA.
    pub bump: u8,
}

impl Contest {
    /// Discriminator (8) + string prefix (4) + max string (64) + pubkey (32) +
    /// u64 (8) + u32 (4) + u64 (8) + bool (1) + u8 (1) + u8 (1) = 131
    pub const MAX_SIZE: usize = 8 + 4 + MAX_CONTEST_ID_LEN + 32 + 8 + 4 + 8 + 1 + 1 + 1;
}

// ---------------------------------------------------------------------------
// Instruction account contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(contest_id: String, entry_fee: u64)]
pub struct InitializeContest<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Contest::MAX_SIZE,
        seeds = [b"contest", contest_id.as_bytes()],
        bump,
    )]
    pub contest: Account<'info, Contest>,

    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = vault,
        seeds = [b"vault", contest_id.as_bytes()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(contest_id: String)]
pub struct EnterContest<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"contest", contest_id.as_bytes()],
        bump = contest.bump,
    )]
    pub contest: Account<'info, Contest>,

    #[account(
        mut,
        seeds = [b"vault", contest_id.as_bytes()],
        bump = contest.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == vault.mint,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(contest_id: String)]
pub struct DistributePayouts<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"contest", contest_id.as_bytes()],
        bump = contest.bump,
        has_one = authority @ VaultError::Unauthorized,
    )]
    pub contest: Account<'info, Contest>,

    #[account(
        mut,
        seeds = [b"vault", contest_id.as_bytes()],
        bump = contest.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(contest_id: String)]
pub struct RefundContest<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"contest", contest_id.as_bytes()],
        bump = contest.bump,
        has_one = authority @ VaultError::Unauthorized,
    )]
    pub contest: Account<'info, Contest>,

    #[account(
        mut,
        seeds = [b"vault", contest_id.as_bytes()],
        bump = contest.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Payout {
    pub wallet: Pubkey,
    pub amount: u64,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct EntryEvent {
    pub contest_id: String,
    pub wallet: Pubkey,
    pub amount: u64,
    pub entry_number: u32,
}

#[event]
pub struct PayoutEvent {
    pub contest_id: String,
    pub total_distributed: u64,
    pub num_recipients: u32,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum VaultError {
    #[msg("Transfer amount does not match the contest entry fee")]
    InvalidEntryFee,

    #[msg("Contest is not active")]
    ContestNotActive,

    #[msg("Payout total exceeds vault balance")]
    PayoutExceedsBalance,

    #[msg("Caller is not the contest authority")]
    Unauthorized,

    #[msg("Contest ID exceeds maximum length of 64 characters")]
    ContestIdTooLong,
}
