// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): botão de copiar a mensagem.
import { CheckCircle2, Copy } from "lucide-react"
import { Button } from "#/components/ui/button"

export function CopyMessageButton({ isCopied, onClick }: { isCopied: boolean; onClick: () => void }) {
	return (
		<Button onClick={onClick} type="button" variant={isCopied ? "success" : "default"} className="mt-8 w-full">
			{isCopied ? (
				<>
					<CheckCircle2 size={16} />
					Copiado
				</>
			) : (
				<>
					<Copy size={16} />
					Copiar Mensagem
				</>
			)}
		</Button>
	)
}
