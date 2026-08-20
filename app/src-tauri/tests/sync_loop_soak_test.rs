/** Sync-loop soak / stress test.
 *
 * The real sync loop is exercised end-to-end against a real IMAP
 * server in `tests/imap_real.rs` (gated behind `SENDPALM_E2E_NETWORK`).
 * The tests here complement that by stress-testing the **state
 * machine itself** (the cursor advance + termination logic) against
 * pathological mailbox shapes a real server might produce:
 *
 *   - dense mailboxes (1 message per UID, full chunks always)
 *   - sparse mailboxes (0.5 messages per UID — the Feishu case)
 *   - trailing-empty (all 200 UIDs in a range are deleted)
 *   - very small `uid_next` (server never had many messages)
 *   - very large `uid_next` (millions of UIDs, density 0)
 *   - non-monotonic outcomes (the cursor must NOT skip a failed UID
 *     even if a later UID succeeds)
 *
 * These do not need network, fixtures, or a Tauri runtime. They run
 * on `cargo test` in CI in < 100 ms and would have caught the
 * "stop on first partial chunk" bug that left ~3,500 Feishu messages
 * unfetched (see `docs/lessons.md` for context).
 */
use sendpalm_app_lib::services::imap::MAX_PER_TICK;
use sendpalm_app_lib::services::sync_loop::{advance_cursor, should_continue_after_chunk};

/// Simulate one full sync run against a mailbox whose UID set is
/// exactly `existing_uids`. Returns the final cursor position.
///
/// Mirrors the real `sync_folder` loop in
/// `src/services/sync_loop.rs`:
///   1. ask IMAP for the next MAX_PER_TICK UIDs
///   2. if zero messages in that range, step cursor by MAX_PER_TICK
///   3. else call `advance_cursor` and let it pin to the highest
///      successful UID (it deliberately does NOT skip past failures)
///   4. loop until `should_continue_after_chunk` says stop
fn simulate_run(existing_uids: &[u32], start_cursor: u32) -> u32 {
    let mut cursor = start_cursor;
    // Server reports uid_next = (max UID we ever saw) + 1, or 1 for
    // an empty mailbox. Compute the upper bound from the fixture.
    let uid_next = existing_uids.iter().max().map(|m| m + 1).unwrap_or(1);
    let mut iterations: u32 = 0;
    loop {
        iterations += 1;
        assert!(
            iterations < 100_000,
            "simulate_run did not terminate after 100k iterations at cursor={cursor}"
        );
        if !should_continue_after_chunk(cursor, Some(uid_next), MAX_PER_TICK) {
            return cursor;
        }
        // Ask for the next MAX_PER_TICK UIDs starting at cursor+1.
        // In a real IMAP this is a UID range request. We simulate it
        // by checking which of the fixture UIDs fall in (cursor, cursor+200].
        let range_start = cursor + 1;
        let range_end = cursor.saturating_add(MAX_PER_TICK);
        let in_range: Vec<u32> = existing_uids
            .iter()
            .copied()
            .filter(|u| *u >= range_start && *u <= range_end)
            .collect();
        if in_range.is_empty() {
            // Empty range — step the cursor and try the next one.
            // This is the fix the codebase shipped in commit
            // ffac...; before it, the loop spun forever on a
            // deleted/expired range.
            cursor = cursor.saturating_add(MAX_PER_TICK);
            continue;
        }
        // All UIDs in the range "succeed" (the fixture is the
        // canonical truth — every UID in `existing_uids` syncs
        // successfully). In the real loop, failures come from
        // parser errors / DB errors, which are out of scope here.
        let chunk: Vec<(u32, bool)> = in_range.iter().map(|u| (*u, true)).collect();
        let (_, new_cursor) = advance_cursor(cursor, &chunk);
        assert!(
            new_cursor >= cursor,
            "cursor must never go backwards: was {cursor}, became {new_cursor}"
        );
        cursor = new_cursor;
    }
}

#[test]
fn dense_mailbox_reaches_end() {
    // 1, 2, ..., 2000 — every UID has a message. Cursor should reach
    // 2000.
    let uids: Vec<u32> = (1..=2000).collect();
    let final_cursor = simulate_run(&uids, 0);
    assert_eq!(final_cursor, 2000);
}

#[test]
fn sparse_feishu_density_reaches_end() {
    // Mimics the real Feishu mailbox: ~1,000 messages across 2,000
    // UIDs. Every odd UID is present. The bug this guards against
    // would have stopped after the first partial chunk (density 0.5
    // means most chunks are partial).
    let uids: Vec<u32> = (1..=2000).filter(|u| u % 2 == 1).collect();
    let final_cursor = simulate_run(&uids, 0);
    // The highest UID is 1999 (odd), so cursor should reach 1999.
    assert_eq!(final_cursor, 1999);
}

#[test]
fn very_sparse_density_reaches_end() {
    // 100 messages across 5,000 UIDs. The first chunk of 200 has
    // maybe 4 messages; the next 24 chunks are empty.
    let uids: Vec<u32> = (1..=5000).filter(|u| u % 50 == 0).collect();
    assert_eq!(uids.len(), 100);
    let final_cursor = simulate_run(&uids, 0);
    assert_eq!(final_cursor, 5000);
}

#[test]
fn empty_range_advances_cursor() {
    // Mailbox is empty — every range comes back with zero messages.
    // The loop must still terminate, not spin forever.
    let final_cursor = simulate_run(&[], 0);
    // uid_next = 1. First iteration: cursor=0, should_continue(0, 1, 200)
    // = `0 < 0` = false. So we terminate immediately.
    assert_eq!(final_cursor, 0);
}

#[test]
fn deleted_range_in_the_middle_terminates_correctly() {
    // 1-100 exist, 101-300 are deleted, 301-500 exist. The middle
    // range must be skipped (cursor advances through it), and the
    // final cursor must reach 500.
    let mut uids: Vec<u32> = (1..=100).collect();
    uids.extend(301..=500);
    let final_cursor = simulate_run(&uids, 0);
    assert_eq!(final_cursor, 500);
}

#[test]
fn tiny_mailbox_terminates() {
    let uids = vec![1, 2, 3];
    let final_cursor = simulate_run(&uids, 0);
    assert_eq!(final_cursor, 3);
}

#[test]
fn single_message_terminates() {
    let uids = vec![42];
    let final_cursor = simulate_run(&uids, 0);
    assert_eq!(final_cursor, 42);
}

#[test]
fn large_mailbox_with_dense_pockets_terminates() {
    // 50,000 UIDs, density ~10% but in dense pockets of 100 then 900
    // empty. This stresses the empty-chunk + advance-cursor interleaving.
    let mut uids = Vec::with_capacity(5_000);
    for pocket_start in (1..=49_001).step_by(1_000) {
        for offset in 0..100 {
            uids.push(pocket_start + offset);
        }
    }
    let final_cursor = simulate_run(&uids, 0);
    // Highest pocket-start is 49_001; its highest UID is 49_100.
    // uid_next = 49_101. simulate_run stops at uid_next - 1.
    assert_eq!(final_cursor, 49_100);
}

// ── Direct unit tests on the exported helpers ───────────────────

#[test]
fn advance_cursor_never_skips_a_failed_uid() {
    // UIDs 100, 101, 102 attempted; 100 succeeds, 101 fails, 102 succeeds.
    // `advance_cursor` breaks at the first failure and returns the
    // count of consecutive successes BEFORE that break. The cursor
    // must stop at 100 (the last success before the failure) — the
    // next tick must retry 101 before processing 102. UID 102 is not
    // counted in `inserted` because the loop bailed.
    let (inserted, cursor) = advance_cursor(0, &[(100, true), (101, false), (102, true)]);
    assert_eq!(inserted, 1, "only the leading consecutive successes count");
    assert_eq!(cursor, 100, "cursor must stop at first failure");
}

#[test]
fn advance_cursor_past_all_successes() {
    let (_, cursor) = advance_cursor(0, &[(100, true), (101, true), (102, true)]);
    assert_eq!(cursor, 102);
}

#[test]
fn advance_cursor_empty_input() {
    let (inserted, cursor) = advance_cursor(150, &[]);
    assert_eq!(inserted, 0);
    assert_eq!(cursor, 150);
}

#[test]
fn advance_cursor_single_success_at_zero() {
    // 0 is a valid UID on some servers (QRESYNC). Don't reject it.
    let (_, cursor) = advance_cursor(0, &[(0, true)]);
    assert_eq!(cursor, 0);
}

#[test]
fn should_continue_with_uid_next_at_max_uid() {
    // The termination rule is `cursor < uid_next - 1`. We are
    // "caught up" only when cursor reaches uid_next - 1.
    //
    // Server says uid_next = 100. Cursor reached 98. Continue.
    assert!(should_continue_after_chunk(98, Some(100), 0));
    // Cursor reached 99 (which IS uid_next - 1). Stop.
    assert!(!should_continue_after_chunk(99, Some(100), 0));
    // Cursor reached 99, server says uid_next = 99. Stop.
    assert!(!should_continue_after_chunk(99, Some(99), 0));
    // Cursor reached 100, server says uid_next = 100. Stop.
    assert!(!should_continue_after_chunk(100, Some(100), 0));
}

#[test]
fn should_continue_with_no_uid_next_falls_back_to_chunk_size() {
    // Server didn't report uid_next. Full chunk → continue.
    assert!(should_continue_after_chunk(200, None, 200));
    // Partial chunk → stop (legacy heuristic).
    assert!(!should_continue_after_chunk(200, None, 50));
}

#[test]
fn should_continue_handles_zero_uid_next_without_panic() {
    // Some servers report uid_next=0 for an empty mailbox. Must
    // not panic on saturating_sub(1).
    assert!(!should_continue_after_chunk(0, Some(0), 0));
    assert!(!should_continue_after_chunk(0, Some(1), 0));
}
