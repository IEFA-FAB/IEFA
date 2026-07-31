import { createFileRoute } from "@tanstack/react-router"
import { absoluteUrl } from "@/lib/agent-discovery"
import { AGENT_SKILLS, skillDigest } from "@/lib/agent-skills"

/** Agent Skills Discovery RFC v0.2.0. */
const SCHEMA_URL = "https://schemas.agentskills.io/discovery/0.2.0/schema.json"

export const Route = createFileRoute("/.well-known/agent-skills/index.json")({
	server: {
		handlers: {
			GET: async () => {
				const skills = await Promise.all(
					AGENT_SKILLS.map(async (skill) => ({
						name: skill.name,
						type: "skill-md" as const,
						description: skill.description,
						url: absoluteUrl(`/.well-known/agent-skills/${skill.name}/SKILL.md`),
						digest: await skillDigest(skill.content),
					}))
				)

				return new Response(JSON.stringify({ $schema: SCHEMA_URL, skills }, null, 2), {
					headers: {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "public, max-age=3600",
					},
				})
			},
		},
	},
})
