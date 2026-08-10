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
fn cursor_advances_past_full_chunk() {
    let (inserted, cursor) = advance_cursor(0, &[(200, true), (201, true), (202, true)]);
    assert_eq!(inserted, 3);
    assert_eq!(cursor, 202);
}