/** Tracker detector — finds tracking URLs / pixels in message body.
 * Spec: prototype-v11 §3.22.
 */

const TRACKER_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "utm_", regex: /[?&](utm_[a-z]+)=/gi },
  { name: "tracking pixel", regex: /\/(track|pixel|open|click)\.(gif|png|jpg)/gi },
  { name: "mailchimp", regex: /list-manage[123]\.com/gi },
  { name: "sendgrid", regex: /(?:url\d+|sg-)\.sendgrid\.net/gi },
  { name: "mailgun", regex: /mailgun\.org\/v\d+/gi },
  { name: "hubspot", regex: /(?:hs-|hubspot).*?track/gi },
  { name: "mixpanel", regex: /api\.mixpanel\.com\/track/gi },
  { name: "segment.io", regex: /api\.segment\.io\/v1\/track/gi },
];

export interface Tracker {
  type: string;
  url: string;
}

export function detectTrackers(text: string): Tracker[] {
  if (!text) return [];
  const out: Tracker[] = [];
  for (const { name, regex } of TRACKER_PATTERNS) {
    const matches = text.match(regex);
    if (matches) {
      for (const m of matches) {
        out.push({ type: name, url: m });
      }
    }
  }
  return out;
}

export function trackerSummary(text: string): { count: number; types: string[] } {
  const trackers = detectTrackers(text);
  const types = [...new Set(trackers.map((t) => t.type))];
  return { count: trackers.length, types };
}