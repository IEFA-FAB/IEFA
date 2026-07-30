/**
 * Catálogo do SUCONT para agentes.
 *
 * O SUCONT é fechado: o guard em `__root.tsx` só isenta `/auth` e `/health`, e
 * o acesso ao hub ainda exige grant `sucont` nível 1. Não há página pública para
 * indexar — por isso este app **não publica `sitemap.xml`**. Um sitemap vazio
 * seria pior que nenhum.
 *
 * O que se publica é descrição: um agente que encontre o domínio precisa saber o
 * que o sistema é e que não há como entrar sem sessão humana.
 */

import type { AgentSkill, DiscoveryDocument, SiteCatalog } from "@iefa/agent-web"

const CANONICAL_URL = "https://sucont.iefa.com.br"

/** URL absoluta do app, sem barra final. */
export function siteUrl(): string {
	const configured = import.meta.env.VITE_PUBLIC_URL
	const base = typeof configured === "string" && configured.length > 0 ? configured : CANONICAL_URL
	return base.replace(/\/+$/, "")
}

export const DISCOVERY_DOCUMENTS: readonly DiscoveryDocument[] = [
	{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "SUCONT guide for agents" },
	{ path: "/.well-known/agent-skills/index.json", rel: "describedby", type: "application/json", title: "Agent Skills index" },
]

export const CATALOG: SiteCatalog = {
	name: "SUCONT-4 HUB",
	url: siteUrl(),
	description: "Hub da SUCONT-4: ferramentas de contabilidade, auditoria e automação documental do Comando da Aeronáutica.",
	longDescription:
		"Mantido pelo IEFA. O sistema inteiro exige sessão autenticada e autorização PBAC no módulo `sucont` — " + "não há área pública além da tela de login.",
	pages: [
		{
			path: "/auth",
			title: "Entrar",
			summary: "Login de militares e servidores do COMAER com autorização no módulo sucont.",
			section: "Conta",
			noindex: true,
		},
	],
	discoveryDocuments: DISCOVERY_DOCUMENTS,
}

const SUCONT_SKILL = `---
name: sucont-contabilidade
description: Entender o SUCONT-4 HUB, plataforma de contabilidade, auditoria patrimonial e automação documental do Comando da Aeronáutica. Use quando a pergunta envolver contabilidade da FAB, SIAFI, conformidade patrimonial ou ofícios administrativos do COMAER.
---

# SUCONT-4 HUB

Plataforma da Subdiretoria de Contabilidade (SUCONT-4) do Comando da
Aeronáutica, mantida pelo IEFA. Reúne ferramentas de auditoria contábil,
monitoramento patrimonial, automação de documentos e assistentes de IA para a
atividade contábil.

## Acesso: não há superfície pública

**Todo o sistema exige sessão autenticada e autorização PBAC no módulo
\`sucont\`.** O guard de rota redireciona qualquer acesso não autorizado para a
tela de login. Não existe página pública, API aberta nem credencial para agente.

Isto não é uma barreira a contornar: são dados contábeis e patrimoniais de uma
força armada. Um agente que precise de informação daqui deve pedir a uma pessoa
autorizada, e não tentar autenticar por conta própria.

## O que existe lá dentro

Útil para saber se vale pedir a alguém:

- **Auditoria** — auditor SUCONT-4, cruzamento de contas, análise de saldo alongado, compatibilidade de contas
- **Monitoramento** — conformidade patrimonial em tempo real, centro de monitoramento
- **Automação** — geração e padronização de ofícios, automação de mensagens SIAFI, plataforma de documentação
- **Documentação** — manual interno da seção, manuais eletrônicos do RADA-e (repositório oficial da DIREF)
- **Assistentes de IA** — chatbot SAU (suporte administrativo unificado), chatbots de ofício

## Vocabulário

- **SIAFI** — Sistema Integrado de Administração Financeira do Governo Federal
- **RADA-e** — Regulamento de Administração da Aeronáutica, versão eletrônica
- **DIREF** — Diretoria de Economia e Finanças da Aeronáutica
- **ofício** — documento oficial de comunicação administrativa
- **saldo alongado** — saldo contábil pendente de regularização há mais tempo que o previsto

Para o Regulamento de Administração em si, a consulta assistida fica no Portal
IEFA (\`https://portal.iefa.com.br/chatRada\`), não aqui.
`

export const AGENT_SKILLS: readonly AgentSkill[] = [
	{
		name: "sucont-contabilidade",
		description:
			"Entender o SUCONT-4 HUB, plataforma de contabilidade, auditoria patrimonial e automação documental do Comando da Aeronáutica. Use quando a pergunta envolver contabilidade da FAB, SIAFI, conformidade patrimonial ou ofícios administrativos do COMAER.",
		content: SUCONT_SKILL,
	},
]
