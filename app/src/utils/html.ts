/** HTML <-> plain text helpers used by Compose and message rendering. */

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convert a plain-text user input into a safe minimal HTML body.
 *  - escapes HTML entities
 *  - converts line breaks to <br>
 *  - auto-links http/https URLs
 */
export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withBreaks = escaped.replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
  const withLinks = withBreaks.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return withLinks;
}

export function sanitizeEmailHtml(html: string): string {
  return html
    // Strip <script>...</script> blocks (multi-line aware, case-insensitive)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    // Strip <meta http-equiv="refresh"> (redirect attack vector)
    .replace(/<meta\b[^>]*\bhttp-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
    // Strip <base> tags entirely (can hijack all relative URLs)
    .replace(/<base\b[^>]*>/gi, "")
    // Strip inline event handlers (onclick=, onload=, onerror=, etc.)
    // No leading-whitespace requirement → catches <svg/onload=...> bypass
    .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Neutralize javascript: URLs in href / src / action / formaction
    .replace(
      /(\s(?:href|src|action|formaction)\s*=\s*["']?)\s*javascript:[^"'>\s]*(["']?)/gi,
      "$1#$2",
    )
    // Add rel="noopener noreferrer" to <a target=_blank> (with or without quotes)
    .replace(
      /<a\b([^>]*?)\btarget\s*=\s*["']?_blank["']?([^>]*?)>/gi,
      (match, before, after) => {
        if (/\brel\s*=/i.test(match)) {
          return match.replace(
            /\brel\s*=\s*["']?([^"']*)["']?/i,
            (_r, rel) =>
              `rel="${rel.includes("noopener") ? rel : `${rel} noopener`.trim()} noreferrer"`,
          );
        }
        return `<a${before}target="_blank" rel="noopener noreferrer"${after}>`;
      },
    );
}
