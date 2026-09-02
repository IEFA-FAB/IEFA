import { Check, Copy, WarningTriangle } from "iconoir-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { camposParaCopia, copiarDocumento, paraHtml, paraTextoPlano } from "@/lib/comaer/sigadaer"
import type { DocumentoMontado } from "@/lib/comaer/tipos"

/**
 * Saída para o SIGADAER.
 *
 * O documento inteiro E cada campo isolado: o formulário do SIGADAER tem caixas separadas
 * (assunto, destinatário, corpo), e um único botão "copiar tudo" obrigaria a recortar o
 * texto de volta à mão — que é onde se perde a numeração de parágrafo.
 */
export function PainelExportacao({ doc }: { doc: DocumentoMontado }) {
	const campos = camposParaCopia(doc)

	return (
		<div className="flex flex-col gap-4">
			<BotaoCopiar rotulo="Copiar documento inteiro" texto={paraTextoPlano(doc)} html={paraHtml(doc)} className="w-full justify-center" variante="default" />

			<div className="flex flex-col">
				<h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Copiar campo a campo</h3>
				<ul className="flex flex-col border border-border divide-y divide-border">
					{campos.map((campo) => (
						<li key={campo.id} className="flex items-center justify-between gap-3 px-3 py-2">
							<div className="min-w-0">
								<p className="text-sm font-medium">{campo.rotulo}</p>
								<p className="text-xs text-muted-foreground truncate">{campo.texto.split("\n")[0]}</p>
							</div>
							<BotaoCopiar rotulo="Copiar" texto={campo.texto} html={campo.html} variante="ghost" />
						</li>
					))}
				</ul>
			</div>

			{doc.avisos.length > 0 && (
				<Alert variant="destructive">
					<WarningTriangle />
					<AlertTitle>Conferir antes de despachar</AlertTitle>
					<AlertDescription>
						<ul className="list-disc pl-4 flex flex-col gap-1">
							{doc.avisos.map((aviso) => (
								<li key={aviso}>{aviso}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}
		</div>
	)
}

function BotaoCopiar({
	rotulo,
	texto,
	html,
	className,
	variante,
}: {
	rotulo: string
	texto: string
	html: string
	className?: string
	variante: "default" | "ghost"
}) {
	const [estado, setEstado] = useState<"pronto" | "copiado" | "erro">("pronto")

	const copiar = async () => {
		try {
			await copiarDocumento({ texto, html })
			setEstado("copiado")
		} catch {
			// Navegador sem permissão de área de transferência: dizer que copiou seria pior
			// que o erro — o usuário colaria o conteúdo anterior no SIGADAER sem perceber.
			setEstado("erro")
		}
		setTimeout(() => setEstado("pronto"), 2000)
	}

	return (
		<Button type="button" variant={variante} size="sm" onClick={copiar} className={className}>
			{estado === "copiado" ? <Check className="size-4" /> : <Copy className="size-4" />}
			{estado === "copiado" ? "Copiado" : estado === "erro" ? "Falhou — copie manualmente" : rotulo}
		</Button>
	)
}
