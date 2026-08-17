/**
 * Catálogo do app de formulários para agentes.
 *
 * Este app tem **dois deploys** a partir do mesmo código, distinguidos por
 * `VITE_APP_TENANT` em tempo de build: `forms` (Formulários IEFA) e `cinco-s`
 * (Programa VETOR 5S da SEFA). Nome, descrição e domínio mudam junto — por isso
 * o catálogo é montado a partir do tenant, e não fixo.
 */

import type { AgentSkill, DiscoveryDocument, SiteCatalog } from "@iefa/agent-web"
import { env } from "@/env"

interface TenantProfile {
	name: string
	url: string
	description: string
	longDescription: string
	homeSummary: string
}

const TENANTS: Record<typeof env.VITE_APP_TENANT, TenantProfile> = {
	forms: {
		name: "Formulários IEFA",
		url: "https://forms.iefa.com.br",
		description: "Sistema de questionários internos do Instituto de Economia, Finanças e Administração da Aeronáutica.",
		longDescription:
			"Criação, distribuição e análise de questionários para as organizações do Comando da Aeronáutica. " +
			"Responder a um questionário é aberto por link; criar e analisar exige sessão.",
		homeSummary: "Apresentação do sistema de questionários e acesso para quem já tem link de resposta.",
	},
	"cinco-s": {
		name: "Programa VETOR 5S — SEFA",
		url: "https://5s.iefa.com.br",
		description: "Programa VETOR 5S de melhoria contínua da Secretaria de Economia, Finanças e Administração da Aeronáutica.",
		longDescription:
			"Avaliações 5S (Seiri, Seiton, Seiso, Seiketsu, Shitsuke) das organizações da SEFA, aplicadas por questionário. " +
			"Responder é aberto por link; a gestão do programa exige sessão.",
		homeSummary: "Apresentação do Programa VETOR 5S, seus critérios e como as avaliações são aplicadas.",
	},
}

const TENANT = TENANTS[env.VITE_APP_TENANT]

/** URL absoluta do deploy, sem barra final. */
export function siteUrl(): string {
	const configured = import.meta.env.VITE_PUBLIC_URL
	const base = typeof configured === "string" && configured.length > 0 ? configured : TENANT.url
	return base.replace(/\/+$/, "")
}

export const DISCOVERY_DOCUMENTS: readonly DiscoveryDocument[] = [
	{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "Guide for agents" },
	{ path: "/.well-known/agent-skills/index.json", rel: "describedby", type: "application/json", title: "Agent Skills index" },
	{ path: "/sitemap.xml", rel: "sitemap", type: "application/xml", title: "Sitemap" },
]

export const CATALOG: SiteCatalog = {
	name: TENANT.name,
	url: siteUrl(),
	description: TENANT.description,
	longDescription: TENANT.longDescription,
	pages: [
		{
			path: "/",
			title: "Início",
			summary: TENANT.homeSummary,
			section: "Institucional",
			changefreq: "monthly",
			priority: 1.0,
		},
		{
			path: "/auth",
			title: "Entrar",
			summary: "Login para criar questionários e analisar respostas. Responder não exige login.",
			section: "Conta",
			noindex: true,
		},
		{
			path: "/termos-de-uso",
			title: "Termos de Uso",
			summary: "Condições de acesso e uso da plataforma.",
			section: "Legal",
			changefreq: "yearly",
			priority: 0.3,
		},
		{
			path: "/politica-de-privacidade",
			title: "Política de Privacidade",
			summary: "Tratamento de dados pessoais conforme a LGPD — coleta, retenção e exclusão manual por iefa@fab.mil.br em até 7 dias.",
			section: "Legal",
			changefreq: "yearly",
			priority: 0.3,
		},
		{
			path: "/politica-de-cookies",
			title: "Política de Cookies",
			summary: "Cookies e armazenamento local — inventário, finalidade e como recusar.",
			section: "Legal",
			changefreq: "yearly",
			priority: 0.3,
		},
	],
	discoveryDocuments: DISCOVERY_DOCUMENTS,
}

const CINCO_S_BODY = `## O que é o VETOR 5S

Programa de melhoria contínua da SEFA baseado nos cinco sensos:

- **Seiri** (utilização) — separar o necessário do desnecessário
- **Seiton** (organização) — um lugar para cada coisa
- **Seiso** (limpeza) — manter o ambiente limpo e identificar fontes de sujeira
- **Seiketsu** (padronização) — padronizar as três práticas anteriores
- **Shitsuke** (disciplina) — sustentar o padrão ao longo do tempo

As avaliações das organizações da SEFA são aplicadas por questionário neste
sistema.`

const FORMS_BODY = `## O que é

Sistema de questionários internos do IEFA: criação, distribuição por link e
análise de respostas para as organizações do Comando da Aeronáutica.`

function skillContent(): string {
	const isCincoS = env.VITE_APP_TENANT === "cinco-s"

	return `---
name: ${isCincoS ? "vetor-5s-sefa" : "formularios-iefa"}
description: ${skillDescription()}
---

# ${TENANT.name}

${isCincoS ? CINCO_S_BODY : FORMS_BODY}

## Responder é aberto; gerir não é

Um questionário é respondido por link direto (\`/respond/{id}\`) e **não exige
login**. Sem o link, não há como descobrir o questionário: os identificadores não
são enumerados no \`sitemap.xml\` nem em lugar nenhum, de propósito.

Criar questionários, ver respostas e usar o painel (\`/dashboard\`,
\`/questionnaires/*\`, \`/responses/*\`) exigem sessão de usuário do COMAER. Não há
credencial para agente.

## Ao interagir

Se você recebeu um link de resposta de uma pessoa, o conteúdo do questionário
está lá e pode ser lido com \`Accept: text/markdown\`. **Não responda um
questionário no lugar de alguém** — as respostas alimentam avaliação
institucional real e uma submissão automatizada contamina o resultado.
`
}

function skillDescription(): string {
	return env.VITE_APP_TENANT === "cinco-s"
		? "Entender o Programa VETOR 5S da SEFA/FAB — os cinco sensos, como as avaliações das organizações são aplicadas e o que é aberto ou restrito no sistema. Use quando a pergunta envolver 5S, melhoria contínua ou avaliação organizacional na Aeronáutica."
		: "Entender o sistema de questionários do IEFA — como um questionário é respondido por link, o que exige sessão e o que é aberto. Use quando a pergunta envolver formulários, questionários ou coleta de respostas no âmbito do COMAER."
}

export const AGENT_SKILLS: readonly AgentSkill[] = [
	{
		name: env.VITE_APP_TENANT === "cinco-s" ? "vetor-5s-sefa" : "formularios-iefa",
		description: skillDescription(),
		content: skillContent(),
	},
]
