# OAuth Decision — v3 scope, v4+

> **Status:** v3 decision (2026-08-20)
> **TL;DR:** SendPalm v3 ships with **IMAP + app-password / authorization-code only**. **No OAuth.** This is a deliberate scope choice, not an oversight.

---

## 1. The question

HEY-style "log in with Google" / "log in with Microsoft" / "log in with Apple" is what modern users expect. The question is: do we ship OAuth flows (Gmail API, Microsoft Graph, iCloud delegation) in v3, or defer them?

## 2. The answer

**No OAuth in v3.** We ship IMAP + app-password / authorization-code for v3. OAuth is v4+.

## 3. Why

### 3.1 The 10-provider registry already covers the user-facing surface

`app/src-tauri/src/services/providers.rs` already has 10 providers with the right IMAP/SMTP host/port pre-filled, the right auth mode labelled, and the right "credentials hint" copy:

| Provider | Auth mode | What user enters |
|---|---|---|
| Gmail | `app-password` | App Password from myaccount.google.com/apppasswords |
| Outlook | `app-password` | App Password from account.microsoft.com |
| iCloud | `app-password` | App-specific password from appleid.apple.com |
| Yahoo | `app-password` | App Password from login.yahoo.com/account/security |
| Fastmail | `app-password` | App Password from fastmail.com/settings/security |
| 飞书 | `app-password` | App-specific password from Feishu admin |
| QQ | `password-with-auth-code` | Authorization code (not login password) from mail.qq.com → Settings → IMAP/SMTP |
| 网易 163 | `password-with-auth-code` | Authorization code from mail.163.com → Settings |
| 网易 126 | `password-with-auth-code` | Authorization code from mail.126.com → Settings |
| (custom IMAP) | manual | User fills in host/port + credentials |

**The 4 highest-volume users (Gmail / Outlook / iCloud / Fastmail) are covered by app-password.** QQ / 网易 cover the China market. 飞书 is the dev / SME segment.

**Net coverage: ≥ 90% of personal email users** can sign in without OAuth.

### 3.2 OAuth is a multi-month build, not a multi-week build

| Provider | What's involved |
|---|---|
| **Gmail** | Google Cloud project; OAuth consent screen (verification takes 4-6 weeks for a non-public app); Gmail API enablement; refresh-token storage; per-user rate limits; BigQuery-style telemetry; Play Store / Chrome Web Store compliance if distributed |
| **Outlook** | Azure AD app registration; multi-tenant vs single-tenant decision; Graph API permission scopes (Mail.Read / Mail.Send); admin consent flow; "this app is not verified" interstitial |
| **iCloud** | Apple Developer Program ($99/yr); CalDAV/CardDAV/IMAP delegation via app-specific password (iCloud has no public OAuth; you use the same app-specific password we already support) |
| **Yahoo** | Yahoo OAuth provider (3-legged); user authorization flow; refresh tokens |
| **Feishu / Lark** | Feishu open platform app; corp admin approval for tenant-visible apps; can take weeks |
| **QQ / 163** | Tencent / NetEase have NO public OAuth APIs for personal email; you **must** use authorization code |

**Just Gmail + Outlook alone is ~3 person-months of build + verification + compliance.** Adding the rest is another quarter.

### 3.3 App-password gives us ≥ 90% of the UX win

Modern email clients have taught users to generate app passwords. Apple Mail and Thunderbird don't OAuth-popup for Gmail; they ask for the app password. Spark (when it was alive) used OAuth for Gmail but the rest of the market (MailMate, Postbox, eM Client) doesn't.

The "log in with Google" button is a UX nicety, not a correctness requirement. The 5-minute one-time setup of an app password is a tax users have paid for 15 years.

### 3.4 OAuth has a privacy cost we'd rather not pay

OAuth-based Gmail clients need:
- A Google Cloud project with SendPalm as the OAuth client
- Google sees every SendPalm user's grant
- Tokens stored in our backend (or, for local-first, in OS Keychain — which we do)
- A privacy policy and terms of service
- A data-handling agreement with Google

**For a local-first product, the OAuth-required "register an app at Google" defeats the privacy premise.** App-password is a normal IMAP credential the user controls.

## 4. What v3 ships instead

- ✅ IMAP + SMTP via `async-imap` + `lettre`
- ✅ 10-provider registry with correct auth-mode labels
- ✅ App-password + authorization-code support
- ✅ Per-provider "credentials hint" copy that walks the user through the right URL
- ✅ Credentials in OS Keychain via `keyring` crate; never in SQLite
- ✅ Per-account test connection before save (uses `list_mailboxes` to verify creds work)

## 5. When we'd revisit

| Trigger | Build OAuth for |
|---|---|
| > 1,000 active users complain about app-password friction | Gmail + Outlook |
| Enterprise pilot signs (and demands SSO) | Microsoft Graph (OAuth only) |
| We want to be on Mac App Store with deep Gmail integration | Gmail |
| We pivot to a hosted / server model | All major providers |

The cost of saying "no OAuth in v3" is real but bounded: it's a few users who refuse to generate an app password. The cost of saying "yes OAuth in v3" is 3-6 months of OAuth-build, Google Cloud project compliance, Azure AD setup, and ongoing privacy review — for the same end-user value.

## 6. v4+ roadmap (when it makes sense)

If we get to v4 and the user base asks:

1. **Gmail first** (biggest single market; Google Cloud project with confidential OAuth client, no verification)
2. **Outlook** (Azure AD multi-tenant; smaller market but high LTV)
3. **iCloud** (no public OAuth; iCloud delegates via app-password which we already support; nothing to build)
4. **Feishu** (open platform; corp admin approval per tenant)

We'd implement these as a parallel OAuth path in `services/oauth.rs`, storing refresh tokens in the same `keyring` vault, and routing Gmail API vs IMAP based on a per-account flag.

## 7. Honest scope non-goal

We are **not** building "log in with Google" in v3. The 10-provider IMAP registry covers the use case. If a user can't figure out app-password, the in-product `credentials_hint` field gives them the right URL. If they still can't, SendPalm isn't the right product for them right now.

This is a deliberate decision. It is a trade-off, not a missing feature.
