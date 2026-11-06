use sendpalm_app_lib::services::sync_loop::advance_cursor;

#[test]
fn cursor_does_not_advance_past_failed_uid() {
    // UIDs 100, 101, 102 attempted; only 100 succeeded.
    // Cursor must stay at 100 so the next tick retries 101+102.
    let (inserted, cursor) = advance_cursor(0, &[(100, true), (101, false), (102, false)]);
    assert_eq!(inserted, 1);
    assert_eq!(cursor, 100);
}

#[test]
fn cursor_stops_at_first_failure_even_if_later_uid_succeeds() {
    let (inserted, cursor) = advance_cursor(0, &[(100, true), (101, false), (102, true)]);
    assert_eq!((inserted, cursor), (1, 100));
}

#[test]
fn cursor_advances_past_full_chunk() {
    let (inserted, cursor) = advance_cursor(0, &[(200, true), (201, true), (202, true)]);
    assert_eq!(inserted, 3);
    assert_eq!(cursor, 202);
}
/* ── Cursor past the end of the mailbox ─────────────────────────────── */

use sendpalm_app_lib::services::sync_loop::recover_cursor_if_past_end;

#[test]
fn a_normal_cursor_is_left_alone() {
    // Caught up or mid-mailbox: nothing to recover.
    assert_eq!(recover_cursor_if_past_end(7000, Some(7724)), None);
    assert_eq!(recover_cursor_if_past_end(0, Some(7724)), None);
    // Servers without UIDNEXT keep the legacy walk.
    assert_eq!(recover_cursor_if_past_end(7000, None), None);
}

#[test]
fn a_cursor_at_the_end_is_left_alone() {
    // cursor == uid_next - 1 is exactly "caught up".
    assert_eq!(recover_cursor_if_past_end(7723, Some(7724)), None);
}

#[test]
fn a_cursor_past_the_end_rewinds_to_the_last_real_uid() {
    // The Feishu case: the mailbox was re-indexed under the same UIDVALIDITY,
    // so the stored cursor (201,683) sits past every message that will ever
    // exist (uid_next 7,724). Before this, sync reported success and imported
    // nothing — new mail silently stopped arriving.
    assert_eq!(recover_cursor_if_past_end(201_683, Some(7_724)), Some(7_723));
    assert_eq!(recover_cursor_if_past_end(7_724, Some(7_724)), Some(7_723));
}

#[test]
fn recovery_never_underflows_an_empty_mailbox() {
    // uid_next == 1 means an empty mailbox; -1 must clamp to 0, not wrap.
    assert_eq!(recover_cursor_if_past_end(500, Some(1)), Some(0));
    assert_eq!(recover_cursor_if_past_end(500, Some(0)), Some(0));
}
