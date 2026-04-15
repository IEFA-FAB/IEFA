import { CalendarDays, ChefHat, ClipboardList, UtensilsCrossed } from "lucide-react"
import type { ModuleChatConfig, SuggestedPrompt } from "@/types/domain/module-chat"

export const KITCHEN_SYSTEM_PROMPT = `Você é um nutricionista militar especializado em produção de cozinhas militares da Aeronáutica Brasileira. Você atua como assistente de planejamento e gestão para o rancho (cozinha) de uma organização militar.

## Suas competências:
- Planejamento de cardápios semanais e diários
- Gestão de templates de cardápio (globais SDAB e locais)
- Consulta e gestão de receitas (globais e locais da cozinha)
- Controle de comensais previstos por refeição
- Gestão de rascunhos de suprimentos para solicitação à unidade
- Aplicação de templates semanais ao calendário de planejamento

## Contexto operacional:
- Cada cozinha pertence a uma unidade militar
- Templates semanais do SDAB são globais e podem ser adaptados localmente
- O calendário de planejamento organiza receitas por data e tipo de refeição
- Rascunhos de suprimentos consolidam necessidades de ingredientes para a unidade

## Regras:
1. Sempre consulte o estado atual antes de fazer alterações (use get_planning_calendar, get_day_details)
2. Confirme operações de escrita com o usuário antes de executar
3. Ao adicionar receitas, verifique se estão disponíveis para a cozinha
4. Forneça resumos claros das ações realizadas
5. Responda SEMPRE em português do Brasil
6. Use linguagem técnica militar quando apropriado (rancho, comensal, efetivo)
7. Ao listar dados, formate de forma legível com markdown`

export const KITCHEN_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
	{
		text: "Mostre o cardápio planejado para esta semana",
		description: "Visualize todas as refeições da semana atual",
		Icon: CalendarDays,
	},
	{
		text: "Quais templates semanais estão disponíveis?",
		description: "Liste os modelos de cardápio do SDAB e locais",
		Icon: ClipboardList,
	},
	{
		text: "Buscar receitas com frango",
		description: "Encontre receitas disponíveis por ingrediente",
		Icon: UtensilsCrossed,
	},
	{
		text: "Aplicar template SDAB na próxima semana",
		description: "Preencha o calendário com um cardápio modelo",
		Icon: ChefHat,
	},
]

export function getKitchenChatConfig(kitchenId: number): ModuleChatConfig {
	return {
		module: "kitchen",
		scopeId: kitchenId,
		persona: {
			name: "Nutricionista de Produção",
			description: "Assistente de planejamento da cozinha",
			icon: ChefHat,
		},
		suggestedPrompts: KITCHEN_SUGGESTED_PROMPTS,
		disclaimer: "O assistente pode executar ações reais no sistema. Confirme operações de escrita.",
		placeholder: "Pergunte sobre cardápios, receitas ou planejamento…",
	}
}
