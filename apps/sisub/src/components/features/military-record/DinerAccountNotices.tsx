import { Link } from "@tanstack/react-router"
import { Building2, IdCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { MILITARY_RECORD_PATH } from "./MilitaryRecordNotice"

/**
 * Conta de seção no lugar do arranchamento (e do auto check-in): ela não come, quem come é o
 * militar pela própria conta. O banco recusa de qualquer jeito (`ACCOUNT_INSTITUTIONAL_NO_MEALS`);
 * aqui a tela diz isso ANTES, com o caminho de volta se a marcação foi engano.
 */
export function InstitutionalAccountNotice({ what }: { what: "arranchamento" | "check-in" }) {
	return (
		<Card>
			<CardContent>
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Building2 aria-hidden />
						</EmptyMedia>
						<EmptyTitle>Esta é uma conta de seção</EmptyTitle>
						<EmptyDescription>
							{what === "arranchamento"
								? "Conta de seção não tem arranchamento próprio. Cada militar arrancha pela própria conta pessoal, e é por ela que a previsão do refeitório é feita."
								: "Conta de seção não registra presença no refeitório. Quem vai comer faz o check-in pela própria conta pessoal."}{" "}
							O resto da conta (módulos, permissões) continua igual.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="outline" size="sm" nativeButton={false} render={<Link to={MILITARY_RECORD_PATH}>Esta conta é de uma pessoa?</Link>} />
					</EmptyContent>
				</Empty>
			</CardContent>
		</Card>
	)
}

/** Conta pessoal sem vínculo verificado: arrancha normal, com um lembrete discreto. */
export function UnverifiedSaramHint() {
	return (
		<p className="flex items-start gap-2 text-caption text-muted-foreground">
			<IdCard className="mt-0.5 size-3.5 shrink-0" aria-hidden />
			<span>
				Seu cadastro militar ainda não está confirmado. Você arrancha normalmente; confirme quando puder para o refeitório ver seu posto e nome de guerra.{" "}
				<Link to={MILITARY_RECORD_PATH} className="underline underline-offset-2 hover:text-foreground">
					Confirmar agora
				</Link>
			</span>
		</p>
	)
}
