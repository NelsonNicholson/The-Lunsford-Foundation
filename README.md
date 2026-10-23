# The Lunsford Foundation — Giving Dashboard

Private giving dashboard for The Lunsford Foundation (Holt & Kaye Dawn Lunsford), hosted on GitHub Pages.

- **2026 Giving** (main page) — YTD giving vs. 2026 targets, remaining to give, available funds, divisions, commitments
- **Giving History** — 2020–YTD 2026 by category, top organizations, source accounts
- **Organizations** — searchable directory with drill-down to every gift
- **Funding Sources** — real estate sale proceeds and personal contributions
- **Create a 2027 Budget** — budget builder with PDF / Excel export

All giving data lives in `data.enc.json`, encrypted with AES-256-GCM (PBKDF2-SHA256 key derivation). It can only be read with the passphrase; no raw data is stored in this repository.
