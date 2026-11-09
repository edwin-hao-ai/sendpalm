//! HTML → plain text for mail bodies.
//!
//! A large share of real mail is HTML-only (ChatGPT, Stripe, any ESP): there
//! is no `text/plain` alternative at all. The parser used to fall back to the
//! **raw HTML source** in that case, so `messages.body` held
//! `<!DOCTYPE html>…<style>@font-face…` and every surface that shows a text
//! preview rendered markup at the user: list rows, the Screener card, the
//! Records card, search hints, the copy/download actions, and the plain-text
//! fallback under a loading iframe.
//!
//! This module is the single place that turns markup into readable text. It
//! is deliberately small and dependency-free: a full HTML parser would pull a
//! tree we do not need, and mail HTML is hostile enough that a forgiving
//! scanner is more predictable than a strict one.

/// Elements whose *contents* are not text for a reader. Dropped whole,
/// including their closing tag.
const DROP_BLOCKS: &[&str] = &["script", "style", "head", "title", "noscript"];

/// Elements that end a visual line. Their closing tag becomes "\n\n" so
/// paragraphs survive the strip.
const BLOCK_BREAKS: &[&str] = &[
    "p", "div", "tr", "table", "ul", "ol", "blockquote", "section", "article",
    "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "li", "pre",
];

/// Convert an HTML fragment or document into readable plain text.
///
/// Guarantees:
/// * no tags, comments, `<style>`/`<script>` bodies or attribute text survive;
/// * block boundaries become blank lines, `<br>` becomes a newline;
/// * the handful of entities mail actually uses are decoded;
/// * runs of whitespace/newlines are collapsed (no wall of blank lines);
/// * the result never starts or ends with whitespace.
pub fn html_to_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len() / 3);
    let bytes = html.as_bytes();
    let mut i = 0usize;

    while i < bytes.len() {
        // Only ASCII bytes drive the scan; multi-byte UTF-8 is copied by
        // slicing on char boundaries at the end of each text run.
        if bytes[i] != b'<' {
            let start = i;
            while i < bytes.len() && bytes[i] != b'<' {
                i += 1;
            }
            // `start..i` is a whole number of chars because '<' is ASCII and
            // can never appear inside a multi-byte sequence.
            decode_entities_into(&html[start..i], &mut out);
            continue;
        }

        // Comment.
        if html[i..].starts_with("<!--") {
            match html[i + 4..].find("-->") {
                Some(end) => {
                    i += 4 + end + 3;
                }
                None => break,
            }
            continue;
        }

        // Tag: name + attributes, up to '>'.
        let Some(tag_len) = html[i..].find('>') else {
            // Unterminated '<' — treat the rest as text.
            out.push_str(&html[i..]);
            break;
        };
        let raw_tag = &html[i + 1..i + tag_len];
        let closing = raw_tag.starts_with('/');
        let name: String = raw_tag
            .trim_start_matches('/')
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric())
            .collect::<String>()
            .to_ascii_lowercase();
        i += tag_len + 1;

        if DROP_BLOCKS.contains(&name.as_str()) {
            if !closing {
                // Skip to the matching close tag (nested blocks of the same
                // name do not occur in mail, and a missed close only costs
                // readability of a hidden block).
                let close = format!("</{name}");
                match html[i..].to_ascii_lowercase().find(&close) {
                    Some(off) => {
                        i += off;
                        // consume through '>'
                        if let Some(end) = html[i..].find('>') {
                            i += end + 1;
                        }
                    }
                    None => i = bytes.len(),
                }
            }
            continue;
        }

        if name == "br" {
            out.push('\n');
            continue;
        }

        if BLOCK_BREAKS.contains(&name.as_str()) {
            // Both open and close emit a break: `<p>a</p><p>b</p>` and
            // `<p>a<p>b` produce the same paragraphs.
            out.push_str("\n\n");
            continue;
        }

        // Every other tag (inline formatting, img, a, td, …) disappears; an
        // image with alt text contributes nothing — alt is usually
        // "spacer.gif" or a tracking pixel description.
    }

    collapse_blank_lines(&out)
}

/// Decode the entities that appear in real mail bodies.
fn decode_entities_into(text: &str, out: &mut String) {
    let mut rest = text;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let tail = &rest[pos..];
        let Some(semi) = tail.find(';') else {
            out.push_str(tail);
            return;
        };
        // Longest real entity is "&#x1F600;" — 10 chars; anything beyond that
        // is not an entity, it is a stray ampersand in prose.
        if semi > 12 {
            out.push('&');
            rest = &tail[1..];
            continue;
        }
        let entity = &tail[1..semi];
        match decode_entity(entity) {
            Some(decoded) => {
                out.push_str(&decoded);
                rest = &tail[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
}

fn decode_entity(entity: &str) -> Option<String> {
    let lower = entity.to_ascii_lowercase();
    let simple = match lower.as_str() {
        "nbsp" => " ",
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" => "'",
        "ndash" => "–",
        "mdash" => "—",
        "hellip" => "…",
        "rsquo" => "’",
        "lsquo" => "‘",
        "ldquo" => "“",
        "rdquo" => "”",
        "middot" => "·",
        "copy" => "©",
        "reg" => "®",
        "trade" => "™",
        _ => "",
    };
    if !simple.is_empty() {
        return Some(simple.to_string());
    }
    // Numeric: &#160; / &#xA0;
    let num = lower.strip_prefix('#')?;
    let code = if let Some(hex) = num.strip_prefix('x') {
        u32::from_str_radix(hex, 16).ok()?
    } else {
        num.parse::<u32>().ok()?
    };
    char::from_u32(code).map(|c| c.to_string())
}

/// Collapse runs of blank lines to at most one, trim each line's trailing
/// spaces (HTML indentation leaks into text otherwise), and trim the whole.
fn collapse_blank_lines(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank_run = 0u32;
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.trim().is_empty() {
            blank_run += 1;
            continue;
        }
        if !out.is_empty() {
            out.push('\n');
            if blank_run > 0 {
                out.push('\n');
            }
        }
        blank_run = 0;
        // Collapse runs of spaces: mail uses `&nbsp;&nbsp;` for indentation
        // and table padding, and those runs are noise in a text preview.
        let mut space_run = 0u32;
        for ch in trimmed.trim_start().chars() {
            if ch == ' ' || ch == '\t' {
                space_run += 1;
                continue;
            }
            if space_run > 0 {
                out.push(' ');
                space_run = 0;
            }
            out.push(ch);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::html_to_text;

    #[test]
    fn strips_document_chrome_and_css() {
        let html = "<!DOCTYPE html><html><head><title>Hi</title>\
            <style type=\"text/css\">@font-face { font-family: \"X\"; } .a{color:red}</style>\
            </head><body><p>Hello world</p></body></html>";
        assert_eq!(html_to_text(html), "Hello world");
    }

    #[test]
    fn keeps_paragraph_structure() {
        let html = "<p>First para</p><p>Second para</p>";
        assert_eq!(html_to_text(html), "First para\n\nSecond para");
    }

    #[test]
    fn br_is_a_single_newline() {
        assert_eq!(html_to_text("a<br>b<br/>c"), "a\nb\nc");
    }

    #[test]
    fn drops_scripts_and_comments() {
        let html = "before<!-- hidden --><script>alert('x')</script>after";
        assert_eq!(html_to_text(html), "beforeafter");
    }

    #[test]
    fn decodes_entities() {
        assert_eq!(
            html_to_text("Tom &amp; Jerry&nbsp;&nbsp;—&nbsp;5 &lt; 6 &#39;ok&#39;"),
            "Tom & Jerry — 5 < 6 'ok'"
        );
    }

    #[test]
    fn decodes_numeric_entities_for_cjk() {
        // What a Chinese newsletter body actually looks like before decoding.
        assert_eq!(
            html_to_text("&#38543;&#30528;&#12304;AD&#12305;"),
            "随着【AD】"
        );
    }

    #[test]
    fn a_stray_ampersand_survives() {
        assert_eq!(html_to_text("R&D and <b>Q&A</b>"), "R&D and Q&A");
    }

    #[test]
    fn collapses_blank_line_runs() {
        assert_eq!(html_to_text("<div>a</div><div></div><div></div><div>b</div>"), "a\n\nb");
    }

    #[test]
    fn markup_only_yields_empty_text() {
        assert_eq!(html_to_text("<style>.a{}</style><div><img src=x></div>"), "");
    }

    #[test]
    fn unterminated_tag_does_not_lose_the_tail() {
        // Truncated mail happens; the text after the broken tag still shows.
        assert_eq!(html_to_text("hello <b world"), "hello <b world");
    }

    #[test]
    fn plain_text_passes_through_untouched() {
        assert_eq!(html_to_text("just text\nsecond line"), "just text\nsecond line");
    }
}

/// Repair `messages.body` rows written before HTML-only mail was stripped.
///
/// Those rows hold the raw HTML source, so every text surface (list preview,
/// Screener card, Records card, search hint) renders markup at the user. The
/// repair is idempotent: after a rewrite the body no longer contains a closing
/// tag, so the row drops out of the scan.
///
/// Chunked on purpose — a real mailbox holds thousands of bodies and pulling
/// them all into memory is the 8 GB boot we already paid for once.
pub async fn backfill_markup_bodies(pool: &sqlx::SqlitePool) -> Result<u32, String> {
    const CHUNK: i64 = 100;
    let mut repaired = 0u32;
    let mut last_id = String::new();

    loop {
        let rows: Vec<(String, String)> = sqlx::query_as(
            // `</` catches raw markup; `&#` catches entity-encoded text that
            // has no tags at all (Chinese newsletters encode every CJK
            // character, so the body reads `&#38543;&#30528;…` in every
            // text surface *and* in the search index).
            "SELECT id, body FROM messages \
              WHERE (body LIKE '%</%' OR body LIKE '%&#%') \
                AND body_html IS NOT NULL AND body_html <> '' \
                AND id > $1 ORDER BY id LIMIT $2",
        )
        .bind(&last_id)
        .bind(CHUNK)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("backfill markup bodies: {e}"))?;

        if rows.is_empty() {
            break;
        }
        for (id, body) in rows {
            last_id = id.clone();
            let text = html_to_text(&body);
            sqlx::query("UPDATE messages SET body = $1 WHERE id = $2")
                .bind(&text)
                .bind(&id)
                .execute(pool)
                .await
                .map_err(|e| format!("backfill markup body {id}: {e}"))?;
            // The FTS row still holds the gibberish, so Chinese queries could
            // not match these messages. Rewrite the indexed body too.
            sqlx::query("DELETE FROM search_index WHERE id = $1")
                .bind(&id)
                .execute(pool)
                .await
                .ok();
            sqlx::query(
                "INSERT INTO search_index (id, kind, title, body) \
                 SELECT id, 'message', subj, $1 FROM messages WHERE id = $2",
            )
            .bind(&text)
            .bind(&id)
            .execute(pool)
            .await
            .ok();
            repaired += 1;
        }
    }
    Ok(repaired)
}
