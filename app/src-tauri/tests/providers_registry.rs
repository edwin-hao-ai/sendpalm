//! Provider registry unit tests — verifies all major providers parse correctly.

use sendpalm_app_lib::services::providers::{by_id, list};

#[test]
fn registry_has_expected_providers() {
    let providers = list();
    let ids: Vec<_> = providers.iter().map(|p| p.id.as_str()).collect();
    for expected in [
        "feishu",
        "gmail",
        "outlook",
        "icloud",
        "yahoo",
        "qq",
        "netease-163",
        "netease-126",
        "fastmail",
        "custom",
    ] {
        assert!(
            ids.contains(&expected),
            "missing provider {expected}; got {ids:?}"
        );
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

/// Every provider must carry IMAP/SMTP hosts so the sync loop can resolve
/// credentials from the keyring without the user re-entering hostnames.
#[test]
fn all_preset_providers_have_imap_and_smtp_hosts() {
    for p in list() {
        if p.id == "custom" {
            continue;
        }
        assert!(
            !p.imap_host.is_empty(),
            "provider {} missing imap_host",
            p.id
        );
        assert!(
            !p.smtp_host.is_empty(),
            "provider {} missing smtp_host",
            p.id
        );
    }
}

/// Known provider-specific invariants. These lock the user-visible experience:
/// wrong ports = connections fail; wrong auth mode = user can't log in.
#[test]
fn per_provider_invariants() {
    let cases: &[(&str, u16, u16, bool, &str)] = &[
        ("gmail", 993, 465, true, "app-password"),
        ("outlook", 993, 587, false, "app-password"),
        ("icloud", 993, 587, false, "app-password"),
        ("yahoo", 993, 465, true, "app-password"),
        ("qq", 993, 465, true, "password-with-auth-code"),
        ("netease-163", 993, 465, true, "password-with-auth-code"),
        ("netease-126", 993, 465, true, "password-with-auth-code"),
        ("feishu", 993, 465, true, "app-password"),
        ("fastmail", 993, 465, true, "app-password"),
    ];
    for (id, imap_port, smtp_port, implicit_tls, auth_mode) in cases {
        let p = by_id(id).unwrap_or_else(|| panic!("missing provider {id}"));
        assert_eq!(p.imap_port, *imap_port, "{id} imap_port changed");
        assert_eq!(p.smtp_port, *smtp_port, "{id} smtp_port changed");
        assert_eq!(
            p.smtp_implicit_tls, *implicit_tls,
            "{id} smtp_implicit_tls changed"
        );
        assert_eq!(p.auth_mode, *auth_mode, "{id} auth_mode changed");
    }
}

/// Custom provider should leave hosts/ports empty so the user fills them in.
#[test]
fn custom_provider_is_a_blank_template() {
    let p = by_id("custom").expect("custom provider registered");
    assert!(p.imap_host.is_empty());
    assert!(p.smtp_host.is_empty());
}
