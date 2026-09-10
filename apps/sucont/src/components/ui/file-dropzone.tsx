import { FileSpreadsheet, UploadCloud, X } from "lucide-react"
import { useCallback, useId, useState } from "react"
import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"

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
 * é o TEXTO — chamada, formato aceito e colunas exigidas —, porque isso é o
 * conteúdo; forma, cor e estado de arraste não são negociáveis.
 *
 * O `<input type="file">` é nativo de propósito: o primitivo `Input` é text-like
 * e não cobre este campo. É a exceção já registrada no STYLE_CONTRACT §8.
 */
interface FileDropzoneProps {
	/** Formatos aceitos, no formato do atributo `accept`. */
	accept: string
	/** Recebe o que foi solto ou escolhido. Sempre uma lista — vazia nunca chega. */
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
	/** Nome do arquivo já escolhido, no fluxo de arquivo único. Substitui a chamada. */
	selectedName?: string | null
	className?: string
}

export function FileDropzone({
	accept,
	onFiles,
	multiple = false,
	prompt = "ou arraste e solte",
	hint,
	columns,
	isLoading = false,
	loadingLabel = "Lendo o arquivo…",
	selectedName,
	className,
}: FileDropzoneProps) {
	const inputId = useId()
	const [isDragging, setIsDragging] = useState(false)

	const emit = useCallback(
		(list: FileList | null) => {
			if (!list?.length) return
			onFiles(Array.from(list))
		},
		[onFiles]
	)

	const handleDrag = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(e.type === "dragenter" || e.type === "dragover")
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			e.stopPropagation()
			setIsDragging(false)
			if (isLoading) return
			emit(e.dataTransfer.files)
		},
		[emit, isLoading]
	)

	return (
		<label
			htmlFor={inputId}
			className={cn(
				"flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors",
				"focus-within:ring-[3px] focus-within:ring-ring/50",
				isDragging || selectedName ? "border-action bg-action/5" : "border-border bg-muted/50 hover:border-border/80 hover:bg-muted",
				isLoading && "pointer-events-none opacity-50",
				className
			)}
			onDragEnter={handleDrag}
			onDragLeave={handleDrag}
			onDragOver={handleDrag}
			onDrop={handleDrop}
		>
			<UploadCloud className={cn("mb-4 h-11 w-11", isLoading ? "animate-pulse text-muted-foreground" : "text-muted-foreground")} />

			<p className="mb-1 text-subheading text-foreground">
				{isLoading ? (
					loadingLabel
				) : selectedName ? (
					selectedName
				) : (
					<>
						<span className="font-semibold text-action">Clique para enviar</span> {prompt}
					</>
				)}
			</p>
			<p className="text-caption text-muted-foreground">{hint}</p>

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
 * Lista dos arquivos já escolhidos, sob a zona de envio.
 *
 * Só o fluxo de vários arquivos precisa dela — o de arquivo único mostra o nome
 * dentro da própria zona (`selectedName`).
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
