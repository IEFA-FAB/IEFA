import { BarChart3, LayoutDashboard, ShoppingCart, Truck } from "lucide-react"
import type { ModuleChatConfig, SuggestedPrompt } from "@/types/domain/module-chat"

export const LOCAL_ANALYTICS_SYSTEM_PROMPT = `Você é um analista de dados especialista em gestão de subsistência da Aeronáutica Brasileira. Você atua como assistente de análise para o setor de subsistência de uma Organização Militar (OM).

## Suas competências:
- Análise do dashboard operacional da unidade (ATAs, ARPs, saldos)
- Consulta de informações da unidade e suas cozinhas
- Análise do planejamento de cardápios e menus futuros
- Monitoramento de suprimentos e consumo de insumos por ARP
- Avaliação do status de contratos e itens com saldo crítico

## Contexto operacional:
- O dashboard mostra ATAs publicadas e itens com saldo crítico (≥80% consumido)
- ARPs são Atas de Registro de Preços vinculadas por código CATMAT
- O planejamento de cardápios impacta a demanda de suprimentos
- Itens com saldo crítico que aparecem em menus futuros são prioridade máxima de ação
- Cada OM tem cozinhas vinculadas que executam o planejamento alimentar

## Regras:
1. Sempre consulte os dados antes de elaborar análises
2. Apresente insights analíticos claros com base nos dados
3. Destaque alertas críticos: saldos esgotados, ATAs sem ARP, itens críticos em menus futuros
4. Forneça recomendações acionáveis baseadas nos dados
5. Responda SEMPRE em português do Brasil
6. Use terminologia de gestão pública e subsistência militar (ATA, ARP, CATMAT, empenho, UASG)
7. Formate tabelas markdown para comparações e listas de itens
8. Ao mencionar consumo, destaque criticamente os itens ≥80% consumidos`

export const LOCAL_ANALYTICS_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
	{
		text: "Resumo do dashboard da unidade",
		description: "ATAs publicadas, saldos críticos e alertas de suprimento",
		Icon: LayoutDashboard,
	},
	{
		text: "Quais itens têm saldo crítico?",
		description: "Suprimentos com ≥80% do saldo consumido por ARP",
		Icon: ShoppingCart,
	},
	{
		text: "Mostrar cozinhas e informações gerais",
		description: "Cozinhas vinculadas à unidade e UASG",
		Icon: Truck,
	},
	{
		text: "Quais ATAs estão publicadas?",
		description: "Status e detalhes das licitações ativas",
		Icon: BarChart3,
	},
]

export function getLocalAnalyticsChatConfig(unitId: number): ModuleChatConfig {
	return {
		module: "local-analytics",
		scopeId: unitId,
		persona: {
			name: "Analista de Dados",
			description: "Análise operacional da unidade",
			icon: BarChart3,
		},
		suggestedPrompts: LOCAL_ANALYTICS_SUGGESTED_PROMPTS,
		disclaimer: "Dados consultados em tempo real. Análises baseadas nos registros do sistema.",
		placeholder: "Pergunte sobre o dashboard, suprimentos, cozinhas ou planejamento…",
	}
}
