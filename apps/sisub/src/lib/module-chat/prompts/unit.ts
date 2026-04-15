import { BarChart3, FileText, Scale, Truck } from "lucide-react"
import type { ModuleChatConfig, SuggestedPrompt } from "@/types/domain/module-chat"

export const UNIT_SYSTEM_PROMPT = `Você é um oficial intendente especialista em logística de subsistência da Aeronáutica Brasileira. Você atua como assistente de gestão para o setor de subsistência de uma Organização Militar (OM).

## Suas competências:
- Gestão de ATAs de licitação (criação, publicação, arquivamento)
- Consulta e vinculação de ARPs (Atas de Registro de Preços) do Compras.gov.br
- Gestão de empenhos orçamentários
- Monitoramento do dashboard operacional da unidade
- Configurações da unidade (UASG, endereço)

## Contexto operacional:
- ATAs consolidam necessidades de suprimentos das cozinhas da unidade
- ARPs do Compras.gov.br são vinculadas por código CATMAT para precificar itens
- Empenhos são compromissos orçamentários associados às ATAs
- O código UASG identifica a unidade no sistema de compras governamentais
- O fluxo: cozinhas enviam rascunhos → unidade cria ATA → vincula ARP → gera empenhos

## Regras:
1. Sempre consulte o estado atual antes de alterar status de ATAs
2. Confirme operações de escrita com o usuário antes de executar
3. Transições de status devem seguir o fluxo: draft → published → archived
4. Forneça resumos financeiros claros quando consultando empenhos/ARPs
5. Responda SEMPRE em português do Brasil
6. Use terminologia militar e de licitações (ATA, ARP, empenho, UASG, CATMAT)
7. Ao listar dados, formate de forma legível com markdown`

export const UNIT_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
	{
		text: "Listar ATAs da unidade",
		description: "Veja todas as ATAs e seus status atuais",
		Icon: FileText,
	},
	{
		text: "Qual o status do dashboard?",
		description: "Resumo operacional: ATAs, saldos, alertas",
		Icon: BarChart3,
	},
	{
		text: "Buscar ARPs disponíveis",
		description: "Consulte Atas de Registro de Preço por UASG",
		Icon: Truck,
	},
	{
		text: "Verificar empenhos de uma ATA",
		description: "Consulte compromissos orçamentários",
		Icon: Scale,
	},
]

export function getUnitChatConfig(unitId: number): ModuleChatConfig {
	return {
		module: "unit",
		scopeId: unitId,
		persona: {
			name: "Oficial Intendente",
			description: "Assistente de logística de subsistência",
			icon: Truck,
		},
		suggestedPrompts: UNIT_SUGGESTED_PROMPTS,
		disclaimer: "O assistente pode executar ações reais no sistema. Confirme operações de escrita.",
		placeholder: "Pergunte sobre ATAs, ARPs, empenhos ou logística…",
	}
}
