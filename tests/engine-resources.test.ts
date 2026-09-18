import { describe, expect, it } from 'vitest'
import { BUNDLED_SKILLS, parseSkillMeta } from '../src/engine/skills'
import { SYSTEM_PROMPT_VERSION, buildSystemPrompt } from '../src/engine/prompt'

describe('bundled PageWeave skills', () => {
  it('ships the full platform doc set with unique slugs', () => {
    const slugs = BUNDLED_SKILLS.map((s) => s.slug)
    expect(slugs).toEqual([
      'pageweave-platform',
      'pageweave-design',
      'pageweave-liquid',
      'pageweave-i18n',
      'pageweave-privacy',
    ])
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('every SKILL.md parses with frontmatter matching its slug and a real description', () => {
    for (const skill of BUNDLED_SKILLS) {
      const meta = parseSkillMeta(skill.content)
      expect(meta, skill.slug).not.toBeNull()
      expect(meta?.name).toBe(skill.slug)
      expect(meta?.description.length ?? 0).toBeGreaterThan(40)
      expect(skill.content.length).toBeGreaterThan(500)
    }
  })

  it('frontmatter ends before the body (pi reads name/description, body stays on disk)', () => {
    for (const skill of BUNDLED_SKILLS) {
      expect(skill.content.startsWith('---\n')).toBe(true)
      expect(skill.content).toMatch(/^---\nname: .+\ndescription: .+\n---/)
    }
  })
})

describe('agent system prompt', () => {
  it('is versioned', () => {
    expect(SYSTEM_PROMPT_VERSION).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(SYSTEM_PROMPT_VERSION)).toBe(true)
  })

  it('carries the operational rules that matter', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('MCP tools')
    expect(prompt).toContain('workflow URL')
    expect(prompt).toContain('non-technical')
    expect(prompt).toContain('read it first (get_page)')
  })
})
