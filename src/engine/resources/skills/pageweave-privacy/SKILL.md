---
name: pageweave-privacy
description: PageWeave privacy posture (EU hosting, no cookies/trackers, analytics model, form data handling). Read when the user asks how PageWeave handles visitor data.
---

# PageWeave privacy facts

> Synced from https://pageweave.dev/docs/privacy.md on 2026-09-16 via npm run sync:docs.

---
title: "Documentation — PageWeave"
---

> For the full documentation index, see [PageWeave Documentation](https://pageweave.dev/docs) or fetch [llms.txt](https://pageweave.dev/llms.txt).

# Privacy & Data

Use these facts when writing privacy policies, terms, or answering data questions.

## Hosting

- Servers are hosted in Germany
- Hetzner Online GmbH (Industriestr. 25, 91710 Gunzenhausen, Germany; HRB 6089 Ansbach; VAT DE812871812)
- Hetzner data centers: Nuremberg, Falkenstein, or Helsinki (all EU)
- Hetzner is German-owned, no US parent

## Infrastructure

- Database: PostgreSQL
- Asset storage: Hetzner Object Storage (S3-compatible)

## Analytics

- Privacy-first, server-side only
- No cookies, no JavaScript trackers, no fingerprinting
- Visitor hash: SHA256(IP + UA + date)
- Geo location: MaxMind GeoLite2 (self-hosted database)
- Raw data retained: 90 days
- Aggregated daily stats kept longer

## Forms

- Submission data stored as JSONB in PostgreSQL
- File uploads stored privately in Hetzner Object Storage (private bucket) — downloadable only via unguessable capability URLs, purged with the submission
- Email notifications sent to site owner via SMTP
- Site owner is data controller; PageWeave is processor

## Cookies

- None on public sites
- No session, analytics, or tracking cookies on *.pageweave.site

## Third-Party Services

- Google Fonts: proxied through PageWeave (not loaded from Google)
- CDN privacy proxy (default on): references to allowlisted CDNs — jsDelivr, unpkg, cdnjs, jQuery CDN, BootstrapCDN, Font Awesome, Google hosted libraries — are rewritten at render time to `libs.pageweave.dev`. Visitor browsers never contact the CDN directly: no IPs or referrers leak; served from an EU disk cache with mirror failover. If proxy cache storage is briefly unavailable, visitors are 302-redirected to the upstream CDN (no-store) instead of the page failing.
- Cloudflare: DNS only (not proxied, not a CDN)

## SSL/TLS

- All traffic encrypted via HTTPS
- On-demand TLS for hostnames

## Data Retention

- Page view logs: 90 days
- Form submissions: until deleted by site owner
- Asset versions: until deleted

## Feature Page

- The public feature page covering the privacy stack: https://pageweave.dev/privacy-by-default
