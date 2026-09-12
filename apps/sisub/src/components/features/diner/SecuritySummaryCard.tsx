import { Link } from "@tanstack/react-router"
import { ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useMfaOverview } from "@/hooks/data/useMfa"

/**
 * Cartão de segurança do perfil: estado da verificação em duas etapas e o atalho para a tela
 * que a configura.
 *
 * Discreto de propósito. A spec é explícita em que o convite não bloqueia nada — quem entra no
 * perfil para conferir o Nr. de Ordem não pode ser barrado por um aviso de segurança. Enquanto
 * não há obrigatoriedade, o que cabe aqui é informar e oferecer o caminho.
 */
export function SecuritySummaryCard() {
	const { data: overview, isLoading, error } = useMfaOverview()
	const hasFactor = (overview?.verifiedCount ?? 0) > 0

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
					Segurança
					{/* Sem badge quando a leitura falhou: "Apenas senha" seria uma afirmação sobre um
					    estado que o sistema não conseguiu ler. */}
					{!isLoading && !error && <Badge variant={hasFactor ? "success" : "outline"}>{hasFactor ? "Duas etapas ativa" : "Apenas senha"}</Badge>}
				</CardTitle>
				<CardDescription>
					{error
						? "Não foi possível verificar o estado da verificação em duas etapas desta conta."
						: hasFactor
							? `${overview?.verifiedCount === 1 ? "Um dispositivo cadastrado" : `${overview?.verifiedCount} dispositivos cadastrados`} para confirmar sua identidade no login.`
							: "Sua conta é protegida apenas pela senha. A verificação em duas etapas leva menos de dois minutos para configurar."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button
					variant="outline"
					size="sm"
					nativeButton={false}
					render={<Link to="/diner/security">{hasFactor ? "Gerenciar segurança da conta" : "Configurar verificação em duas etapas"}</Link>}
				/>
			</CardContent>
		</Card>
	)
}
