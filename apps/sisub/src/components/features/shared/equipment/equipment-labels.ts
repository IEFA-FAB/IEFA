/**
 * Rótulos em pt-BR dos enums de equipamento — um lugar só, para as quatro telas.
 *
 * A severidade é o caso que justifica o arquivo: ela é escrita para quem está de pé na praça,
 * de avental, no meio do serviço. "Inoperante" é a palavra do banco; "Não dá para usar" é a
 * pergunta que a pessoa consegue responder sem interpretar. Espalhar essa tradução por quatro
 * componentes garantiria que um deles ficasse com o termo técnico.
 */

import type { EquipmentCondition } from "@iefa/sisub-domain"

export const SEVERITY_LABEL: Record<string, string> = {
	degraded: "Dá para usar, com limitação",
	inoperative: "Não dá para usar",
}

/** Versão curta, para badge dentro de tabela. */
export const SEVERITY_BADGE: Record<string, string> = {
	degraded: "Limitado",
	inoperative: "Parado",
}

export const ISSUE_STATUS_LABEL: Record<string, string> = {
	open: "Aberta",
	in_repair: "Em conserto",
	resolved: "Resolvida",
	dismissed: "Descartada",
}

export const ISSUE_CATEGORY_LABEL: Record<string, string> = {
	mechanical: "Mecânica",
	electrical: "Elétrica",
	gas: "Gás",
	hydraulic: "Hidráulica",
	refrigeration: "Refrigeração",
	structural: "Estrutural",
	other: "Outra",
}

export const MAINTENANCE_KIND_LABEL: Record<string, string> = {
	preventive: "Preventiva",
	inspection: "Inspeção",
	cleaning: "Limpeza",
	calibration: "Calibração",
	legal: "Obrigação legal",
	corrective: "Corretiva",
}

export const MAINTENANCE_PROVIDER_LABEL: Record<string, string> = {
	in_house: "Equipe da OM",
	contract: "Contrato",
	warranty: "Garantia",
	manufacturer: "Fabricante",
	other: "Outro",
}

export const CONDITION_LABEL: Record<EquipmentCondition, string> = {
	operational: "Operacional",
	degraded: "Com limitação",
	down: "Parado",
	retired: "Baixado",
}

/**
 * Tint de fundo por condição — nunca faixa lateral colorida.
 *
 * A proibição é global no repositório (`border-l-*` como acento é o marcador nº 1 de AI slop),
 * e aqui ela é fácil de respeitar: a condição já tem badge, e o tint reforça sem inventar
 * geometria. `operational` fica sem tint de propósito: o normal não precisa de cor.
 */
export const CONDITION_TINT: Record<EquipmentCondition, string> = {
	operational: "",
	degraded: "bg-warning/5",
	down: "bg-destructive/5",
	retired: "bg-muted/40",
}

export const CONDITION_BADGE_VARIANT: Record<EquipmentCondition, "default" | "secondary" | "destructive" | "outline"> = {
	operational: "secondary",
	degraded: "outline",
	down: "destructive",
	retired: "outline",
}

export const DUE_LABEL: Record<string, string> = {
	ok: "Em dia",
	overdue: "Vencida",
	unknown: "Sem registro",
}
