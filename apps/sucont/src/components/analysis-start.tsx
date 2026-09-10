import { AlertCircle } from "lucide-react"
import type React from "react"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"

/**
 * Tela inicial de uma ferramenta de análise: a ordem, uma vez só.
 *
 * As sete ferramentas que começam por enviar uma planilha abriam em sete ordens
 * diferentes. O cruzamento punha título, enunciado do RAC e dois acordeões ANTES
 * da zona de envio — quem já sabia o que ia fazer rolava três dobras para achar
 * o campo. A compatibilidade abria por três cartões explicativos e escondia o
 * envio dentro de um card no fim. O subitens começava pelo envio, o monitoramento
 * também, mas com o resto em outra sequência. Nenhuma dessas ordens estava
 * errada por si; o que estava errado era haver sete.
 *
 * A ordem daqui em diante, e o motivo de cada degrau:
 *
 * 1. **A tarefa** — a zona de envio. Quem chega já sabe o que veio fazer; o
 *    campo é a primeira coisa na tela, sem rolagem.
 * 2. **A falha** — imediatamente sob o campo, porque é sobre o campo que ela
 *    fala. Erro no rodapé faz o operador reenviar o mesmo arquivo sem saber.
 * 3. **O que pertence ao ato de enviar** — lista de arquivos, botão de carregar.
 *
 * Onde extrair o relatório, o referencial do RAC e o que a ferramenta faz saíram
 * daqui: são o `AnalysisGuide`, na gaveta "Orientações" do cabeçalho. Ficaram
 * um dia abaixo da zona, em três cards iguais nas sete telas, e quem usa a
 * ferramenta toda competência rolava por eles todo dia. Informação de primeira
 * visita mora a um clique, não na dobra.
 *
 * A largura é fixa e menor que a do conteúdo, inclusive nas telas `wide`: o
 * resultado é tabela e precisa da folha inteira, mas o formulário de entrada de
 * um campo, não.
 */
interface AnalysisStartProps {
	/** A zona de envio. Normalmente `<FileDropzone />`. */
	dropzone: React.ReactNode
	/** Mensagem de falha da leitura. `null` quando não houve. */
	error?: string | null
	errorTitle?: string
	/**
	 * Conteúdo sob a zona de envio — lista de arquivos escolhidos, botão de
	 * carregar. Só o que pertence ao ato de enviar.
	 */
	children?: React.ReactNode
}

export function AnalysisStart({ dropzone, error, errorTitle = "Não foi possível ler o arquivo", children }: AnalysisStartProps) {
	return (
		<div className="mx-auto w-full max-w-4xl space-y-6">
			{dropzone}

			{error && (
				<Alert variant="destructive">
					<AlertCircle />
					<AlertTitle>{errorTitle}</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{children}

			<p className="text-center text-caption text-muted-foreground">Onde extrair o relatório e o que é analisado estão em Orientações, no cabeçalho.</p>
		</div>
	)
}
