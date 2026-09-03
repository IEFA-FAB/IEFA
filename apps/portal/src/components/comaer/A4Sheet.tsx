import type React from "react"
import { useEffect, useRef, useState } from "react"
import type { AssembledDocument, EditTarget, Line } from "@/lib/comaer/types"

/**
 * A folha, com as medidas do art. 20 da NSCA 5-3/2026: margens 2 cm (superior, inferior e
 * direita) e 3 cm (esquerda), fonte Calibri/Carlito em 12 pt, texto justificado.
 *
 * Ela renderiza os MESMOS blocos que o serializador copia para o SIGADAER — a tela é uma
 * apresentação da estrutura, não uma segunda versão dela.
 */
export function A4Sheet({
	doc,
	highlight = [],
	onEdit,
}: {
	doc: AssembledDocument
	/** Blocos alterados no último turno da conversa. */
	highlight?: string[]
	/** Quando presente, as linhas que sabem sua origem viram editáveis no próprio papel. */
	onEdit?: (target: EditTarget, value: string) => void
}) {
	// Blocos com pendência apontada pela conferência — marcados na própria folha, que é
	// onde a pessoa olha. Antes a lista só existia no rodapé do painel de exportação.
	const withFinding = new Map(doc.warnings.filter((w) => w.block).map((w) => [w.block as string, w.severity]))
	return (
		<div
			data-sheet
			className="bg-white text-black w-[210mm] min-h-[297mm] border border-border shadow-none pt-[2cm] pr-[2cm] pb-[2cm] pl-[3cm] print:border-0 print:w-auto print:min-h-0 print:p-0"
			style={{ fontFamily: "Calibri, Carlito, Segoe UI, sans-serif", fontSize: "12pt", lineHeight: 1.35 }}
		>
			{doc.blocks.map((bloco) => (
				<section
					key={bloco.id}
					data-block={bloco.id}
					data-changed={highlight.includes(bloco.id) ? "true" : undefined}
					data-finding={withFinding.get(bloco.id)}
					// Destaque do turno: contorno, não fundo colorido — a folha é o documento que
					// vai ser impresso, e ele não pode ganhar cor por causa da conversa. Some na
					// impressão pela mesma razão.
					className={`${blockSpacing(bloco.id)} ${
						highlight.includes(bloco.id)
							? // Preto fixo, não `--foreground`: a folha é sempre branca, e o token de tema
								// deixava o destaque branco-sobre-branco no tema escuro — o único sinal de
								// que a IA mexeu no documento sumia para metade dos usuários.
								"outline outline-2 outline-offset-2 outline-black/60 print:outline-none"
							: withFinding.has(bloco.id)
								? "outline outline-1 outline-offset-2 outline-dashed outline-black/30 print:outline-none"
								: ""
					}`}
					// Equivalente textual: o contorno é visual, e "3 alterações neste turno" não diz
					// ONDE sem isto.
					aria-label={`${bloco.label}${highlight.includes(bloco.id) ? " — alterado neste turno" : ""}${withFinding.has(bloco.id) ? " — com pendência" : ""}`}
				>
					{bloco.lines.map((linha, i) => (
						<SheetLine key={`${bloco.id}-${i}`} linha={linha} onEdit={onEdit} />
					))}
				</section>
			))}
		</div>
	)
}

/** Espaço vertical entre blocos — o art. 20 mede em pontos; aqui em múltiplos de 0,21 cm. */
function blockSpacing(id: string): string {
	switch (id) {
		case "timbre":
			return "mb-[0.42cm]"
		case "epigrafe":
			return "mb-[0.84cm]"
		case "texto":
			return "mt-[0.42cm] mb-[1.41cm]"
		case "signatario":
			// Art. 40 § 3º: quarenta pontos (1,41 cm) abaixo do final do texto.
			return "mt-[1.41cm]"
		case "rodape-om":
			return "mt-[1.41cm] text-[10pt]"
		default:
			return "mb-[0.21cm]"
	}
}

/**
 * Art. 20, II, a c/c art. 39: o número do parágrafo fica NA margem esquerda e o texto
 * começa a 2,5 cm dela — recuo pendente, não recuo de primeira linha. Sem o `textIndent`
 * negativo, o "1." andaria junto com o texto e a coluna de números sumiria.
 */
function indent(linha: Line): React.CSSProperties | undefined {
	if (!linha.indentCm) return undefined
	return { paddingLeft: `${linha.indentCm}cm`, textIndent: linha.indentCm === 2.5 ? "-2.5cm" : undefined }
}

function SheetLine({ linha, onEdit }: { linha: Line; onEdit?: (target: EditTarget, value: string) => void }) {
	const alignment =
		linha.alignment === "centro"
			? "text-center"
			: linha.alignment === "direita"
				? "text-right"
				: linha.alignment === "justificado"
					? "text-justify"
					: "text-left"
	const conteudo = linha.bold ? <strong>{linha.text}</strong> : linha.text

	// Numeração à esquerda e localidade/data à direita dividem a linha (art. 35, III).
	if (linha.rightOnSameLine) {
		return (
			<div className="flex items-baseline justify-between gap-4">
				<span>{conteudo}</span>
				<span>{linha.rightOnSameLine}</span>
			</div>
		)
	}

	// Linha que sabe sua origem é editável no lugar: trocar um número não deveria exigir
	// voltar ao formulário nem pedir à IA.
	if (onEdit && linha.edit) {
		return (
			<EditableLine
				line={linha}
				className={alignment}
				style={indent(linha)}
				onCommit={(value) => {
					if (linha.edit) onEdit(linha.edit.target, value)
				}}
			/>
		)
	}

	return (
		<p className={alignment} style={indent(linha)}>
			{conteudo}
		</p>
	)
}

/**
 * Linha editável: mostra o texto MONTADO e edita o texto CRU.
 *
 * A caixa abre com `edit.value` — sem o "1." do parágrafo nem o "Assunto: " da ementa —
 * porque é o valor cru que volta para o documento; abrir com o texto montado gravaria o
 * marcador dentro do próprio campo na segunda edição.
 *
 * Enter confirma, Escape descarta, sair do campo confirma. Textarea em vez de
 * `contentEditable`: com `contentEditable` a folha remonta a cada tecla, o cursor pula
 * para o começo e a edição fica impossível em texto longo.
 */
function EditableLine({ line, className, style, onCommit }: { line: Line; className: string; style?: React.CSSProperties; onCommit: (value: string) => void }) {
	const [editing, setEditing] = useState(false)
	const [value, setValue] = useState(line.edit?.value ?? "")
	const field = useRef<HTMLTextAreaElement>(null)
	const trigger = useRef<HTMLButtonElement>(null)
	// Ao sair da edição o textarea desmonta com o foco dentro e o foco cai no `<body>`:
	// quem usa teclado voltava ao topo da folha a cada correção.
	const returnFocus = useRef(false)

	useEffect(() => {
		if (!editing) setValue(line.edit?.value ?? "")
	}, [line.edit?.value, editing])

	useEffect(() => {
		if (editing) field.current?.focus()
		else if (returnFocus.current) {
			returnFocus.current = false
			trigger.current?.focus()
		}
	}, [editing])

	const commit = () => {
		returnFocus.current = true
		setEditing(false)
		if (value !== line.edit?.value) onCommit(value)
	}

	if (!editing) {
		return (
			<button
				ref={trigger}
				type="button"
				onClick={() => setEditing(true)}
				// Sublinhado pontilhado permanente: em toque não existe hover, e sem uma marca
				// visível a folha parece estática — ninguém descobre que dá para corrigir aqui.
				className={`${className} block w-full text-inherit bg-transparent border-0 p-0 cursor-text underline decoration-dotted decoration-black/25 underline-offset-4 hover:bg-black/[0.04] hover:decoration-black/60 print:no-underline print:hover:bg-transparent`}
				style={style}
				aria-label={`${line.text} — editar esta linha`}
			>
				{line.bold ? <strong>{line.text}</strong> : line.text}
			</button>
		)
	}

	return (
		<textarea
			ref={field}
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				// Enter quebra linha — é o gesto natural dentro de um parágrafo. Confirmar é
				// Ctrl/Cmd+Enter, ou sair do campo.
				if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
					e.preventDefault()
					commit()
				}
				if (e.key === "Escape") {
					setValue(line.edit?.value ?? "")
					returnFocus.current = true
					setEditing(false)
				}
			}}
			// Conta as quebras de linha, não só o comprimento: parágrafo com quebras abria com
			// altura errada e o texto sumia para fora do campo.
			rows={Math.max(1, value.split("\n").length, Math.ceil(value.length / 90))}
			className={`${className} block w-full bg-transparent border border-black/40 p-0 resize-none font-[inherit] text-[inherit] leading-[inherit] print:border-0`}
			style={style}
			aria-label="Editar esta linha do documento. Ctrl+Enter confirma, Esc descarta."
		/>
	)
}
