---
name: pageweave-i18n
description: Multilingual sites: BCP 47 language tags, per-page/per-site language settings, placeholder_defaults URL collapsing. Read when the user asks for a multilingual or translated site.
---

# PageWeave i18n guide

> Synced from https://pageweave.dev/docs/i18n.md on 2026-09-16 via npm run sync:docs.

---
title: "Documentation — PageWeave"
---

> For the full documentation index, see [PageWeave Documentation](https://pageweave.dev/docs) or fetch [llms.txt](https://pageweave.dev/llms.txt).


# Internationalization (i18n)

PageWeave supports building websites in any number of languages. This guide covers the full stack: setting language at website and page level, configuring hreflang for search engines, building language switchers, adapting content for different locales, and avoiding common pitfalls.

## Concepts

- **Internationalization (i18n)** — the engineering work of preparing a site to handle multiple languages and regions. URL structure, `lang` attributes, hreflang tags, RTL support.
- **Localization (l10n)** — adapting the user experience to a specific market: copy, imagery, date formats, currency, legal disclaimers.
- **Translation** — converting text from one language to another. Word-level fidelity, no cultural reshaping.

PageWeave provides the i18n plumbing. You provide the content and translations.

## URL Strategy

**Use subdirectories.** This is the right choice for SEO — all versions live on one domain and share domain authority.

```
example.com/           → language selector or default locale
example.com/en/        → English
example.com/de/        → German
example.com/en-us/     → English (United States)
example.com/es-mx/     → Spanish (Mexico)
```

### Rules

- Always use **lowercase, hyphen-separated** locale codes in URLs: `/en-us/`, not `/en_US/` or `/en-US/`.
- Use **BCP 47 language tags** for `language` params and hreflang: `en-US`, `de-DE`, `pt-BR` (uppercase region codes).
- Page paths mirror the locale prefix: `/en/about`, `/de/ueber-uns`.
- Slugs should be **localized**: `/fr/a-propos` not `/fr/about`. Translated slugs improve click-through in the local language and signal genuine market commitment to search engines.

### Language-only vs Language + Region

| Pattern | Path | When to use |
|---|---|---|
| Language-only | `/fr/` | Content applies to all French speakers regardless of region |
| Language + Region | `/fr-ca/`, `/es-mx/` | Content varies by country (vocabulary, pricing, legal requirements, imagery) |
| Custom / Market-First | `/uk/`, `/quebec/` | Branded region paths for transcreated experiences |

### Root URL

Decide whether your root URL (`/`) holds actual content or acts as a language selector:

- **Content at root** — simplest. Your primary locale lives at `/`. Secondary locales use subdirectories (`/de/`, `/fr/`).
- **Language selector** — `/` is a gateway page listing available languages. All locales use subdirectories including the primary one (`/en/`, `/de/`, `/fr/`).

## Setting Language

### Website-Level Default

Set the default language when creating or updating a website. The platform uses this for the `<html lang>` attribute.

```
create_website(indexable: true, language: "de")
update_website(website: "my-site", language: "de")
```

The `language` field accepts BCP 47 tags: `en`, `de`, `fr`, `pt-BR`, `zh-Hans`, `es-MX`, etc.

### Page-Level Override

Override the language per page. This takes precedence over the website default for `<html lang>`.

```
create_page(website: "my-site", path: "/en/about", language: "en", html: "...")
update_page_settings(website: "my-site", path: "/about", language: "en")
```

## Building Language Pages

The fundamental approach: create parallel page trees, one per language.

### Step-by-Step (2-Language Site)

**Start with the primary locale:**

```
create_page(website: "my-site", path: "/", html: "<h1>Willkommen</h1>", title: "Startseite", language: "de")
create_page(website: "my-site", path: "/ueber-uns", html: "<h1>Über uns</h1>", title: "Über uns", language: "de")
create_page(website: "my-site", path: "/kontakt", html: "<h1>Kontakt</h1>", title: "Kontakt", language: "de")
```

**Add the secondary locale:**

```
create_page(website: "my-site", path: "/en/", html: "<h1>Welcome</h1>", title: "Home", language: "en")
create_page(website: "my-site", path: "/en/about", html: "<h1>About Us</h1>", title: "About Us", language: "en")
create_page(website: "my-site", path: "/en/contact", html: "<h1>Contact</h1>", title: "Contact", language: "en")
```

### Tool Reference

| Step | Tool |
|---|---|
| Create language page | `create_page` with `language` param |
| Update page translation | `update_page` (overwrite HTML) or `update_page` with `replacements` |
| Change page language | `update_page_settings(language: "...")` |
| Create locale-specific head | `update_page(additional_html_head_html: "...")` |
| Delete a language page | `delete_page` |

## Hreflang Implementation

Hreflang tags tell search engines which version of a page serves which language and region. Without them, Google may index the wrong locale for a user's query.

### The Core Rules

1. **Every page must reference itself.** The English page's hreflang set must include a self-referencing `hreflang="en"` tag.
2. **The relationship must be reciprocal.** If the English page declares a German alternate, the German page must declare the English page as its alternate. Asymmetric hreflang is ignored.
3. **Every page must list all variants.** Each locale page includes the same complete set of alternate links.
4. **Include `x-default`.** The fallback for users whose language doesn't match any variant. Point it at your primary locale or a language selector page.

### Method: HTML Tags (Recommended)

Place hreflang `<link>` elements in the `<head>` of every page. Use `update_component` with `component: "html_head"` for global tags that apply site-wide, or `additional_html_head_html` on `update_page` for page-specific tags.

**Global `html_head` approach** (same tags on every page — good for small, uniform sites):

```
update_component(website: "my-site", component: "html_head", html: '<link rel="alternate" hreflang="de" href="https://my-site.pageweave.site/">
<link rel="alternate" hreflang="en" href="https://my-site.pageweave.site/en/">
<link rel="alternate" hreflang="x-default" href="https://my-site.pageweave.site/">')
```

**Per-page approach** (preferred — each page's alternates point to the specific translated page, not the locale root):

```
# On the German /ueber-uns page:
update_page(website: "my-site", path: "/ueber-uns",
  additional_html_head_html: '<link rel="alternate" hreflang="de" href="https://my-site.pageweave.site/ueber-uns">
<link rel="alternate" hreflang="en" href="https://my-site.pageweave.site/en/about">
<link rel="alternate" hreflang="x-default" href="https://my-site.pageweave.site/ueber-uns">')

# On the English /en/about page:
update_page(website: "my-site", path: "/en/about",
  additional_html_head_html: '<link rel="alternate" hreflang="de" href="https://my-site.pageweave.site/ueber-uns">
<link rel="alternate" hreflang="en" href="https://my-site.pageweave.site/en/about">
<link rel="alternate" hreflang="x-default" href="https://my-site.pageweave.site/ueber-uns">')
```

Note the reciprocity: both pages contain the identical set of hreflang links. The `x-default` typically points to the primary locale.

### x-default Explained

`x-default` is NOT "the English version." It's the fallback page for users whose language doesn't match any variant.

**Point it to your most accessible language** (usually your primary):

```html
<link rel="alternate" hreflang="de" href="https://example.com/">
<link rel="alternate" hreflang="en" href="https://example.com/en/">
<link rel="alternate" hreflang="x-default" href="https://example.com/">
```

**Or point it to a language selector page:**

```html
<link rel="alternate" hreflang="de" href="https://example.com/de/">
<link rel="alternate" hreflang="en" href="https://example.com/en/">
<link rel="alternate" hreflang="x-default" href="https://example.com/">
```

The `x-default` URL must return 200 (not a redirect), must be indexable (not blocked by robots.txt), and must be a real page.

### Multi-Locale Complex Sites

For sites with many locale variants (5+), prefer `additional_html_head_html` on each page. This avoids bloating the global `html_head` with links that don't apply to every page.

Liquid can help generate hreflang tags dynamically if you use tables to store the language-to-path mapping. Place this Liquid directly in `additional_html_head_html` or global `html_head` (snippets are stored verbatim and `<link>` doesn't transclude content):

```liquid
{% assign languages = "de,en,fr" | split: "," %}
{% for lang in languages %}
  <link rel="alternate" hreflang="{{ lang }}" href="https://example.com/{{ lang }}/{{ page.path | split: "/" | last }}">
{% endfor %}
<link rel="alternate" hreflang="x-default" href="https://example.com/">
```

> **Caveat:** This example assumes identical slugs across locales (e.g., `/en/about` and `/de/about`). If you use localized slugs (e.g., `/de/ueber-uns`), you'll need a table mapping each page to its locale-specific paths.

## Language Switcher

Build a visible language selector so visitors can switch languages. Place it in the header or footer component.

### Basic Liquid-Driven Switcher

Use `site.language` and `page.language` to determine the current locale, and link to other versions. This example goes in `update_component(component: "header")`:

```liquid
<nav aria-label="Language switcher">
  <ul>
    {% assign current_lang = page.language | default: site.language %}
    <li>
      <a href="/" lang="de" hreflang="de"
         {% if current_lang == "de" %}aria-current="true"{% endif %}>
        Deutsch
      </a>
    </li>
    <li>
      <a href="/en/" lang="en" hreflang="en"
         {% if current_lang == "en" %}aria-current="true"{% endif %}>
        English
      </a>
    </li>
  </ul>
</nav>
```

Add `hreflang` and `lang` attributes to each link for accessibility and SEO.

### daisyUI Styling Example

```html
<div class="dropdown dropdown-end">
  <button tabindex="0" class="btn btn-ghost btn-sm gap-1">
    {% assign current_lang = page.language | default: site.language %}
    {{ current_lang | upcase }}
    <svg class="size-4 opacity-60" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>
  </button>
  <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-40">
    <li><a href="/" lang="de" hreflang="de" {% if current_lang == "de" %}class="active"{% endif %}>Deutsch</a></li>
    <li><a href="/en/" lang="en" hreflang="en" {% if current_lang == "en" %}class="active"{% endif %}>English</a></li>
  </ul>
</div>
```

### Smart Cross-Page Switching

For a switcher that links to the *same page* in another language (not just the locale root), store page mappings in a table:

```
create_table(website: "my-site", name: "Page Translations", slug: "page_translations",
  fields_schema: { fields: [
    { name: "page_slug", type: "string" },
    { name: "language", type: "string" },
    { name: "translated_path", type: "string" }
  ] })
```

Then use Liquid in your component to look up alternate paths:

```liquid
{% assign current_lang = page.language | default: site.language %}
{% assign current_slug = page.path | split: "/" | last %}
{% for row in site.tables.page_translations | where: "page_slug", current_slug %}
  {% unless row.language == current_lang %}
    <a href="{{ row.translated_path }}" lang="{{ row.language }}" hreflang="{{ row.language }}">{{ row.language | upcase }}</a>
  {% endunless %}
{% endfor %}
```

## Per-Locale SEO

### Locale-Specific Meta Tags

Use `additional_html_head_html` on each page to set locale-specific title, description, and social cards:

```html
<title>About Us — My Company</title>
<meta name="description" content="Learn about our team and mission.">
<meta property="og:title" content="About My Company">
<meta property="og:description" content="Learn about our team and mission.">
<meta property="og:locale" content="en_US">
<meta property="og:url" content="https://example.com/en/about">
```

### og:locale vs hreflang Gotcha

Open Graph uses **underscores** (`en_US`, `de_DE`). Hreflang uses **hyphens** (`en-US`, `de-DE`). This inconsistency is a common bug source — check both when validating:

```html
<!-- Hreflang: hyphens -->
<link rel="alternate" hreflang="en-US" href="https://example.com/en/">

<!-- Open Graph: underscores -->
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="de_DE">
```

### Canonical URLs

Each locale page should have a **locale-specific canonical** pointing to itself — NOT all pointing back to the primary language:

```html
<!-- On /en/about — correct: self-referencing canonical -->
<link rel="canonical" href="https://example.com/en/about">

<!-- On /de/ueber-uns — correct: self-referencing canonical -->
<link rel="canonical" href="https://example.com/de/ueber-uns">
```

Both pages also declare their relationship via hreflang. Together, this tells Google they're related variants, not duplicates.

### Structured Data with Locale

Add `inLanguage` to schema.org markup so search engines associate structured data with the correct language:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Über uns",
  "inLanguage": "de",
  "description": "Lernen Sie unser Team kennen."
}
</script>
```

## Content Translation Strategies

### Strategy 1: Duplicate Pages (Simple)

Create a separate page for each language. Best for small sites (under 20 pages) with 2-3 languages.

**Pros:** Full control, per-page SEO, versioned independently.
**Cons:** Manual duplication, grows exponentially with pages × languages.

### Strategy 2: Tables-Backed with Multi-Placeholder Paths (Scalable)

Store translations in a data table and use a **template page with multi-placeholder paths** to render them. The `:language` placeholder maps to a `language` field in the table schema, giving you per-language URLs (`/blog/en/my-post`, `/blog/de/mein-beitrag`) from a single table.

```
create_table(website: "my-site", name: "Blog Translations", slug: "blog_i18n",
  fields_schema: { fields: [
    { name: "slug", type: "string" },
    { name: "language", type: "string" },
    { name: "title", type: "string" },
    { name: "body", type: "text" }
  ] })

import_table_rows(table_id: "...", content: "slug,language,title,body\nintro,en,Introduction,Welcome!\neinfuehrung,de,Einführung,Willkommen!\nintroduction,fr,Introduction,Bienvenue!")

create_page(website: "my-site", path: "/blog/:language/:slug",
  table_slug: "blog_i18n", html: '...')
```

Template page Liquid:

```liquid
<article lang="{{ row.language }}">
  <h1>{{ row.title }}</h1>
  {{ row.body }}
</article>
```

Each row renders at `/blog/{language}/{slug}`. Use distinct slugs per language (e.g., `intro` for English, `einfuehrung` for German) — this matches the localized-slug best practice and avoids slug collisions during import.

**Pros:** Scales to many pages and languages. Per-language URLs. Single source of truth. Easy CSV import/export.
**Cons:** Requires `language` field in table schema. All translations share one template.

### Strategy 3: Snippets for Shared Assets

Use language-prefixed snippet paths for locale-specific CSS and JS:

```
create_snippet(website: "my-site", path: "css/en.css", content: "...")
create_snippet(website: "my-site", path: "css/de.css", content: "...")
create_snippet(website: "my-site", path: "css/ar.css", content: "...")
```

Reference in `html_head` or `additional_html_head_html`:

```liquid
<link rel="stylesheet" href="/snippets/css/{{ page.language | default: site.language | downcase }}.css">
```

> Snippet paths are lowercase-only. If `language` is a region tag (`en-US`, `pt-BR`), the `| downcase` filter produces valid paths like `/snippets/css/en-us.css`. Create snippets with lowercase filenames accordingly.

## RTL Support

For right-to-left languages (Arabic, Hebrew, Persian, Urdu, Yiddish), you need to set text direction and adapt your layout.

### Current Platform Limitation

PageWeave generates `<html lang="...">` from the page/website language setting, but **does not currently support setting `dir="rtl"` on the `<html>` element**. There is no MCP tool or `additional_html_head_html` mechanism to add it.

### Working Alternatives

**Option 1: Wrapper element in page body**

Add `dir="rtl"` to a wrapper element in your page HTML:

```html
<div dir="rtl" lang="ar">
  <h1>مرحبا</h1>
  <p>محتوى الصفحة هنا</p>
</div>
```

**Option 2: CSS direction via snippet**

Create a language-specific CSS snippet:

```
create_snippet(website: "my-site", path: "css/rtl.css", content: '
body { direction: rtl; text-align: right; }
')
```

Then conditionally load it in `html_head` or `additional_html_head_html`:

```liquid
{% assign lang = page.language | default: site.language %}
{% if lang == "ar" or lang == "he" or lang == "fa" or lang == "ur" or lang == "yi" %}
  <link rel="stylesheet" href="/snippets/css/rtl.css">
{% endif %}
```

> This hardcoded list covers common RTL languages. It will miss less common RTL languages (Divehi, Pashto, Syriac, etc.). The platform does not auto-detect RTL from the BCP 47 tag. Expand the condition as needed for your target languages.

### CSS Considerations for RTL

Tailwind's logical properties handle RTL automatically for common utilities:

| LTR Utility | RTL Equivalent | Description |
|---|---|---|
| `ml-4` | `ms-4` | Margin start (left in LTR, right in RTL) |
| `mr-4` | `me-4` | Margin end (right in LTR, left in RTL) |
| `pl-4` | `ps-4` | Padding start |
| `pr-4` | `pe-4` | Padding end |
| `text-left` | `text-start` | Text alignment start |
| `text-right` | `text-end` | Text alignment end |
| `rounded-l` | `rounded-s` | Rounded start |
| `rounded-r` | `rounded-e` | Rounded end |

Prefer `*-start`/`*-end` utilities over `*-left`/`*-right` — they flip automatically with `dir="rtl"`.

## SEO Checklist

Before publishing a multilingual site, verify:

- [ ] **URL structure** — consistent locale prefix format across all pages (`/en/`, `/de/`, etc.), lowercase, hyphen-separated
- [ ] **`lang` attribute** — set on website and/or page level; `<html lang="...">` is correct in rendered output
- [ ] **Hreflang self-reference** — every page includes a hreflang tag pointing to itself
- [ ] **Hreflang reciprocity** — all locale variants reference each other bidirectionally
- [ ] **x-default present** — fallback URL set on all pages, returns 200
- [ ] **Hreflang URLs absolute** — fully qualified with `https://`, not relative (`/en/about`) or protocol-relative (`//example.com`)
- [ ] **Canonical per locale** — each page's canonical points to its own locale URL
- [ ] **Title tag localized** — each language version has a translated title
- [ ] **Meta description localized** — each locale page has a translated description
- [ ] **OG tags localized** — `og:title`, `og:description`, `og:locale` set per locale
- [ ] **RTL direction set** — `dir="rtl"` on a wrapper element or CSS `direction: rtl` for Arabic, Hebrew, Persian, Urdu, Yiddish pages
- [ ] **Language switcher accessible** — `lang` and `hreflang` attributes on switcher links
- [ ] **Sitemap correct** — PageWeave auto-generates sitemaps listing all indexable pages; verify in Search Console

## Common Pitfalls

### Non-Reciprocal Hreflang

```
WRONG → English page declares German alternate, but German page doesn't declare English
FIX   → Every page must declare every other page, including itself
```

### Wrong Locale Codes

```
WRONG → en-uk (UK is not an ISO 3166-1 code)
FIX   → en-GB

WRONG → en_us (underscores)
FIX   → en-US (hyphens in hreflang, underscores in OG)

WRONG → zh for Chinese when you serve distinct scripts
FIX   → zh-Hans (Simplified) or zh-Hant (Traditional)
```

### Missing Self-Reference

```
WRONG → German page lists hreflang="en" and hreflang="fr" but not hreflang="de"
FIX   → Every page MUST include hreflang pointing to itself
```

### Missing x-default

```
WRONG → No x-default tag. Google has no guidance for unmatched languages.
FIX   → Add <link rel="alternate" hreflang="x-default" href="...">
```

### Canonical Pointing to Wrong Locale

```
WRONG → /de/ueber-uns has canonical pointing to /en/about
FIX   → /de/ueber-uns has canonical pointing to /de/ueber-uns
```

### Mixing Hreflang Methods

```
WRONG → Some pages use HTML tags, others use sitemap annotations
FIX   → Pick one method and use it consistently across the entire site
```

### Forgetting RTL

```
WRONG → Arabic page has lang="ar" but no RTL direction
FIX   → Wrap content in <div dir="rtl"> or use CSS direction: rtl via snippet
```

### Non-Localized Slugs

```
WRONG → /fr/about-us (English slug in French locale)
FIX   → /fr/a-propos (localized slug)
```

### CSS That Breaks in RTL

```
WRONG → Using text-left, ml-4, pr-2 (direction-dependent)
FIX   → Use text-start, ms-4, pe-2 (logical properties)
```

## Implementation Patterns

### Pattern 1: Simple 2-Language Site

Minimal setup for a bilingual German/English site with content at root.

```
# 1. Create website with German default
create_website(indexable: true, language: "de", subdomain: "my-bakery")

# 2. Create German pages at root
create_page(website: "my-bakery", path: "/", html: "...", title: "Bäckerei Schmidt", language: "de")
create_page(website: "my-bakery", path: "/brot", html: "...", title: "Unser Brot", language: "de")

# 3. Create English pages under /en/
create_page(website: "my-bakery", path: "/en/", html: "...", title: "Schmidt Bakery", language: "en")
create_page(website: "my-bakery", path: "/en/bread", html: "...", title: "Our Bread", language: "en")

# 4. Set global hreflang
update_component(website: "my-bakery", component: "html_head", html: '<link rel="alternate" hreflang="de" href="https://my-bakery.pageweave.site/">
<link rel="alternate" hreflang="en" href="https://my-bakery.pageweave.site/en/">
<link rel="alternate" hreflang="x-default" href="https://my-bakery.pageweave.site/">')

# 5. Add language switcher to header
update_component(website: "my-bakery", component: "header", html: '...')
```

> In this pattern, x-default points to `/` which shows German content. That's intentional — German is the primary locale. Visitors whose browser language doesn't match `de` or `en` see the German homepage as the fallback.

### Pattern 2: Multi-Region with Language Selector

A site serving distinct markets with a neutral landing page at root.

```
# 1. Create language selector at root
create_page(website: "my-store", path: "/", html: '<h1>Choose your region</h1>...')

# 2. Create locale pages (URLs must be lowercase)
create_page(website: "my-store", path: "/en-us/", html: "...", title: "My Store (US)", language: "en-US")
create_page(website: "my-store", path: "/en-gb/", html: "...", title: "My Store (UK)", language: "en-GB")
create_page(website: "my-store", path: "/de/", html: "...", title: "Mein Shop", language: "de")

# 3. Per-page hreflang with x-default pointing to selector
# (applied to all locale pages via additional_html_head_html)
# Note: hreflang uses BCP 47 casing (en-US), URLs use lowercase (en-us)
update_page(website: "my-store", path: "/en-us/",
  additional_html_head_html: '<link rel="alternate" hreflang="en-US" href="https://my-store.pageweave.site/en-us/">
<link rel="alternate" hreflang="en-GB" href="https://my-store.pageweave.site/en-gb/">
<link rel="alternate" hreflang="de" href="https://my-store.pageweave.site/de/">
<link rel="alternate" hreflang="x-default" href="https://my-store.pageweave.site/">')

# 4. Language selector includes link to / (root selector) as "All regions"
```

### Pattern 3: Table-Backed Translations

For content-heavy sites (blogs, documentation, product catalogs) with many pages per language. Uses multi-placeholder template paths for per-language URLs from a single table.

```
# 1. Create translation table
create_table(website: "my-docs", name: "Doc Translations", slug: "docs_i18n",
  fields_schema: { fields: [
    { name: "slug", type: "string" },
    { name: "language", type: "string" },
    { name: "title", type: "string" },
    { name: "content", type: "text" }
  ] })

# 2. Create template page with :language placeholder
create_page(website: "my-docs", path: "/docs/:language/:slug",
  table_slug: "docs_i18n", title: "Documentation",
  html: '<article lang="{{ row.language }}">
  <h1>{{ row.title }}</h1>
  {{ row.content }}
</article>')

# 3. Import translations (use distinct slugs per language)
import_table_rows(table_id: "...", content: "slug,language,title,content\ngetting-started,en,Getting Started,Welcome!\neinfuehrung,de,Einführung,Willkommen!\nintroduction,fr,Introduction,Bienvenue!")

# 4. Language-aware navigation
update_component(website: "my-docs", component: "header",
  html: '<nav>
  {% assign lang = page.language | default: site.language %}
  <a href="/docs/en/getting-started">English</a>
  <a href="/docs/de/einfuehrung">Deutsch</a>
  <a href="/docs/fr/introduction">Français</a>
</nav>')
```

## Further Reading

- [Google's hreflang documentation](https://developers.google.com/search/docs/specialty/international/localized-versions) — official guidance on localized versions
- [SEO & Meta Tags](/docs/seo) — PageWeave SEO guide (includes basic language setup)
- [Liquid Templating](/docs/liquid) — PageWeave Liquid syntax and table access
- [Data Tables](/docs/tables) — structured content for scalable translations

