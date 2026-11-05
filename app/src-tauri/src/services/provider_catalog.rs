//! Provider catalog — the single source of truth for BYOK model sources.
//!
//! Sources are the only thing we hard-code; models are always fetched
//! live (spec §"Workstream 1"). Order is the display order and the
//! disambiguation order for ambiguous key prefixes.
//!
//! Ported from the shipped iBridge design (`ProviderCatalog.swift`),
//! adapted to SendPalm's OpenAI-compatible `llm` client.

/// How the provider enumerates models and (for chat) which wire format
/// request/response bodies use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListFormat {
    /// OpenAI `/v1/models`: `{ "data": [ { "id", "owned_by" } ] }`.
    OpenAi,
    /// Anthropic `/v1/models`: `{ "data": [ { "id", "display_name", ... } ] }`.
    /// Chat goes through `/v1/messages` with `x-api-key` auth.
    Anthropic,
    /// OpenRouter `/api/v1/models`: richer entries with name/context/pricing.
    OpenRouter,
    /// Ollama `/api/tags`: `{ "models": [ { "name" } ] }`.
    Ollama,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderKind {
    /// One key, many vendors (OpenRouter, Vercel AI Gateway).
    Gateway,
    /// Your own account with one vendor.
    Direct,
    /// No key, nothing leaves the machine.
    Local,
}

#[derive(Debug, Clone, Copy)]
pub struct ProviderDescriptor {
    pub id: &'static str,
    pub name: &'static str,
    pub kind: ProviderKind,
    /// Key prefix used for paste-detection; `None` = not detectable / no key.
    pub key_prefix: Option<&'static str>,
    pub tagline: &'static str,
    pub default_base_url: &'static str,
    pub list_path: &'static str,
    pub list_format: ListFormat,
}

/// Namespace for catalog lookups (never instantiated).
pub struct ProviderCatalog;

impl ProviderCatalog {
    pub fn builtin() -> &'static [ProviderDescriptor] {
        &CATALOG
    }

    pub fn descriptor_for_id(id: &str) -> Option<&'static ProviderDescriptor> {
        CATALOG.iter().find(|p| p.id == id)
    }

    /// Longest-prefix match against catalog key prefixes. Local providers
    /// (no prefix) never match. An ambiguous prefix (e.g. `sk-` for both
    /// OpenAI and DeepSeek) returns the catalog-ordered candidates — the
    /// UI asks the user to pick, it never silently chooses.
    pub fn detect_by_prefix(key: &str) -> PrefixMatch {
        let key = key.trim();
        if key.is_empty() {
            return PrefixMatch::None;
        }
        let mut matches: Vec<&'static ProviderDescriptor> = CATALOG
            .iter()
            .filter(|p| p.key_prefix.is_some_and(|pre| key.starts_with(pre)))
            .collect();
        // Only the longest matching prefixes count: `sk-or-…` also starts
        // with `sk-`, but the user clearly pasted an OpenRouter key.
        if matches.len() > 1 {
            let max_len = matches
                .iter()
                .map(|p| p.key_prefix.unwrap().len())
                .max()
                .unwrap_or(0);
            matches.retain(|p| p.key_prefix.unwrap().len() == max_len);
        }
        match matches.len() {
            0 => PrefixMatch::None,
            1 => PrefixMatch::Single(matches.pop().unwrap()),
            _ => {
                // Keep catalog order; longest prefix first for stability.
                matches.sort_by_key(|p| std::cmp::Reverse(p.key_prefix.unwrap().len()));
                PrefixMatch::Ambiguous(matches)
            }
        }
    }

    /// Which wire format chat/list calls should use for a base URL: match
    /// by host against the catalog, defaulting to OpenAI-compatible.
    pub fn wire_format_for_base_url(base_url: &str) -> ListFormat {
        let host = base_url_host(base_url);
        CATALOG
            .iter()
            .find(|p| base_url_host(p.default_base_url) == host)
            .map(|p| p.list_format)
            .unwrap_or(ListFormat::OpenAi)
    }
}

/// Result of matching a pasted key against the catalog prefixes.
pub enum PrefixMatch {
    Single(&'static ProviderDescriptor),
    Ambiguous(Vec<&'static ProviderDescriptor>),
    None,
}

fn base_url_host(url: &str) -> &str {
    let after_scheme = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .unwrap_or(url);
    after_scheme
        .split('/')
        .next()
        .unwrap_or(after_scheme)
        .split(':')
        .next()
        .unwrap_or(after_scheme)
}

static CATALOG: [ProviderDescriptor; 10] = [
    // Gateways: one key, many vendors, swap models by changing a string.
    ProviderDescriptor {
        id: "openrouter",
        name: "OpenRouter",
        kind: ProviderKind::Gateway,
        key_prefix: Some("sk-or-"),
        tagline: "一把 key，几百个模型",
        default_base_url: "https://openrouter.ai/api/v1",
        list_path: "/models",
        list_format: ListFormat::OpenRouter,
    },
    ProviderDescriptor {
        id: "vercel",
        name: "Vercel AI Gateway",
        kind: ProviderKind::Gateway,
        key_prefix: Some("vck_"),
        tagline: "一把 key，跨厂商路由",
        default_base_url: "https://ai-gateway.vercel.sh/v1",
        list_path: "/models",
        list_format: ListFormat::OpenAi,
    },
    // Direct vendors: your own account, that vendor's models.
    ProviderDescriptor {
        id: "openai",
        name: "OpenAI",
        kind: ProviderKind::Direct,
        key_prefix: Some("sk-"),
        tagline: "GPT 系列模型",
        default_base_url: "https://api.openai.com/v1",
        list_path: "/models",
        list_format: ListFormat::OpenAi,
    },
    ProviderDescriptor {
        id: "anthropic",
        name: "Anthropic",
        kind: ProviderKind::Direct,
        key_prefix: Some("sk-ant-"),
        tagline: "Claude 系列模型",
        default_base_url: "https://api.anthropic.com/v1",
        list_path: "/models",
        list_format: ListFormat::Anthropic,
    },
    ProviderDescriptor {
        id: "groq",
        name: "Groq",
        kind: ProviderKind::Direct,
        key_prefix: Some("gsk_"),
        tagline: "极快的开源模型",
        default_base_url: "https://api.groq.com/openai/v1",
        list_path: "/models",
        list_format: ListFormat::OpenAi,
    },
    ProviderDescriptor {
        id: "deepseek",
        name: "DeepSeek",
        kind: ProviderKind::Direct,
        key_prefix: Some("sk-"),
        tagline: "低成本模型",
        default_base_url: "https://api.deepseek.com/v1",
        list_path: "/models",
        list_format: ListFormat::OpenAi,
    },
    ProviderDescriptor {
        id: "xai",
        name: "xAI",
        kind: ProviderKind::Direct,
        key_prefix: Some("xai-"),
        tagline: "Grok 系列模型",
        default_base_url: "https://api.x.ai/v1",
        list_path: "/models",
        list_format: ListFormat::OpenAi,
    },
    ProviderDescriptor {
        id: "mistral",
        name: "Mistral",
        kind: ProviderKind::Direct,
        key_prefix: None,
        tagline: "Mistral 系列模型",
        default_base_url: "https://api.mistral.ai/v1",
        list_path: "/models",
        list_format: ListFormat::OpenAi,
    },
    // Local: no key, nothing leaves the machine.
    ProviderDescriptor {
        id: "ollama",
        name: "Ollama",
        kind: ProviderKind::Local,
        key_prefix: None,
        tagline: "这台机器上的模型",
        default_base_url: "http://127.0.0.1:11434",
        list_path: "/api/tags",
        list_format: ListFormat::Ollama,
    },
    ProviderDescriptor {
        id: "lmstudio",
        name: "LM Studio",
        kind: ProviderKind::Local,
        key_prefix: None,
        tagline: "本地 OpenAI 兼容服务",
        default_base_url: "http://127.0.0.1:1234/v1",
        list_path: "/models",
        list_format: ListFormat::OpenAi,
    },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_ten_providers_in_display_order() {
        let ids: Vec<&str> = ProviderCatalog::builtin().iter().map(|p| p.id).collect();
        assert_eq!(
            ids,
            vec![
                "openrouter", "vercel", "openai", "anthropic", "groq", "deepseek", "xai",
                "mistral", "ollama", "lmstudio",
            ]
        );
    }

    #[test]
    fn detects_vercel_gateway_key() {
        match ProviderCatalog::detect_by_prefix("vck_33HLabc") {
            PrefixMatch::Single(p) => assert_eq!(p.id, "vercel"),
            other => panic!("expected Single(vercel), got {:?}", other.is_single_id()),
        }
    }

    #[test]
    fn detects_openrouter_and_anthropic_and_groq_and_xai() {
        for (key, want) in [
            ("sk-or-v1-abc", "openrouter"),
            ("sk-ant-abc", "anthropic"),
            ("gsk_abc", "groq"),
            ("xai-abc", "xai"),
        ] {
            match ProviderCatalog::detect_by_prefix(key) {
                PrefixMatch::Single(p) => assert_eq!(p.id, want, "key {key}"),
                _ => panic!("expected Single for {key}"),
            }
        }
    }

    #[test]
    fn bare_sk_is_ambiguous_between_openai_and_deepseek() {
        match ProviderCatalog::detect_by_prefix("sk-abc123") {
            PrefixMatch::Ambiguous(ps) => {
                let ids: Vec<&str> = ps.iter().map(|p| p.id).collect();
                assert_eq!(ids, vec!["openai", "deepseek"]);
            }
            _ => panic!("expected Ambiguous for sk-"),
        }
    }

    #[test]
    fn unknown_or_empty_key_matches_nothing() {
        assert!(matches!(
            ProviderCatalog::detect_by_prefix("zzzz-abc"),
            PrefixMatch::None
        ));
        assert!(matches!(
            ProviderCatalog::detect_by_prefix(""),
            PrefixMatch::None
        ));
        assert!(matches!(
            ProviderCatalog::detect_by_prefix("   "),
            PrefixMatch::None
        ));
    }

    #[test]
    fn wire_format_matches_catalog_host() {
        assert_eq!(
            ProviderCatalog::wire_format_for_base_url("https://api.anthropic.com/v1"),
            ListFormat::Anthropic
        );
        assert_eq!(
            ProviderCatalog::wire_format_for_base_url("https://ai-gateway.vercel.sh/v1"),
            ListFormat::OpenAi
        );
        assert_eq!(
            ProviderCatalog::wire_format_for_base_url("http://127.0.0.1:11434"),
            ListFormat::Ollama
        );
        // Unknown host falls back to OpenAI-compatible.
        assert_eq!(
            ProviderCatalog::wire_format_for_base_url("http://192.168.1.9:8000/v1"),
            ListFormat::OpenAi
        );
    }

    impl PrefixMatch {
        fn is_single_id(&self) -> &'static str {
            match self {
                PrefixMatch::Single(p) => p.id,
                PrefixMatch::Ambiguous(_) => "<ambiguous>",
                PrefixMatch::None => "<none>",
            }
        }
    }
}
