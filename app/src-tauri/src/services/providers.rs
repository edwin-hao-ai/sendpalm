//! Email provider registry — IMAP + SMTP presets for major providers.
//! Used by the frontend's "Add account" flow.

use serde::{Deserialize, Serialize};

/// Internal template using `&'static str` for cheap table definitions.
#[derive(Debug, Clone, Copy)]
struct ProviderTemplate {
    id: &'static str,
    label: &'static str,
    icon: &'static str,
    credentials_hint: &'static str,
    imap_host: &'static str,
    imap_port: u16,
    smtp_host: &'static str,
    smtp_port: u16,
    auth_mode: &'static str,
    smtp_implicit_tls: bool,
}

const TEMPLATES: &[ProviderTemplate] = &[
    ProviderTemplate {
        id: "feishu",
        label: "飞书邮箱",
        icon: "feather",
        credentials_hint: "Feishu Mail · 用 app-specific password",
        imap_host: "imap.feishu.cn",
        imap_port: 993,
        smtp_host: "smtp.feishu.cn",
        smtp_port: 465,
        auth_mode: "app-password",
        smtp_implicit_tls: true,
    },
    ProviderTemplate {
        id: "gmail",
        label: "Gmail",
        icon: "google-logo",
        credentials_hint: "Gmail · 需在 Google 账号启用 IMAP 并用 app password",
        imap_host: "imap.gmail.com",
        imap_port: 993,
        smtp_host: "smtp.gmail.com",
        smtp_port: 465,
        auth_mode: "app-password",
        smtp_implicit_tls: true,
    },
    ProviderTemplate {
        id: "outlook",
        label: "Outlook / Microsoft 365",
        icon: "microsoft-outlook-logo",
        credentials_hint: "Outlook · 用 Microsoft account password 或 app password",
        imap_host: "outlook.office365.com",
        imap_port: 993,
        smtp_host: "smtp.office365.com",
        smtp_port: 587,
        auth_mode: "app-password",
        smtp_implicit_tls: false,
    },
    ProviderTemplate {
        id: "icloud",
        label: "iCloud",
        icon: "apple-logo",
        credentials_hint: "iCloud · 需在 appleid.apple.com 生成 app-specific password",
        imap_host: "imap.mail.me.com",
        imap_port: 993,
        smtp_host: "smtp.mail.me.com",
        smtp_port: 587,
        auth_mode: "app-password",
        smtp_implicit_tls: false,
    },
    ProviderTemplate {
        id: "yahoo",
        label: "Yahoo Mail",
        icon: "yahoo-logo",
        credentials_hint: "Yahoo · 用 account password 或 app password",
        imap_host: "imap.mail.yahoo.com",
        imap_port: 993,
        smtp_host: "smtp.mail.yahoo.com",
        smtp_port: 465,
        auth_mode: "app-password",
        smtp_implicit_tls: true,
    },
    ProviderTemplate {
        id: "qq",
        label: "QQ 邮箱",
        icon: "chat-circle",
        credentials_hint:
            "QQ · 授权码 (不是 QQ 密码)；在网页版 QQ 邮箱设置 → 账户 → 开启 IMAP/SMTP",
        imap_host: "imap.qq.com",
        imap_port: 993,
        smtp_host: "smtp.qq.com",
        smtp_port: 465,
        auth_mode: "password-with-auth-code",
        smtp_implicit_tls: true,
    },
    ProviderTemplate {
        id: "netease-163",
        label: "网易 163 邮箱",
        icon: "envelope-simple",
        credentials_hint: "163 · 授权码；在 mail.163.com 设置 → POP3/SMTP/IMAP 开启",
        imap_host: "imap.163.com",
        imap_port: 993,
        smtp_host: "smtp.163.com",
        smtp_port: 465,
        auth_mode: "password-with-auth-code",
        smtp_implicit_tls: true,
    },
    ProviderTemplate {
        id: "netease-126",
        label: "网易 126 邮箱",
        icon: "envelope-simple",
        credentials_hint: "126 · 授权码",
        imap_host: "imap.126.com",
        imap_port: 993,
        smtp_host: "smtp.126.com",
        smtp_port: 465,
        auth_mode: "password-with-auth-code",
        smtp_implicit_tls: true,
    },
    ProviderTemplate {
        id: "fastmail",
        label: "Fastmail",
        icon: "envelope-open",
        credentials_hint: "Fastmail · app password 在 settings → passwords",
        imap_host: "imap.fastmail.com",
        imap_port: 993,
        smtp_host: "smtp.fastmail.com",
        smtp_port: 465,
        auth_mode: "app-password",
        smtp_implicit_tls: true,
    },
    ProviderTemplate {
        id: "custom",
        label: "自定义 IMAP/SMTP",
        icon: "wrench",
        credentials_hint: "填入任意 IMAP/SMTP host:port",
        imap_host: "",
        imap_port: 993,
        smtp_host: "",
        smtp_port: 465,
        auth_mode: "app-password",
        smtp_implicit_tls: true,
    },
];

/// Public IPC shape — owned strings so the consumer doesn't depend on
/// our static lifetimes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailProvider {
    pub id: String,
    pub label: String,
    pub icon: String,
    pub credentials_hint: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub auth_mode: &'static str,
    pub smtp_implicit_tls: bool,
}

impl From<ProviderTemplate> for EmailProvider {
    fn from(t: ProviderTemplate) -> Self {
        Self {
            id: t.id.to_string(),
            label: t.label.to_string(),
            icon: t.icon.to_string(),
            credentials_hint: t.credentials_hint.to_string(),
            imap_host: t.imap_host.to_string(),
            imap_port: t.imap_port,
            smtp_host: t.smtp_host.to_string(),
            smtp_port: t.smtp_port,
            auth_mode: t.auth_mode,
            smtp_implicit_tls: t.smtp_implicit_tls,
        }
    }
}

pub fn list() -> Vec<EmailProvider> {
    TEMPLATES.iter().map(|t| EmailProvider::from(*t)).collect()
}

pub fn by_id(id: &str) -> Option<EmailProvider> {
    TEMPLATES
        .iter()
        .find(|t| t.id == id)
        .map(|t| EmailProvider::from(*t))
}
