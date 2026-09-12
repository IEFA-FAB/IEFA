import { Check, Copy, Download, Loader2, Printer, ShieldAlert } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

/**
 * Os dez códigos de recuperação, exibidos UMA ÚNICA VEZ.
 *
 * O que persiste no banco é o SHA-256 — depois que este diálogo fecha, nem o sistema nem o
 * suporte conseguem recuperar o texto. Daí as três formas de guardar (copiar, baixar,
 * imprimir) e a confirmação obrigatória antes de concluir: quem fecha sem guardar perde o
 * caminho de volta e só descobre no dia em que o celular sumir.
 *
 * O diálogo não tem botão de fechar no canto nem fecha por clique fora — a única saída é o
 * botão, e ele só habilita depois da confirmação.
 */

interface RecoveryCodesDialogProps {
	open: boolean
	codes: string[]
	/** `false` quando não há provider de e-mail: a tela diz que não haverá aviso (design.md D16). */
	emailNoticeAvailable?: boolean
	/** Chamado quando o usuário confirma que guardou os códigos. */
	onDone: () => void
	isFinishing?: boolean
}

/** Conteúdo em texto puro — o mesmo que vai para a área de transferência, o arquivo e a folha. */
function plainText(codes: string[]): string {
	return [
		"SISUB — códigos de recuperação da verificação em duas etapas",
		"",
		"Cada código funciona UMA única vez e remove a verificação em duas etapas da sua conta.",
		"Guarde em local seguro, fora do computador e fora do e-mail.",
		"",
		...codes.map((code, index) => `${String(index + 1).padStart(2, "0")}. ${code}`),
		"",
		`Gerados em ${new Date().toLocaleString("pt-BR")}.`,
	].join("\n")
}

export function RecoveryCodesDialog({ open, codes, emailNoticeAvailable = true, onDone, isFinishing = false }: RecoveryCodesDialogProps) {
	const [confirmed, setConfirmed] = useState(false)
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		await navigator.clipboard.writeText(plainText(codes))
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	const handleDownload = () => {
		// `Blob` + link temporário: não há rota de download, e não deve haver — o texto claro
		// não pode atravessar o servidor uma segunda vez.
		const url = URL.createObjectURL(new Blob([plainText(codes)], { type: "text/plain;charset=utf-8" }))
		const link = document.createElement("a")
		link.href = url
		link.download = "sisub-codigos-de-recuperacao.txt"
		link.click()
		URL.revokeObjectURL(url)
	}

	const handlePrint = () => {
		// Janela própria em vez de `window.print()` na página: imprimir a tela levaria junto o
		// menu, o cabeçalho e o resto do app — e o que precisa ir para o papel são os códigos.
		//
		// Montado por DOM, e não por `document.write`/`innerHTML`: os códigos são texto que o
		// servidor acabou de gerar, e `textContent` os trata como texto em qualquer hipótese.
		const sheet = window.open("", "_blank", "width=600,height=700")
		if (!sheet) return

		const doc = sheet.document
		doc.title = "SISUB — códigos de recuperação"

		const style = doc.createElement("style")
		style.textContent =
			"body{font-family:system-ui,sans-serif;padding:2rem;line-height:1.6}ol{font-family:ui-monospace,monospace;font-size:1.1rem}li{margin:.25rem 0}"
		doc.head.append(style)

		const title = doc.createElement("h1")
		title.textContent = "SISUB — códigos de recuperação"

		const intro = doc.createElement("p")
		intro.textContent = "Cada código funciona uma única vez e remove a verificação em duas etapas da sua conta. Guarde esta folha em local seguro."

		const list = doc.createElement("ol")
		for (const code of codes) {
			const item = doc.createElement("li")
			item.textContent = code
			list.append(item)
		}

		const footer = doc.createElement("p")
		footer.textContent = `Gerados em ${new Date().toLocaleString("pt-BR")}.`

		doc.body.append(title, intro, list, footer)
		sheet.print()
	}

	return (
		<Dialog open={open}>
			<DialogContent showCloseButton={false} className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Guarde seus códigos de recuperação</DialogTitle>
					<DialogDescription>
						São {codes.length} códigos de uso único. Eles devolvem o acesso à sua conta se você perder o aparelho com o aplicativo autenticador.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-lg border bg-muted/40 p-4">
					<ol className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-body">
						{codes.map((code, index) => (
							<li key={code} className="flex items-center gap-2">
								<span className="text-caption text-muted-foreground tabular-nums">{String(index + 1).padStart(2, "0")}</span>
								<span className="select-all tracking-wide">{code}</span>
							</li>
						))}
					</ol>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button type="button" variant="outline" size="sm" onClick={handleCopy}>
						{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
						{copied ? "Copiado" : "Copiar"}
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={handleDownload}>
						<Download className="size-4" aria-hidden />
						Baixar
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={handlePrint}>
						<Printer className="size-4" aria-hidden />
						Imprimir
					</Button>
				</div>

				<Alert>
					<ShieldAlert aria-hidden />
					<AlertTitle>Esta é a única vez que eles aparecem</AlertTitle>
					<AlertDescription>
						O sistema guarda apenas um resumo criptográfico de cada código — nem o suporte consegue mostrá-los de novo. Não guarde no e-mail: quem tiver acesso
						à caixa teria, junto, o caminho de volta.
						{emailNoticeAvailable === false && " O uso de um código não gera aviso por e-mail neste ambiente; o registro fica no histórico do sistema."}
					</AlertDescription>
				</Alert>

				<Label className="flex items-start gap-3 text-body font-normal">
					<Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} />
					<span>Guardei meus códigos de recuperação em local seguro.</span>
				</Label>

				<DialogFooter>
					<Button type="button" disabled={!confirmed || isFinishing} onClick={onDone}>
						{isFinishing && <Loader2 className="size-4 animate-spin" aria-hidden />}
						Concluir
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
