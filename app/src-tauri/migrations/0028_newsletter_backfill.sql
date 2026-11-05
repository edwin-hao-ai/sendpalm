-- Backfill is_newsletter for mail synced before the flag existed (0026
-- defaulted everything to 0, making "只看订阅" filters useless on legacy
-- mail). Heuristic: newsletter senders almost always embed unsubscribe
-- machinery — the List-Unsubscribe header value, footer links, or 退订.
UPDATE messages SET is_newsletter = 1
WHERE is_newsletter = 0 AND (
  body LIKE '%list-unsubscribe%'
  OR body_html LIKE '%list-unsubscribe%'
  OR body LIKE '%unsubscribe%'
  OR body_html LIKE '%unsubscribe%'
  OR body LIKE '%退订%'
  OR body_html LIKE '%退订%'
);
