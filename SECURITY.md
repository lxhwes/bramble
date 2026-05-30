# Security Policy

## Reporting a vulnerability

Report security issues privately by opening a [GitHub security advisory](https://github.com/lxhwes/bramble/security/advisories/new), or email the maintainer at `4140142+lxhwes@users.noreply.github.com`.

Please do not open a public issue for a security report. There is no bug bounty.

## Threat model

Bramble is personal-tool-grade software with a deliberately small attack surface:

- **No accounts, no authentication.** Sessions are identified by a UUID in the URL; partners by a slug in the `?p=` query parameter. Anyone with a session URL can read and write that session's votes. This is intended — the access pattern is two people who already share a relationship.
- **No PII is collected.** No names, emails, or accounts. There is no personal data to leak, and no privacy policy is required.
- **Write surface is rate-limited.** Vote append and session create are limited per IP (Cloudflare WAF on the hosted instance; an in-process limiter on the self-host Node target).
- **Data retention is bounded.** Sessions inactive for 90 days (configurable on self-host) are pruned.

The most sensitive operation is unbounded vote spam against a known session URL; rate limiting is the mitigation. Report anything that lets one session read or corrupt another, bypass rate limits, or execute code.
