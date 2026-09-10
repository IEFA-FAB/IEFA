import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, ShieldCheck } from "lucide-react"
import { type FormEvent, useId, useState } from "react"
import { myIdentityQueryOptions } from "#/auth/identity"
import { useSucontAccess } from "#/auth/pbac"
import { authQueryOptions } from "#/auth/service"
import { Button } from "#/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { toast } from "#/components/ui/toast"
import { formatMilitaryName } from "#/lib/identity"
import { saveMyNrOrdemFn } from "#/server/user.fn"

/**
 * Vínculo do SARAM à conta, pedido no primeiro acesso ao hub.
 *
 * Por que existe: o SUCONT conhecia seus usuários só pelo `userId` do Supabase, e
 * a tela de acessos listava UUID. O e-mail resolve a leitura, mas quem administra
 * a seção reconhece "1S FULANO", não "fulanosbc@fab.mil.br" — e é o SARAM que liga
 * a conta ao cadastro de pessoal da FAB. Mesmo pedido que o sisub faz na entrada.
 *
 * DISPENSÁVEL, ao contrário do sisub. Lá o diálogo tranca a tela até responder; o
 * público de lá é o rancho inteiro. Aqui o público é uma seção contábil que já tem
 * acesso concedido, e um bloqueio duro trancaria fora do hub quem não tem SARAM à
 * mão — ou não tem SARAM — para servir uma tela de conferência que o e-mail já
 * atende. Dispensar vale para a sessão do browser: no próximo login o pedido volta,
 * e some para sempre assim que o número é informado.
 */

const NR_ORDEM_MAXLEN = 7
const NR_ORDEM_MINLEN = 6

export function SaramDialog() {
	const queryClient = useQueryClient()
	const isAuthenticated = useQuery(authQueryOptions()).data?.isAuthenticated ?? false
	const { canAccess } = useSucontAccess()

	// A consulta só dispara com sessão E acesso ao módulo: sem os dois a fn responde
	// 401/403, e o diálogo não teria onde aparecer de qualquer forma.
	const identity = useQuery({ ...myIdentityQueryOptions(), enabled: isAuthenticated && canAccess })

	const [dismissed, setDismissed] = useState(false)
	const [nrOrdem, setNrOrdem] = useState("")
	const [error, setError] = useState<string | null>(null)
	const fieldId = useId()
	const helpId = useId()
	const errorId = useId()

	const save = useMutation({
		mutationFn: (value: string) => saveMyNrOrdemFn({ data: { nrOrdem: value } }),
		onSuccess: (saved) => {
			queryClient.setQueryData(myIdentityQueryOptions().queryKey, saved)
			// A lista de acessos passa a mostrar o nome — e quem acabou de se vincular
			// costuma ser justamente o administrador olhando a tela.
			queryClient.invalidateQueries({ queryKey: ["sucont", "grants"] })
			const name = formatMilitaryName(saved)
			// Sem correspondência o número foi gravado assim mesmo (o espelho do
			// cadastro tem data). Dizer isso evita que a pessoa conclua que errou o
			// número quando o nome não aparece na tela de acessos.
			toast.success(name ? `SARAM vinculado — ${name}` : "SARAM vinculado. Não encontramos o número no cadastro de pessoal.")
		},
		onError: (e) => setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo."),
	})

	const open = identity.isSuccess && !identity.data.nrOrdem && !dismissed
	const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, NR_ORDEM_MAXLEN)

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const value = digitsOnly(nrOrdem)
		if (value.length < NR_ORDEM_MINLEN) {
			setError("O SARAM tem 6 ou 7 dígitos. Confira e tente de novo.")
			return
		}
		setError(null)
		save.mutate(value)
	}

	return (
		<Dialog open={open} onOpenChange={(next) => !next && setDismissed(true)}>
			<DialogContent aria-busy={save.isPending}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldCheck className="size-4 text-tech-cyan" aria-hidden="true" />
						Informe seu SARAM
					</DialogTitle>
					<DialogDescription id={helpId}>
						É o que liga sua conta ao cadastro de pessoal da FAB: com ele, o SUCONT passa a identificar você por posto e nome de guerra em vez do e-mail.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<label htmlFor={fieldId} className="text-label text-muted-foreground">
							Número de ordem (SARAM)
						</label>
						<Input
							id={fieldId}
							name="nrOrdem"
							value={nrOrdem}
							inputMode="numeric"
							pattern="\d*"
							enterKeyHint="done"
							autoComplete="off"
							placeholder="Ex.: 1234567"
							maxLength={NR_ORDEM_MAXLEN}
							onChange={(e) => {
								setNrOrdem(digitsOnly(e.target.value))
								if (error) setError(null)
							}}
							aria-invalid={Boolean(error)}
							aria-describedby={error ? `${helpId} ${errorId}` : helpId}
						/>
						{error && (
							<p id={errorId} role="alert" className="text-caption text-destructive">
								{error}
							</p>
						)}
						<p className="text-hint text-muted-foreground">Usamos o número apenas para identificar seu registro funcional.</p>
					</div>

					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setDismissed(true)} disabled={save.isPending}>
							Agora não
						</Button>
						<Button type="submit" disabled={save.isPending}>
							{save.isPending && <Loader2 className="size-4 animate-spin" />}
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
