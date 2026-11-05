//! User mail automation rules — explicit user instructions applied at
//! sync time. Rules beat Gate defaults: a user who wrote "发票 → Records"
//! means it. Matching is case-insensitive substring on from/subject/body
//! (body scan window capped to keep per-message cost flat).

use sqlx::SqlitePool;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailRule {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub match_field: String,
    pub match_pattern: String,
    pub action_bucket: Option<String>,
    pub action_label: Option<String>,
    #[serde(default)]
    pub priority: i64,
}

fn default_true() -> bool {
    true
}

impl MailRule {
    pub fn matches(&self, from_email: &str, from_name: &str, subject: &str, body_head: &str) -> bool {
        if !self.enabled || self.match_pattern.is_empty() {
            return false;
        }
        let needle = self.match_pattern.to_lowercase();
        let hay = match self.match_field.as_str() {
            "from" => format!("{from_email} {from_name}").to_lowercase(),
            "subject" => subject.to_lowercase(),
            _ => body_head.to_lowercase(),
        };
        hay.contains(&needle)
    }
}

/// Apply the first matching rule. Returns (bucket_override, label_to_add).
pub fn apply_rules(
    rules: &[MailRule],
    from_email: &str,
    from_name: &str,
    subject: &str,
    body: &str,
) -> (Option<String>, Option<String>) {
    let body_head = &body.chars().take(4000).collect::<String>();
    let mut ordered: Vec<&MailRule> = rules.iter().filter(|r| r.enabled).collect();
    ordered.sort_by_key(|r| std::cmp::Reverse(r.priority));
    for rule in ordered {
        if rule.matches(from_email, from_name, subject, body_head) {
            return (
                rule.action_bucket.clone(),
                rule.action_label.clone(),
            );
        }
    }
    (None, None)
}

pub async fn list_rules(pool: &SqlitePool) -> Result<Vec<MailRule>, String> {
    let rows = sqlx::query_as::<_, (String, String, i64, String, String, Option<String>, Option<String>, i64)>(
        "SELECT id, name, enabled, match_field, match_pattern, action_bucket, action_label, priority \
         FROM mail_rules ORDER BY priority DESC, created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list rules: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|(id, name, enabled, match_field, match_pattern, action_bucket, action_label, priority)| {
            MailRule {
                id,
                name,
                enabled: enabled == 1,
                match_field,
                match_pattern,
                action_bucket,
                action_label,
                priority,
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(field: &str, pattern: &str, bucket: Option<&str>, label: Option<&str>, priority: i64) -> MailRule {
        MailRule {
            id: format!("r{priority}"),
            name: String::new(),
            enabled: true,
            match_field: field.into(),
            match_pattern: pattern.into(),
            action_bucket: bucket.map(|s| s.into()),
            action_label: label.map(|s| s.into()),
            priority,
        }
    }

    #[test]
    fn matches_from_subject_body_case_insensitively() {
        let r = rule("from", "ALIPAY", Some("paperTrail"), None, 0);
        assert!(r.matches("noreply@alipay.com", "", "", ""));
        let r2 = rule("subject", "发票", Some("paperTrail"), None, 0);
        assert!(r2.matches("", "", "您的电子发票", ""));
        let r3 = rule("body", "order total", Some("paperTrail"), None, 0);
        assert!(r3.matches("", "", "", "…your Order Total is $42…"));

    }

    #[test]
    fn disabled_rules_never_match() {
        let mut r = rule("subject", "发票", Some("paperTrail"), None, 0);
        r.enabled = false;
        assert!(!r.matches("", "", "发票", ""));
    }

    #[test]
    fn higher_priority_wins_and_body_window_is_capped() {
        let low = rule("subject", "发票", Some("feed"), None, 1);
        let high = rule("subject", "发票", Some("paperTrail"), Some("lbl_fapiao"), 9);
        let (bucket, label) = apply_rules(&[low, high], "", "", "发票", "");
        assert_eq!(bucket.as_deref(), Some("paperTrail"));
        assert_eq!(label.as_deref(), Some("lbl_fapiao"));

        let far = rule("body", "sekrit", Some("trash"), None, 0);
        let body = "x".repeat(10_000) + "sekrit";
        let (bucket2, _) = apply_rules(&[far], "", "", "", &body);
        assert_eq!(bucket2, None, "match beyond the 4k scan window must not fire");
    }
}
