use sendpalm_app_lib::services::imap::encode_utf7_imap;

#[test]
fn utf7_passes_through_ascii() {
    assert_eq!(encode_utf7_imap("INBOX"), "INBOX");
}

#[test]
fn utf7_encodes_non_ascii() {
    // Feishu's "已发送" decodes from &XfJT0ZAB-
    assert_eq!(encode_utf7_imap("已发送"), "&XfJT0ZAB-");
}
