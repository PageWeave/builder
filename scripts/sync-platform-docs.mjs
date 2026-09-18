#!/usr/bin/env node
/**
 * Fetches the PageWeave platform docs that the bundled agent needs and writes
 * them as pi skills under src/engine/resources/skills/<name>/SKILL.md.
 *
 * Run manually when the platform docs change: `npm run sync:docs`. Output is
 * committed so builds are reproducible and offline installs work. The commit
 * message should note the docs date.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DOCS = [
  {
    slug: 'pageweave-platform',
    title: 'PageWeave platform reference',
    description:
      'PageWeave concepts (websites, pages, snippets, components, assets, tables, forms, environments, releases, domains) with operational constraints. Read when any tool result mentions these concepts or the user asks what something is.',
    url: 'https://pageweave.dev/docs.md',
  },
  {
    slug: 'pageweave-design',
    title: 'PageWeave design guide',
    description:
      'PageWeave design guidance for sites: themes (daisyUI semantic tokens), frontend rules (Tailwind + daisyUI 5, never Tailwind color names), dark-theme color-scheme requirement. Read before building or restyling pages.',
    url: 'https://pageweave.dev/docs/design.md',
  },
  {
    slug: 'pageweave-liquid',
    title: 'PageWeave Liquid reference',
    description:
      'Liquid templating in PageWeave: which fields support it, variables (site, page, row), markdownify, stored-verbatim fields, title rules. Read when writing or debugging page/component HTML with Liquid.',
    url: 'https://pageweave.dev/docs/liquid.md',
  },
  {
    slug: 'pageweave-i18n',
    title: 'PageWeave i18n guide',
    description:
      'Multilingual sites: BCP 47 language tags, per-page/per-site language settings, placeholder_defaults URL collapsing. Read when the user asks for a multilingual or translated site.',
    url: 'https://pageweave.dev/docs/i18n.md',
  },
  {
    slug: 'pageweave-privacy',
    title: 'PageWeave privacy facts',
    description:
      'PageWeave privacy posture (EU hosting, no cookies/trackers, analytics model, form data handling). Read when the user asks how PageWeave handles visitor data.',
    url: 'https://pageweave.dev/docs/privacy.md',
  },
]

const root = join(import.meta.dirname, '../src/engine/resources/skills')

for (const doc of DOCS) {
  const response = await fetch(doc.url)
  if (!response.ok) {
    console.error(`${doc.url} -> HTTP ${response.status}`)
    process.exitCode = 1
    continue
  }
  const body = await response.text()
  const frontmatter = `---\nname: ${doc.slug}\ndescription: ${doc.description}\n---\n\n# ${doc.title}\n\n> Synced from ${doc.url} on ${new Date().toISOString().slice(0, 10)} via npm run sync:docs.\n\n`
  const dir = join(root, doc.slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), frontmatter + body, 'utf8')
  console.log(`ok ${doc.slug} (${body.length} bytes)`)
}
