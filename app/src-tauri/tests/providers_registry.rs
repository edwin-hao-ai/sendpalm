//! Provider registry unit tests — verifies all major providers parse correctly.

use sendpalm_app_lib::services::providers::{by_id, list};

#[test]
fn registry_has_expected_providers() {
    let providers = list();
    let ids: Vec<_> = providers.iter().map(|p| p.id.as_str()).collect();
    for expected in [
        "feishu", "gmail", "outlook", "icloud", "yahoo", "qq", "netease-163", "netease-126", "fastmail", "custom",
    ] {
        assert!(ids.contains(&expected), "missing provider {expected}; got {ids:?}");
    }
}

#[test]
fn each_provider_has_required_fields() {
    let providers = list();
    for p in providers {
        assert!(!p.id.is_empty(), "provider has empty id");
        assert!(!p.label.is_empty(), "provider {} has empty label", p.id);
        assert!(p.imap_port > 0, "provider {} has invalid imap_port", p.id);
        assert!(p.smtp_port > 0, "provider {} has invalid smtp_port", p.id);
    }
}

#[test]
fn by_id_round_trips() {
    for id in ["gmail", "feishu", "icloud", "outlook", "qq", "netease-163"] {
        let p = by_id(id).expect(id);
        assert_eq!(p.id, id);
    }
}

#[test]
fn qq_and_163_use_auth_code_mode() {
    for id in ["qq", "netease-163", "netease-126"] {
        let p = by_id(id).expect(id);
        assert_eq!(
            p.auth_mode, "password-with-auth-code",
            "{id} should use auth-code mode"
        );
    }
}

#[test]
fn smtp_implicit_tls_when_port_is_465() {
    let providers = list();
    for p in providers {
        if p.smtp_port == 465 {
            assert!(
                p.smtp_implicit_tls,
                "provider {} uses port 465 but smtp_implicit_tls=false",
                p.id
            );
        }
    }
}

#[test]
fn outlook_uses_starttls_on_587() {
    let p = by_id("outlook").unwrap();
    assert_eq!(p.smtp_port, 587);
    assert!(!p.smtp_implicit_tls, "outlook uses STARTTLS on 587");
}