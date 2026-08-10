use sendpalm_app_lib::services::sync_loop::{sync_one_outcome, SyncOutcome};

#[tokio::test]
async fn per_folder_failure_does_not_abort_remaining_folders() {
    let outcome: SyncOutcome = sync_one_outcome(vec![
        ("INBOX", Ok(1)),
        ("Sent", Err("no such mailbox".to_string())),
    ])
    .await;
    assert_eq!(outcome.total_inserted, 1);
    assert_eq!(outcome.failed_folders, vec!["Sent".to_string()]);
}