/**
 * Bundled PageWeave skills. The SKILL.md files live in
 * src/engine/resources/skills/ (synced from pageweave.dev via
 * `npm run sync:docs`), are inlined into the engine chunk at build time
 * (?raw), and are written into the app-managed agent dir
 * (<userData>/agent/skills) at boot so pi's resource loader can read them
 * from disk on demand. ~/.pi is never touched (PI_CODING_AGENT_DIR override,
 * see src/engine/index.ts).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import pageweavePlatform from './resources/skills/pageweave-platform/SKILL.md?raw'
import pageweaveDesign from './resources/skills/pageweave-design/SKILL.md?raw'
import pageweaveLiquid from './resources/skills/pageweave-liquid/SKILL.md?raw'
import pageweaveI18n from './resources/skills/pageweave-i18n/SKILL.md?raw'
import pageweavePrivacy from './resources/skills/pageweave-privacy/SKILL.md?raw'

export interface BundledSkill {
  slug: string
  content: string
}

export const BUNDLED_SKILLS: BundledSkill[] = [
  { slug: 'pageweave-platform', content: pageweavePlatform },
  { slug: 'pageweave-design', content: pageweaveDesign },
  { slug: 'pageweave-liquid', content: pageweaveLiquid },
  { slug: 'pageweave-i18n', content: pageweaveI18n },
  { slug: 'pageweave-privacy', content: pageweavePrivacy },
]

export interface SkillMeta {
  name: string
  description: string
}

/** Parses `name`/`description` from the SKILL.md frontmatter. */
export function parseSkillMeta(content: string): SkillMeta | null {
  const match = /^---\r?\nname:\s*(.+?)\r?\ndescription:\s*(.+?)\r?\n---/.exec(content)
  if (!match || match[1] === undefined || match[2] === undefined) return null
  return { name: match[1].trim(), description: match[2].trim() }
}

/**
 * Writes any skill whose on-disk content differs (content-addressed sync, so
 * app updates refresh docs). Returns the skills directory.
 */
export async function syncBundledSkills(agentDir: string): Promise<string> {
  const skillsDir = join(agentDir, 'skills')
  for (const skill of BUNDLED_SKILLS) {
    const file = join(skillsDir, skill.slug, 'SKILL.md')
    const current = await readFileOrNull(file)
    if (current !== skill.content) {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, skill.content, 'utf8')
    }
  }
  return skillsDir
}

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}
