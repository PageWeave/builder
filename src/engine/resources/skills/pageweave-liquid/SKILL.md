---
name: pageweave-liquid
description: Liquid templating in PageWeave: which fields support it, variables (site, page, row), markdownify, stored-verbatim fields, title rules. Read when writing or debugging page/component HTML with Liquid.
---

# PageWeave Liquid reference

> Synced from https://pageweave.dev/docs/liquid.md on 2026-09-16 via npm run sync:docs.

---
title: "Documentation — PageWeave"
---

> For the full documentation index, see [PageWeave Documentation](https://pageweave.dev/docs) or fetch [llms.txt](https://pageweave.dev/llms.txt).

# Liquid Templating

All HTML in PageWeave supports Liquid. Use it for dynamic content, loops, conditionals, and data table access.

## Variables

### Global Drops

- `site.name` — Website name
- `site.subdomain` — Website subdomain
- `site.domain` — Custom domain (if set)
- `site.language` — BCP 47 language tag (from website setting)
- `site.indexable` — Search engine indexing enabled
- `site.tables.{slug}` — Data table rows

- `page.title` — Page title
- `page.path` — Page URL path
- `page.language` — Page-level language override (BCP 47 tag)
- `page.indexable` — Whether search engines index this page

### Template Pages

When a page is associated with a table, the `row` variable is available. Every placeholder in the page's path maps verbatim to a row data field (uniform field semantics):

- `row.id` — Row UUID
- `row.slug` — the `slug` data field's value (alias for `row.data.slug`). You supply it in row data — no auto-generation.
- `row.created_at` — Creation timestamp
- `row.updated_at` — Last update timestamp
- `row.url` — Full URL to this row's page, in its collapsed canonical form (default-locale segments omitted, e.g. `/docs/seo` not `/docs/en/seo`)
- `row.{field}` — Any table field
- `row.{field}.{nested}` — Nested data

## Syntax

```liquid
{{ site.name }}
{% if site.indexable %}
  <meta name="robots" content="index, follow">
{% endif %}
{% for i in (1..3) %}{{ i }}{% endfor %}
{% assign x = "value" %}
```

## Filters

Standard Liquid filters: `upcase`, `downcase`, `date`, `truncate`, `times`, `divided_by`, `append`, `prepend`, `strip_html`.

Table filters:
- `where: "field", "value"` — Filter rows
- `sort_by: "field", "desc"` — Sort rows (numeric fields sort numerically)

Array filters:
- `push: value` — Append a value to an array (non-destructive — returns a copy, the original is unchanged)

Arrays and table row collections expose `size`, `first`, and `last` as properties: `{{ posts.size }}`, `{{ posts.first.title }}`, `{{ posts.last }}`.

Filters chain on `{% assign %}` — assign the filtered collection to a variable first, then loop over it:

```liquid
{% assign posts = site.tables.blog_posts | where: "published", "true" | sort_by: "created_at", "desc" %}
{% for post in posts %}
  <h2>{{ post.title }}</h2>
{% endfor %}
```

> **Note:** Liquid ignores filter chains written directly inside a `{% for %}` tag
> (`{% for post in site.tables.blog_posts | where: ... %}` renders every row,
> unfiltered, with no error). Page validation flags this pattern with a warning
> pointing to the assign-first form above.

## Markdown Rendering

The `markdownify` filter renders markdown as HTML — safe by default (literal raw HTML in the source is neutralized), with the full GFM set: tables, task lists, strikethrough, autolinks, and soft line breaks.

```liquid
<div class="prose">{{ row.content | markdownify }}</div>
```

Use it to render markdown stored in data tables (e.g. documentation bodies, blog post content) inside template pages.

## Data Tables

### Basic Loop

```liquid
{% for post in site.tables.blog_posts limit: 10 %}
  <h2>{{ post.title }}</h2>
  <p>{{ post.excerpt | truncate: 150 }}</p>
{% endfor %}
```

> **Render limits:** every loop over a table — plain, `where`/`sort_by` results, or `limit:`/`offset:` slices — renders at most **100 rows** (hard cap per loop). For more rows, page with `{% paginate ... by 100 %}` or fetch the JSON API (`GET /t/{table_id}`) client-side.

### Pagination

```liquid
{% paginate site.tables.blog_posts by 10 order_by: "created_at" order_dir: "desc" where: "published:true" %}
  {% for post in site.tables.blog_posts %}
    {{ post.title }}
  {% endfor %}
  {% if paginate.next %}
    <a href="{{ paginate.next.url }}">Next</a>
  {% endif %}
{% endpaginate %}
```

Render cap: **100 rows per loop**. `{% paginate %}` pages through the full collection (1–100 rows per page).

### Template Page Example

```liquid
<article>
  <h1>{{ row.title }}</h1>
  <p>Published: {{ row.created_at | date: "%B %d, %Y" }}</p>
  <div>{{ row.body | markdownify }}</div>
  <a href="{{ row.url }}">Permalink</a>
</article>
```

## Syntax Warnings

Liquid syntax errors are reported via `liquid_warnings` in page responses. Validation warnings (including filter chains inside `{% for %}` tags and unknown filters) appear in `validation.warnings` when creating or updating pages. An unknown filter renders its input as **empty** — the response reports `Unknown filter 'x'.`, and dev environments show inline `[Liquid: ...]` markers in the browser.
