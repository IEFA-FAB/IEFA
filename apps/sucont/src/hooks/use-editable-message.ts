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

/** Texto que vale agora: o rascunho, se ele ainda for sobre esta geração. */
export function resolveDraft(draft: Draft | undefined, generated: string): string {
	return draft !== undefined && draft.base === generated ? draft.text : generated
}

export interface MessageDraft {
	/** Texto a exibir e a copiar. */
	text: string
	/** Há edição manual válida para esta geração? */
	isEdited: boolean
	setText: (text: string) => void
	/** Descarta o rascunho e volta ao texto gerado. */
	reset: () => void
}

export interface MessageDrafts {
	of(key: string, generated: string): MessageDraft
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
				setText: (next: string) => setDrafts((prev) => ({ ...prev, [key]: { base: generated, text: next } })),
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

	return useMemo(() => ({ of }), [of])
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
