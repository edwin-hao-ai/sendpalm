//! Real-data smoke test for the iTip RSVP path.
//!
//! Gated behind `SENDPALM_E2E_NETWORK=1`. Connects to the configured IMAP/SMTP
//! server (Feishu by default) and:
//!
//! 1. Builds a synthetic iTip REPLY using `build_itip_reply`.
//! 2. Sends it to the test account's own address via `send_itip_reply`.
//! 3. Asserts the constructed iCal body is well-formed and round-trips
//!    through `parse_vevent`.
//! 4. Asserts the SMTP server returned an accepted message-id (i.e. the
//!    relay didn't reject the message client-side).
//!
//! Note: the test deliberately does NOT poll IMAP for the self-sent
//! message. Feishu's SMTP→IMAP delivery for self-sent mail with
//! text/calendar parts has been observed to take 5+ minutes, and the
//! `smtp_roundtrip` integration test that does poll IMAP fails for the
//! same reason. Keeping this test focused on the client-side path
//! makes it reliable; the IMAP half is covered by manual smoke
//! testing and the parser end-to-end tests on real `.eml` fixtures.

use sendpalm_app_lib::services::ical::{build_itip_reply, parse_vevent, RsvpStatus};
use sendpalm_app_lib::services::parser::parse_email;
use sendpalm_app_lib::services::smtp::SmtpClient;
use sendpalm_app_lib::services::{load_test_credentials, EmailCredentials};

fn e2e_enabled() -> bool {
    std::env::var("SENDPALM_E2E_NETWORK").is_ok()
}

fn creds() -> Option<EmailCredentials> {
    let _ = dotenvy::dotenv();
    let _ = dotenvy::from_filename("../.env");
    let email = std::env::var("SENDPALM_TEST_EMAIL").ok()?;
    let pw = std::env::var("SENDPALM_TEST_PASSWORD").ok()?;
    let imap_host = std::env::var("SENDPALM_TEST_IMAP_HOST")
        .unwrap_or_else(|_| "imap.feishu.cn".to_string());
    let imap_port: u16 = std::env::var("SENDPALM_TEST_IMAP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(993);
    let smtp_host = std::env::var("SENDPALM_TEST_SMTP_HOST")
        .unwrap_or_else(|_| "smtp.feishu.cn".to_string());
    let smtp_port: u16 = std::env::var("SENDPALM_TEST_SMTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(465);
    Some(EmailCredentials {
        email,
        password: pw,
        imap_host,
        imap_port,
        smtp_host,
        smtp_port,
        smtp_implicit_tls: smtp_port == 465,
    })
}

/// Synthetic invite we reply to. The fields are deliberately minimal
/// to avoid touching the real mailbox.
fn sample_invite() -> sendpalm_app_lib::services::ical::IcalEvent {
    sendpalm_app_lib::services::ical::IcalEvent {
        uid: Some(format!(
            "sendpalm-itip-smoke-{}@sendpalm",
            chrono::Utc::now().format("%Y%m%d%H%M%S")
        )),
        summary: "iTip smoke test".to_string(),
        dtstart: Some("2027-03-15T10:00:00Z".to_string()),
        dtstart_tzid: None,
        dtend: Some("2027-03-15T11:00:00Z".to_string()),
        dtend_tzid: None,
        all_day: false,
        location: Some("Online".to_string()),
        description: None,
        method: Some("REQUEST".to_string()),
        organizer: Some("noreply@example.com".to_string()),
        attendees: vec![],
        sequence: Some(0),
    }
}

#[tokio::test]
async fn itip_reply_constructs_and_smtp_accepts() {
    if !e2e_enabled() {
        eprintln!("SENDPALM_E2E_NETWORK not set — skipping");
        return;
    }
    let Some(c) = creds() else {
        eprintln!("Test creds missing — set SENDPALM_TEST_* in .env");
        return;
    };
    let _ = load_test_credentials().expect("load_test_credentials");

    // 1. Build the iTip REPLY body — no network needed yet.
    let invite = sample_invite();
    let accepted =
        build_itip_reply(&invite, &c.email, RsvpStatus::Accepted).expect("accepted");
    let declined =
        build_itip_reply(&invite, &c.email, RsvpStatus::Declined).expect("declined");

    // 2. Sanity-check the iCal shape before touching the network.
    for (label, body) in [("ACCEPTED", &accepted), ("DECLINED", &declined)] {
        assert!(body.contains("METHOD:REPLY"), "{label}: missing METHOD:REPLY");
        assert!(
            body.contains(&format!("PARTSTAT={label}")),
            "{label}: missing PARTSTAT={label}"
        );
        assert!(
            body.contains(&format!("UID:{}", invite.uid.as_deref().unwrap())),
            "{label}: missing UID"
        );
        // The body must be a parseable iCal document.
        let parsed = parse_vevent(body).expect("parse_vevent");
        assert_eq!(parsed.method.as_deref(), Some("REPLY"));
        assert_eq!(parsed.uid, invite.uid);
    }

    // 3. The ics body should also embed cleanly inside an RFC822
    //    message parsed by the production parser. Build a synthetic
    //    multipart message and confirm parse_email picks up the
    //    calendar_invite field. This is the same end-to-end path the
    //    IMAP sync loop runs for real incoming mail.
    let rfc822 = format!(
        "From: <{sender}>\r\n\
To: <{sender}>\r\n\
Subject: RSVP test\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/mixed; boundary=BOUND\r\n\
\r\n\
--BOUND\r\n\
Content-Type: text/plain\r\n\
\r\n\
Reply body.\r\n\
--BOUND\r\n\
Content-Type: text/calendar; charset=utf-8; method=REPLY\r\n\
\r\n\
{accepted}\r\n\
--BOUND--\r\n",
        sender = c.email
    );
    let parsed = parse_email(rfc822.as_bytes()).expect("parse_email");
    let invite_seen = parsed
        .calendar_invite
        .as_ref()
        .expect("calendar_invite extracted from RFC822");
    assert_eq!(invite_seen.method.as_deref(), Some("REPLY"));
    assert_eq!(invite_seen.uid, invite.uid);
    assert_eq!(
        invite_seen.organizer.as_deref(),
        invite.organizer.as_deref()
    );

    // 4. SMTP send: confirm the relay accepts the message. We do NOT
    //    assert that the message later appears in IMAP because Feishu's
    //    SMTP→IMAP delivery for self-sent mail with text/calendar
    //    parts is unreliable in the test environment. That half is
    //    covered by the parser end-to-end test in `ical_invite_test.rs`
    //    which uses real `.eml` fixtures.
    let smtp = SmtpClient::new(c.clone());
    let subject = format!(
        "[sendpalm-itip-smoke] {}",
        chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
    );
    let message_id = smtp
        .send_itip_reply(&c.email, &c.email, &subject, &accepted, &c.email)
        .await
        .expect("send_itip_reply accepted");
    eprintln!("[itip-smoke] SMTP accepted message-id={message_id}");
    assert!(message_id.starts_with("<sendpalm-itip-"));
}
