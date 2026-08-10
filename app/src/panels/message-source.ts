/** Message source-mode formatter.
 *
 * Produces a raw, email-like text block for the Source view mode.
 */

import type { Message } from "../types";

export interface MessageSender {
  name: string;
  email: string;
  isMe?: boolean;
}

export function formatMessageSource(
  message: Message,
  sender: MessageSender,
): string {
  const lines: string[] = [];
  lines.push(`From: ${sender.name} <${sender.email}>`);
  if (message.to) lines.push(`To: ${message.to}`);
  if (message.cc && message.cc.length > 0)
    lines.push(`Cc: ${message.cc.join(", ")}`);
  lines.push(`Subject: ${message.subj || "(no subject)"}`);
  lines.push(`Date: ${message.st ?? ""}`);
  lines.push("");
  lines.push(message.body || message.prev || "(no body)");
  return lines.join("\n");
}

/** Build a plain-text preview limited to a single line. */
export function messagePreview(body: string, max = 110): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max)}…`;
}
