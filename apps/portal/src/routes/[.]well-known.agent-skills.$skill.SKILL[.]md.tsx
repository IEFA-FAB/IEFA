import { createFileRoute } from "@tanstack/react-router"
import { skillByName } from "@/lib/agent-skills"

export const Route = createFileRoute("/.well-known/agent-skills/$skill/SKILL.md")({
	server: {
		handlers: {
			GET: ({ params }) => {
				const skill = skillByName(params.skill)
				if (!skill) {
					return new Response("Skill não encontrada.\n", {
						status: 404,
						headers: { "content-type": "text/plain; charset=utf-8" },
					})
				}

				return new Response(skill.content, {
					headers: {
						"content-type": "text/markdown; charset=utf-8",
						"cache-control": "public, max-age=3600",
					},
				})
			},
		},
	},
})
