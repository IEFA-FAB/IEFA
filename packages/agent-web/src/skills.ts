/**
 * Agent Skills, conforme o Agent Skills Discovery RFC v0.2.0
 * (índice em `/.well-known/agent-skills/index.json`).
 *
 * O conteúdo do `SKILL.md` fica no código do app para que o índice e o arquivo
 * servido nunca divirjam: o `digest` é calculado sobre exatamente os mesmos bytes
 * da resposta.
 */

import { stripTrailingSlashes } from "./catalog"

const SCHEMA_URL = "https://schemas.agentskills.io/discovery/0.2.0/schema.json"

const SKILL_NAME_PATTERN = /^[a-z0-9-]{1,64}$/

export interface AgentSkill {
	/** 1-64 caracteres, minúsculas, alfanuméricos e hífens. */
	name: string
	/** Até 1024 caracteres: o que a skill faz e quando usar. */
	description: string
	/** Conteúdo do SKILL.md, com frontmatter YAML de `name` e `description`. */
	content: string
}

export function skillByName(skills: readonly AgentSkill[], name: string): AgentSkill | undefined {
	return skills.find((skill) => skill.name === name)
}

/** Digest no formato exigido pelo RFC: `sha256:{64 hex}` sobre os bytes servidos. */
export async function skillDigest(content: string): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))
	const hex = Array.from(new Uint8Array(hash))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("")
	return `sha256:${hex}`
}

export function skillUrlPath(name: string): string {
	return `/.well-known/agent-skills/${name}/SKILL.md`
}

/**
 * Falha cedo em nome inválido: o RFC exige o formato e um índice malformado é pior
 * que índice ausente.
 */
export function assertValidSkills(skills: readonly AgentSkill[]): void {
	for (const skill of skills) {
		if (!SKILL_NAME_PATTERN.test(skill.name)) {
			throw new Error(`@iefa/agent-web: nome de skill inválido "${skill.name}" — use 1-64 caracteres em [a-z0-9-]`)
		}
		if (skill.description.length > 1024) {
			throw new Error(`@iefa/agent-web: descrição da skill "${skill.name}" excede 1024 caracteres`)
		}
	}
}

export async function renderSkillsIndex(baseUrl: string, skills: readonly AgentSkill[]): Promise<string> {
	assertValidSkills(skills)
	const base = stripTrailingSlashes(baseUrl)

	const entries = await Promise.all(
		skills.map(async (skill) => ({
			name: skill.name,
			type: "skill-md" as const,
			description: skill.description,
			url: `${base}${skillUrlPath(skill.name)}`,
			digest: await skillDigest(skill.content),
		}))
	)

	return JSON.stringify({ $schema: SCHEMA_URL, skills: entries }, null, 2)
}
