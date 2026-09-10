import { FileSpreadsheet, UploadCloud, X } from "lucide-react"
import { useId, useState } from "react"
import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"

/**
 * Formatos aceitos, uma vez só. Estavam digitados em oito call sites, e um
 * já tinha divergido (`.xlsx,.xls,.csv` sem os MIME types).
 */
export const EXCEL_ACCEPT = ".xlsx,.xls"
export const SPREADSHEET_ACCEPT = ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"

/**
 * O `accept` filtra a JANELA de escolha, não o que é ARRASTADO. Esta é a
 * conferência que os dois caminhos compartilham — morava copiada em três rotas
 * (cada uma com a sua mensagem) e faltava numa quarta, onde um `.csv` solto
 * chegava inteiro ao parser.
 */
export function isAcceptedFile(file: File, accept: string): boolean {
	const name = file.name.toLowerCase()
	return accept
		.split(",")
		.map((token) => token.trim().toLowerCase())
		.some((token) => (token.startsWith(".") ? name.endsWith(token) : token !== "" && file.type === token))
}

function acceptedExtensions(accept: string): string {
	return accept
		.split(",")
		.map((token) => token.trim())
		.filter((token) => token.startsWith("."))
		.join(", ")
}

/**
 * Zona de envio do sucont — a única.
 *
 * Existiam sete, uma por ferramenta portada: alturas `h-56`, `h-64`, `p-8`,
 * `p-10` e `p-12`; ícone de 32, 44 e 48px, um deles dentro de um disco tintado;
 * o realce de arraste em `action`, em `tech-cyan` e em `ring`; a chamada ora em
 * `.text-subheading`, ora em `.text-heading`, ora em `font-medium` sem tamanho.
 * Duas variavam também o ALVO de clique (`<label>` num caso, `<button>` que
 * dispara `.click()` no outro, `<input>` transparente por cima no terceiro), o
 * que fazia o foco de teclado se comportar diferente em cada tela.
 *
 * Aqui a forma é uma só e o comportamento também. O que a ferramenta pode mudar
 * é o TEXTO — formato aceito e colunas exigidas —, porque isso é o conteúdo;
 * forma, cor e estado de arraste não são negociáveis.
 *
 * O `<input type="file">` é nativo de propósito: o primitivo `Input` é text-like
 * e não cobre este campo. É a exceção já registrada no STYLE_CONTRACT §8.
 */
interface FileDropzoneProps {
	/** `id` do campo, quando algo de fora precisa alcançá-lo (os specs e2e do DGC). */
	id?: string
	/** Formatos aceitos, no formato do atributo `accept`. Ver `EXCEL_ACCEPT` / `SPREADSHEET_ACCEPT`. */
	accept: string
	/** Recebe o que foi solto ou escolhido E passou no `accept`. Sempre uma lista — vazia nunca chega. */
	onFiles: (files: File[]) => void
	/** Aceita mais de um arquivo por vez. */
	multiple?: boolean
	/** Complemento da chamada, depois de "Clique para enviar". */
	prompt?: string
	/** Uma linha sobre o formato esperado. */
	hint: string
	/**
	 * Colunas que o parser exige, como pílulas sob a chamada.
	 *
	 * Cada tela dizia isso de um jeito: lista com marcadores num card à parte,
	 * frase corrida dentro da própria zona, ou nada. Quem envia a planilha
	 * precisa da informação ANTES de escolher o arquivo, e no mesmo lugar.
	 */
	columns?: readonly string[]
	/** Enquanto verdadeiro, a zona não aceita arquivo e mostra `loadingLabel`. */
	isLoading?: boolean
	loadingLabel?: string
	className?: string
}

export function FileDropzone({
	id,
	accept,
	onFiles,
	multiple = false,
	prompt = "ou arraste o relatório",
	hint,
	columns,
	isLoading = false,
	loadingLabel = "Lendo a planilha…",
	className,
}: FileDropzoneProps) {
	const generatedId = useId()
	const inputId = id ?? generatedId
	const [isDragging, setIsDragging] = useState(false)
	const [rejected, setRejected] = useState<string | null>(null)

	function emit(list: FileList | null) {
		if (!list?.length) return
		const files = Array.from(list)
		const accepted = files.filter((file) => isAcceptedFile(file, accept))
		if (accepted.length === 0) {
			setRejected(`Formato não aceito. Envie ${acceptedExtensions(accept)}.`)
			return
		}
		setRejected(null)
		onFiles(accepted)
	}

	function handleDrag(e: React.DragEvent) {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(e.type === "dragenter" || e.type === "dragover")
	}

	function handleDrop(e: React.DragEvent) {
		// `preventDefault` SEMPRE, inclusive carregando: sem o handler ativo o drop
		// cai no documento e o navegador navega para o arquivo solto, descartando
		// a leitura em curso e todo rascunho de mensagem da tela.
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(false)
		if (isLoading) return
		emit(e.dataTransfer.files)
	}

	return (
		<label
			htmlFor={inputId}
			aria-busy={isLoading || undefined}
			className={cn(
				"flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors",
				"focus-within:ring-[3px] focus-within:ring-ring/50",
				isDragging ? "border-action bg-action/5" : "border-border bg-muted/50 hover:border-border/80 hover:bg-muted",
				isLoading && "cursor-wait opacity-50",
				className
			)}
			onDragEnter={handleDrag}
			onDragLeave={handleDrag}
			onDragOver={handleDrag}
			onDrop={handleDrop}
		>
			<UploadCloud className={cn("mb-4 h-11 w-11 text-muted-foreground", isLoading && "animate-pulse")} />

			<p className="mb-1 text-subheading text-foreground">
				{isLoading ? (
					loadingLabel
				) : (
					<>
						<span className="font-semibold text-action">Clique para enviar</span> {prompt}
					</>
				)}
			</p>
			<p className="text-caption text-muted-foreground">{hint}</p>
			{rejected && (
				<p className="mt-2 text-caption text-destructive" role="alert">
					{rejected}
				</p>
			)}

			{columns && columns.length > 0 && (
				<div className="mt-6 flex flex-col items-center gap-2">
					<span className="text-label text-muted-foreground">Colunas exigidas</span>
					<div className="flex flex-wrap justify-center gap-2">
						{columns.map((column) => (
							<span key={column} className="rounded-md border border-border bg-card px-2 py-0.5 text-caption text-foreground">
								{column}
							</span>
						))}
					</div>
				</div>
			)}

			<input
				id={inputId}
				type="file"
				accept={accept}
				multiple={multiple}
				className="sr-only"
				disabled={isLoading}
				onChange={(e) => {
					emit(e.target.files)
					// Zera o campo para que reescolher o MESMO arquivo dispare `change`
					// de novo — depois de um erro de parse, era o gesto natural e não
					// acontecia nada.
					e.target.value = ""
				}}
			/>
		</label>
	)
}

/**
 * Lista dos arquivos já escolhidos, sob a zona de envio. Só o fluxo de vários
 * arquivos precisa dela.
 */
export function FileDropzoneList({ files, onRemove, disabled }: { files: readonly File[]; onRemove: (file: File) => void; disabled?: boolean }) {
	if (files.length === 0) return null

	return (
		<ul className="space-y-2">
			{files.map((file) => (
				<li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
					<span className="flex min-w-0 items-center gap-3">
						<FileSpreadsheet className="h-4 w-4 shrink-0 text-action" />
						<span className="truncate text-body text-foreground">{file.name}</span>
					</span>
					<Button
						type="button"
						onClick={() => onRemove(file)}
						disabled={disabled}
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground hover:bg-transparent hover:text-destructive disabled:opacity-40"
						aria-label={`Remover ${file.name}`}
					>
						<X className="h-4 w-4" />
					</Button>
				</li>
			))}
		</ul>
	)
}
