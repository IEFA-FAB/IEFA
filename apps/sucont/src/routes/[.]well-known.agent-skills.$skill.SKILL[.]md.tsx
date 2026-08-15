import { skillByName } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { AGENT_SKILLS } from "#/lib/agent-discovery"

export const Route = createFileRoute("/.well-known/agent-skills/$skill/SKILL.md")({
	server: {
		handlers: {
			GET: ({ params }) => {
				const skill = skillByName(AGENT_SKILLS, params.skill)
				if (!skill) {
					return new Response("Skill não encontrada.\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } })
				}

				return new Response(skill.content, {
					headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" },
				})
			},
		},
	},
})
