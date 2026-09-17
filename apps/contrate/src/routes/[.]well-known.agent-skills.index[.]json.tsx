import { renderSkillsIndex } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { AGENT_SKILLS, siteUrl } from "@/lib/agent-discovery"

export const Route = createFileRoute("/.well-known/agent-skills/index.json")({
	server: {
		handlers: {
			GET: async () =>
				new Response(await renderSkillsIndex(siteUrl(), AGENT_SKILLS), {
					headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" },
				}),
		},
	},
})
