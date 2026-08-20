# SendPalm Privacy Policy

> **Status:** v3 (2026-08-20)
> **TL;DR:** SendPalm does not collect, transmit, store, or have any way to access your mail, your contacts, your IMAP password, or your usage data. The app is local-first by architecture, not just by promise.

## 1. What SendPalm is

SendPalm is a desktop and mobile email client. It runs on your computer or phone. It connects to your existing email account (Gmail, Outlook, iCloud, etc.) using the standard IMAP and SMTP protocols.

SendPalm is published by an individual developer, not a company. There is no SendPalm server. There is no SendPalm cloud. There is no SendPalm analytics service. There is no SendPalm team that can read your data.

## 2. What data lives on your device

| What | Where | Why |
|---|---|---|
| Your mail (sender, recipient, subject, body, attachments) | A single SQLite file at the path the OS sandbox assigns to the app | So you can search, sort, and read it offline |
| Your IMAP / SMTP password | The macOS Keychain (or iOS Keychain on iPhone) | So you don't have to enter it every time |
| Your local preferences (notification settings, theme, per-sender image policy) | `sendpalm.prefs.json` via `tauri-plugin-store`, inside the OS sandbox | So your settings persist across restarts |
| Your sticky notes, follow-ups, snippets, clips | Same SQLite file as your mail | So they appear next to the relevant thread |

**None of this data is sent to any SendPalm-controlled server.** There is no SendPalm server to send it to. The only network the app talks to is your email provider's IMAP and SMTP servers, which are configured by you.

## 3. What data your email provider sees

SendPalm is a normal IMAP / SMTP client. Your email provider sees:

- Your IMAP connection from your IP address, on standard port 993.
- IMAP commands to fetch message headers, body, and attachments.
- SMTP commands to send mail you compose in the app.
- Standard OAuth tokens if you choose a provider that uses them (SendPalm v3 does not ship OAuth; see [OAUTH-DECISION.md](./OAUTH-DECISION.md) for why).

This is the same data any email client (Apple Mail, Thunderbird, Outlook, Spark) sends. The provider's privacy policy applies to that traffic. SendPalm does not proxy it, does not store it, does not analyse it.

## 4. Crash reporting

SendPalm v3 does not include crash reporting. If the app crashes, the only artifact is a local log file in the OS temp directory (`/tmp/sendpalm-panic.log` on macOS, the equivalent on iOS). The log contains a stack trace. It is not automatically sent anywhere. It is your job to copy it into a GitHub issue if you want a bug investigated.

If we add crash reporting in a future version, this policy will be updated, and the app will prompt for explicit opt-in. There will be no silent telemetry.

## 5. Analytics

SendPalm v3 includes no analytics. No Google Analytics, no Sentry, no Mixpanel, no Plausible, no nothing. The app makes no third-party HTTP requests except the IMAP and SMTP traffic you initiate.

## 6. Updates

When SendPalm updates, the new bundle is downloaded from the source you chose (Mac App Store, direct download, or `git pull`). The update mechanism is the standard OS update mechanism, not a SendPalm-controlled channel.

## 7. Children

SendPalm is not directed at children under 13 and we do not knowingly collect any data from children. Since we do not collect any data from anyone, this section is mostly moot, but the policy is stated for compliance.

## 8. Your rights

Because we do not collect any data, there is nothing to access, export, or delete from us. To remove SendPalm's data from your device, uninstall the app. To remove the IMAP password from the OS Keychain, open Keychain Access on macOS (or Settings → Passwords on iOS) and delete the entry for the relevant account.

To back up your mail, copy the SQLite file. To migrate to a new machine, copy the SQLite file plus re-enter the IMAP password.

## 9. Changes to this policy

If we change this policy in a way that affects what data is collected or transmitted, the change will be announced in the app's release notes and on the project repository. Bumps that do not affect data handling (typo fixes, clarifications) will be made without announcement.

## 10. Contact

For privacy questions, open an issue on the project repository. The maintainer's response time is on a best-effort basis. There is no support team, no ticket system, no SLA.

## 11. Jurisdiction

This policy is governed by the laws of the jurisdiction in which the maintainer resides. SendPalm makes no representation about compliance with specific regulations (GDPR, CCPA, HIPAA, etc.) because SendPalm does not process personal data on anyone else's behalf. If you are using SendPalm to process personal data of EU residents, your data controller relationship is between you and your email provider, not between you and SendPalm.

---

*Last updated: 2026-08-20.*
*This policy is part of the SendPalm project. The canonical version lives in the project repository.*
