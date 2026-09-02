import { Plus, Trash } from "iconoir-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { Paragrafo } from "@/lib/comaer/tipos"

/**
 * Editor das divisões do texto (art. 39): parágrafo › item › alínea › subalínea.
 *
 * A hierarquia é estrutura, não formatação digitada à mão. Quem digita "1.1" dentro do
 * texto perde a renumeração ao inserir um item no meio — e é justamente a renumeração que
 * a norma cobra.
 *
 * Os quatro níveis são o MESMO componente sobre uma árvore genérica: escrever um bloco de
 * JSX por nível deixaria a subalínea (o nível que quase ninguém usa) sem os botões que os
 * outros têm, e é assim que um nível some do editor sem ninguém notar.
 */

interface No {
	texto: string
	filhos: No[]
}

const PROFUNDIDADE_MAXIMA = 4

function paraNos(paragrafos: Paragrafo[]): No[] {
	return paragrafos.map((p) => ({
		texto: p.texto,
		filhos: (p.itens ?? []).map((i) => ({
			texto: i.texto,
			filhos: (i.alineas ?? []).map((a) => ({ texto: a.texto, filhos: (a.subalineas ?? []).map((s) => ({ texto: s.texto, filhos: [] })) })),
		})),
	}))
}

function deNos(nos: No[]): Paragrafo[] {
	return nos.map((p) => ({
		texto: p.texto,
		itens: p.filhos.map((i) => ({
			texto: i.texto,
			alineas: i.filhos.map((a) => ({ texto: a.texto, subalineas: a.filhos.map((s) => ({ texto: s.texto })) })),
		})),
	}))
}

/** Aplica a mudança no caminho e devolve uma árvore nova — nada é mutado no lugar. */
function alterar(nos: No[], caminho: number[], transformar: (irmaos: No[], indice: number) => No[]): No[] {
	const [indice, ...resto] = caminho
	if (resto.length === 0) return transformar(nos, indice)
	return nos.map((no, i) => (i === indice ? { ...no, filhos: alterar(no.filhos, resto, transformar) } : no))
}

/** Art. 39, parágrafo único: 1. / 1.1 / a) / – conforme a profundidade. */
function marcador(caminho: number[]): string {
	const posicao = caminho[caminho.length - 1]
	switch (caminho.length) {
		case 1:
			return `${posicao + 1}.`
		case 2:
			return `${caminho[0] + 1}.${posicao + 1}`
		case 3:
			return `${String.fromCharCode(97 + posicao)})`
		default:
			return "-"
	}
}

const ROTULO_NIVEL = ["Parágrafo", "Item", "Alínea", "Subalínea"] as const

export function EditorTexto({ paragrafos, onChange }: { paragrafos: Paragrafo[]; onChange: (paragrafos: Paragrafo[]) => void }) {
	const nos = paraNos(paragrafos)
	const aplicar = (caminho: number[], transformar: (irmaos: No[], indice: number) => No[]) => onChange(deNos(alterar(nos, caminho, transformar)))

	return (
		<div className="flex flex-col gap-3">
			<NivelEditor nos={nos} caminho={[]} aplicar={aplicar} />
			<Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange(deNos([...nos, { texto: "", filhos: [] }]))}>
				<Plus className="size-4" /> Parágrafo
			</Button>
		</div>
	)
}

function NivelEditor({
	nos,
	caminho,
	aplicar,
}: {
	nos: No[]
	caminho: number[]
	aplicar: (caminho: number[], transformar: (irmaos: No[], indice: number) => No[]) => void
}) {
	return (
		<div className={caminho.length === 0 ? "flex flex-col gap-3" : "flex flex-col gap-2 pl-6 border-l border-border ml-2"}>
			{nos.map((no, i) => {
				const meuCaminho = [...caminho, i]
				const nivel = meuCaminho.length
				return (
					<div key={i} className="flex flex-col gap-2">
						<div className="flex items-start gap-2">
							<span className="text-xs font-mono text-muted-foreground pt-2 w-8 shrink-0 text-right">{marcador(meuCaminho)}</span>
							<Textarea
								value={no.texto}
								onChange={(e) => aplicar(meuCaminho, (irmaos, indice) => irmaos.map((n, k) => (k === indice ? { ...n, texto: e.target.value } : n)))}
								rows={nivel === 1 ? 3 : 2}
								placeholder={`Texto ${nivel === 1 ? "do parágrafo" : nivel === 2 ? "do item" : nivel === 3 ? "da alínea" : "da subalínea"}`}
								className="flex-1"
							/>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								aria-label={`Remover ${ROTULO_NIVEL[nivel - 1]} ${marcador(meuCaminho)}`}
								onClick={() => aplicar(meuCaminho, (irmaos, indice) => irmaos.filter((_, k) => k !== indice))}
							>
								<Trash className="size-4" />
							</Button>
						</div>

						{no.filhos.length > 0 && <NivelEditor nos={no.filhos} caminho={meuCaminho} aplicar={aplicar} />}

						{nivel < PROFUNDIDADE_MAXIMA && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="self-start ml-10"
								onClick={() =>
									aplicar(meuCaminho, (irmaos, indice) => irmaos.map((n, k) => (k === indice ? { ...n, filhos: [...n.filhos, { texto: "", filhos: [] }] } : n)))
								}
							>
								<Plus className="size-4" /> {ROTULO_NIVEL[nivel]}
							</Button>
						)}
					</div>
				)
			})}
		</div>
	)
}
