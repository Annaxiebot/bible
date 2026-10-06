# 安全 · Security policy

## 报告漏洞 · Reporting a vulnerability

Please report security problems privately. Do not open a public issue,
pull request or discussion for them.

1. **GitHub private vulnerability reporting (preferred):** on the
   repository page, open the **Security** tab and choose **Report a
   vulnerability**. Only the maintainers can see the report.
   (Maintainers: this button appears only after private vulnerability
   reporting is enabled under Settings > Code security.)
2. **The feedback page:** <https://scripturetolife.org/#/feedback>. Write
   "Security" at the start of the message and leave an email address so we
   can reply. Do not include working exploit details or other people's
   data there; we will reply with a private channel.

Please include what is affected, how to reproduce it, and what an attacker
could do with it. We aim to acknowledge a report within 7 days. Please give
us a reasonable time to fix the problem before you disclose it publicly.

## 范围 · Scope

In scope:

- The site <https://scripturetolife.org> and the code in this repository.
- The Supabase edge functions in `supabase/functions/` (`ai-proxy`,
  `send-checkins`, `feedback`) and the database rules in `database/`
  (row-level security policies, functions).
- Examples: reading or changing another leader's packs, sign-ups or
  settings; reading members' names, emails, phone numbers or shared
  check-in answers; using the AI proxy without signing in or beyond its
  quota; sending email through the check-in or feedback functions to
  addresses of your choosing; a secret exposed in the site or in this
  repository's history.

Out of scope:

- The Supabase anon (public) key in the site bundle. It is public by
  design; the data is protected by row-level security. A way around
  row-level security is in scope.
- Third-party services themselves (Supabase, OpenRouter, Resend, GitHub
  Pages, Google sign-in). Report those to their owners.
- Denial of service, spam volume, and automated scanner output without a
  demonstrated impact.
- Social engineering of the maintainers or of group members.

Please test only against your own accounts and data. Never access, change
or keep other people's data, and stop as soon as you have shown the
problem.
