import { Plus, Trash } from "iconoir-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { Paragraph } from "@/lib/comaer/types"

/**
 * Editor das divisões do texto (art. 39): parágrafo › item › alínea › subalínea.
 *
 * A hierarquia é estrutura, não formatação digitada à mão. Quem digita "1.1" dentro do
 * texto perde a renumeração ao inserir um item node meio — e é justamente a renumeração que
 * a norma cobra.
 *
 * Os quatro níveis são o MESMO componente sobre uma árvore genérica: escrever um bloco de
 * JSX por nível deixaria a subalínea (o nível que quase ninguém usa) sem os botões que os
 * outros têm, e é assim que um nível some do editor sem ninguém notar.
 */

interface No {
	text: string
	children: No[]
}

const MAX_DEPTH = 4

function toNodes(paragraphs: Paragraph[]): No[] {
	return paragraphs.map((p) => ({
		text: p.text,
		children: (p.items ?? []).map((i) => ({
			text: i.text,
			children: (i.alineas ?? []).map((a) => ({ text: a.text, children: (a.subalineas ?? []).map((s) => ({ text: s.text, children: [] })) })),
		})),
	}))
}

function fromNodes(nodes: No[]): Paragraph[] {
	return nodes.map((p) => ({
		text: p.text,
		items: p.children.map((i) => ({
			text: i.text,
			alineas: i.children.map((a) => ({ text: a.text, subalineas: a.children.map((s) => ({ text: s.text })) })),
		})),
	}))
}

/** Aplica a mudança node caminho e devolve uma árvore nova — nada é mutado node lugar. */
function updateField(nodes: No[], path: number[], transform: (siblings: No[], index: number) => No[]): No[] {
	const [index, ...rest] = path
	if (rest.length === 0) return transform(nodes, index)
	return nodes.map((node, i) => (i === index ? { ...node, children: updateField(node.children, rest, transform) } : node))
}

/** Art. 39, parágrafo único: 1. / 1.1 / a) / – conforme a profundidade. */
function marker(path: number[]): string {
	const posicao = path[path.length - 1]
	switch (path.length) {
		case 1:
			return `${posicao + 1}.`
		case 2:
			return `${path[0] + 1}.${posicao + 1}`
		case 3:
			return `${String.fromCharCode(97 + posicao)})`
		default:
			return "-"
	}
}

const LEVEL_LABELS = ["Parágrafo", "Item", "Alínea", "Subalínea"] as const

export function BodyEditor({ paragraphs, onChange }: { paragraphs: Paragraph[]; onChange: (paragraphs: Paragraph[]) => void }) {
	const nodes = toNodes(paragraphs)
	const applyAt = (path: number[], transform: (siblings: No[], index: number) => No[]) => onChange(fromNodes(updateField(nodes, path, transform)))

	return (
		<div className="flex flex-col gap-3">
			<LevelEditor nodes={nodes} path={[]} applyAt={applyAt} />
			<Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange(fromNodes([...nodes, { text: "", children: [] }]))}>
				<Plus className="size-4" /> Parágrafo
			</Button>
		</div>
	)
}

function LevelEditor({
	nodes,
	path,
	applyAt,
}: {
	nodes: No[]
	path: number[]
	applyAt: (path: number[], transform: (siblings: No[], index: number) => No[]) => void
}) {
	return (
		<div className={path.length === 0 ? "flex flex-col gap-3" : "flex flex-col gap-2 pl-6 border-l border-border ml-2"}>
			{nodes.map((node, i) => {
				const nodePath = [...path, i]
				const level = nodePath.length
				return (
					<div key={i} className="flex flex-col gap-2">
						<div className="flex items-start gap-2">
							<span className="text-xs font-mono text-muted-foreground pt-2 w-8 shrink-0 text-right">{marker(nodePath)}</span>
							<Textarea
								value={node.text}
								onChange={(e) => applyAt(nodePath, (siblings, index) => siblings.map((n, k) => (k === index ? { ...n, text: e.target.value } : n)))}
								rows={level === 1 ? 3 : 2}
								placeholder={`Texto ${level === 1 ? "do parágrafo" : level === 2 ? "do item" : level === 3 ? "da alínea" : "da subalínea"}`}
								// O marcador ao lado é um `span`: sem o nome aqui, esta é a principal superfície
								// de escrita da ferramenta e se apresenta como N campos idênticos.
								aria-label={`${LEVEL_LABELS[level - 1]} ${marker(nodePath)}`}
								className="flex-1"
							/>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								aria-label={`Remover ${LEVEL_LABELS[level - 1]} ${marker(nodePath)}`}
								onClick={() => applyAt(nodePath, (siblings, index) => siblings.filter((_, k) => k !== index))}
							>
								<Trash className="size-4" />
							</Button>
						</div>

						{node.children.length > 0 && <LevelEditor nodes={node.children} path={nodePath} applyAt={applyAt} />}

						{level < MAX_DEPTH && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="self-start ml-10"
								onClick={() =>
									applyAt(nodePath, (siblings, index) =>
										siblings.map((n, k) => (k === index ? { ...n, children: [...n.children, { text: "", children: [] }] } : n))
									)
								}
							>
								<Plus className="size-4" /> {LEVEL_LABELS[level]}
							</Button>
						)}
					</div>
				)
			})}
		</div>
	)
}
