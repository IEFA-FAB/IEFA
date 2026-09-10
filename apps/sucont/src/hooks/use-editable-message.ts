/**
 * @module hooks/use-editable-message
 * Ajuste manual da mensagem institucional antes de copiar.
 *
 * As telas montam o texto a partir dos metadados (número, data, prazo, tipo).
 * Antes disso, o que estava na tela era exatamente o que ia para a área de
 * transferência: qualquer ajuste de última hora era feito depois de colar, fora
 * do app, e se perdia na próxima cópia.
 *
 * O rascunho guarda o texto gerado sobre o qual a edição começou (`base`). Quando
 * a geração muda — outro prazo, outro número, outro tipo de mensagem — a base
 * deixa de bater e a edição é descartada: um texto editado sobre "COM PRAZO"
 * continuaria dizendo "até o dia X" depois de a conferente trocar para "ALERTA",
 * e a mensagem copiada contradiria a configuração escolhida na tela.
 *
 * `of()` é chamado no meio da renderização, depois de a mensagem estar montada;
 * por isso o hook não recebe o texto — chamá-lo já com a mensagem obrigaria as
 * telas que fazem `return null` antes de gerá-la a reordenar o componente
 * inteiro.
 */
import { useCallback, useMemo, useState } from "react"

interface Draft {
	/** Texto gerado no momento em que a edição começou. */
	base: string
	/** Texto como está na mão do usuário. */
	text: string
}

/** Texto que vale agora: o do usuário quando existe rascunho, senão o gerado. */
export function resolveDraft(draft: Draft | undefined, generated: string): string {
	return draft !== undefined ? draft.text : generated
}

/**
 * O rascunho ficou para trás da geração?
 *
 * Trocar o tipo da mensagem, o prazo, o número ou a data reescreve o texto. O
 * rascunho NÃO é descartado nesse caso — quem digitou três parágrafos e depois
 * preencheu o número da mensagem perderia os três parágrafos sem aviso. Em vez
 * disso a tela avisa que o texto exibido é o da mão do usuário e oferece voltar
 * ao gerado, porque o inverso também é armadilha: copiar em silêncio um corpo que
 * ainda diz "até o dia X" depois de a mensagem virar ALERTA.
 */
export function isDraftStale(draft: Draft | undefined, generated: string): boolean {
	return draft !== undefined && draft.base !== generated
}

/**
 * Rascunhos depois de uma digitação.
 *
 * Voltar ao texto gerado na mão é o mesmo que não ter rascunho: guardar um
 * rascunho idêntico ao gerado o esconderia da tela (sem aviso de edição e sem
 * botão de restaurar) e ele seguiria mascarando as regerações seguintes.
 */
export function applyEdit(prev: Record<string, Draft>, key: string, generated: string, next: string): Record<string, Draft> {
	if (next !== generated) return { ...prev, [key]: { base: generated, text: next } }
	if (prev[key] === undefined) return prev
	const cleared = { ...prev }
	delete cleared[key]
	return cleared
}

export interface MessageDraft {
	/** Texto a exibir e a copiar. */
	text: string
	/** O texto exibido é o do usuário, não o gerado. */
	isEdited: boolean
	/** O texto gerado mudou depois da edição — o rascunho pode estar desatualizado. */
	isStale: boolean
	setText: (text: string) => void
	/** Descarta o rascunho e volta ao texto gerado. */
	reset: () => void
}

export interface MessageDrafts {
	of(key: string, generated: string): MessageDraft
	/** Descarta todos os rascunhos — a tela trocou de arquivo/análise. */
	resetAll(): void
}

/** Rascunhos por chave — para tela que lista uma mensagem por UG. */
export function useMessageDrafts(): MessageDrafts {
	const [drafts, setDrafts] = useState<Record<string, Draft>>({})

	const of = useCallback(
		(key: string, generated: string): MessageDraft => {
			const draft = drafts[key]
			const text = resolveDraft(draft, generated)
			return {
				text,
				isEdited: text !== generated,
				isStale: isDraftStale(draft, generated),
				setText: (next: string) => setDrafts((prev) => applyEdit(prev, key, generated, next)),
				reset: () =>
					setDrafts((prev) => {
						if (prev[key] === undefined) return prev
						const next = { ...prev }
						delete next[key]
						return next
					}),
			}
		},
		[drafts]
	)

	const resetAll = useCallback(() => setDrafts({}), [])

	return useMemo(() => ({ of, resetAll }), [of, resetAll])
}

/**
 * Chave da mensagem consolidada nas telas que também listam uma mensagem por UG.
 * Os dois underscores garantem que ela nunca colida com um código de UG.
 */
export const CONSOLIDATED_DRAFT_KEY = "__consolidada__"

const SINGLE = "single"

/** Rascunho único — para modal ou card que mostra uma mensagem só. */
export function useMessageDraft(): { of(generated: string): MessageDraft } {
	const drafts = useMessageDrafts()
	return useMemo(() => ({ of: (generated: string) => drafts.of(SINGLE, generated) }), [drafts])
}
