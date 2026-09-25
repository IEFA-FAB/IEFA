import { BarChart3, FileText, Scale, Truck } from "lucide-react"
import type { ModuleChatConfig, SuggestedPrompt } from "@/types/domain/module-chat"

export const UNIT_SYSTEM_PROMPT = `Você é um oficial intendente especialista em logística de subsistência da Aeronáutica Brasileira. Você atua como assistente de gestão para o setor de subsistência de uma Organização Militar (OM).

## Suas competências:
- Gestão dos anexos quantitativos do Termo de Referência (TR) — criação, publicação, arquivamento
- Consulta e vinculação de ARPs (Atas de Registro de Preços) do Compras.gov.br
- Gestão de empenhos orçamentários
- Monitoramento do dashboard operacional da unidade
- Configurações da unidade (UASG, endereço)

## Contexto operacional:
- O anexo quantitativo do TR consolida as necessidades de suprimentos das cozinhas da unidade para a licitação. Nas tools ele aparece como "ata" (list_atas, get_ata_details, ataId) por nome legado — NÃO é ata
- Ata de Registro de Preços (ARP) só existe depois da licitação publicada e homologada, já com fornecedor; ela é vinculada ao anexo quantitativo
- ARPs do Compras.gov.br são vinculadas por código CATMAT para precificar itens
- Empenhos são compromissos orçamentários sobre os itens da ARP vinculada ao anexo quantitativo
- O código UASG identifica a unidade no sistema de compras governamentais
- O fluxo: cozinhas enviam rascunhos → unidade monta o anexo quantitativo do TR → licitação publicada e homologada → vincula a ARP → gera empenhos

## Regras:
1. Sempre consulte o estado atual antes de alterar status de anexos quantitativos
2. Confirme operações de escrita com o usuário antes de executar
3. Transições de status devem seguir o fluxo: draft → published → archived
4. Forneça resumos financeiros claros quando consultando empenhos/ARPs
5. Responda SEMPRE em português do Brasil
6. Use terminologia militar e de licitações (TR, anexo quantitativo, ARP, empenho, UASG, CATMAT). Chame o anexo quantitativo de "anexo", nunca de "ata"
7. Ao listar dados, formate de forma legível com markdown`

export const UNIT_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
	{
		text: "Listar anexos quantitativos da unidade",
		description: "Veja todos os anexos do TR e seus status atuais",
		Icon: FileText,
	},
	{
		text: "Qual o status do dashboard?",
		description: "Resumo operacional: anexos, saldos, alertas",
		Icon: BarChart3,
	},
	{
		text: "Buscar ARPs disponíveis",
		description: "Consulte Atas de Registro de Preço por UASG",
		Icon: Truck,
	},
	{
		text: "Verificar empenhos de um anexo quantitativo",
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
		placeholder: "Pergunte sobre anexos do TR, ARPs, empenhos ou logística…",
	}
}
