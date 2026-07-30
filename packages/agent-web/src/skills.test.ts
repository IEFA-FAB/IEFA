import { describe, expect, test } from "bun:test"
import { type AgentSkill, assertValidSkills, renderSkillsIndex, skillByName, skillDigest } from "./skills.ts"

const SKILLS: AgentSkill[] = [
	{ name: "consultar-app", description: "Consultar o app.", content: "---\nname: consultar-app\n---\n\n# Consultar\n" },
	{ name: "outra-skill", description: "Outra coisa.", content: "---\nname: outra-skill\n---\n\n# Outra\n" },
]

describe("skillDigest", () => {
	test("formato sha256:{64 hex} exigido pelo RFC", async () => {
		expect(await skillDigest("conteúdo")).toMatch(/^sha256:[0-9a-f]{64}$/)
	})

	test("hash conhecido da string vazia", async () => {
		expect(await skillDigest("")).toBe("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
	})

	test("conteúdo diferente, digest diferente", async () => {
		expect(await skillDigest("a")).not.toBe(await skillDigest("b"))
	})
})

describe("renderSkillsIndex", () => {
	test("índice no formato do RFC v0.2.0", async () => {
		const parsed = JSON.parse(await renderSkillsIndex("https://teste.iefa.com.br", SKILLS))
		expect(parsed.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json")
		expect(parsed.skills).toHaveLength(2)

		const [first] = parsed.skills
		expect(first.type).toBe("skill-md")
		expect(first.url).toBe("https://teste.iefa.com.br/.well-known/agent-skills/consultar-app/SKILL.md")
	})

	// O ponto de calcular o digest em runtime é justamente esta garantia.
	test("digest bate com o conteúdo servido", async () => {
		const parsed = JSON.parse(await renderSkillsIndex("https://teste.iefa.com.br", SKILLS))
		expect(parsed.skills[0].digest).toBe(await skillDigest(SKILLS[0].content))
	})

	test("normaliza barra final da base", async () => {
		const parsed = JSON.parse(await renderSkillsIndex("https://teste.iefa.com.br/", SKILLS))
		expect(parsed.skills[0].url).not.toContain("//.well-known")
	})
})

describe("assertValidSkills", () => {
	test("aceita nomes válidos", () => {
		expect(() => assertValidSkills(SKILLS)).not.toThrow()
	})

	test("rejeita maiúsculas e caracteres fora do padrão", () => {
		expect(() => assertValidSkills([{ name: "Skill_Ruim", description: "x", content: "" }])).toThrow(/nome de skill/)
	})

	test("rejeita descrição acima de 1024 caracteres", () => {
		expect(() => assertValidSkills([{ name: "ok", description: "x".repeat(1025), content: "" }])).toThrow(/1024/)
	})
})

describe("skillByName", () => {
	test("encontra e devolve undefined quando não existe", () => {
		expect(skillByName(SKILLS, "outra-skill")?.description).toBe("Outra coisa.")
		expect(skillByName(SKILLS, "inexistente")).toBeUndefined()
	})
})
