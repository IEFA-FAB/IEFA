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
import { readSaramDismissal, rememberSaramDismissal } from "#/lib/saram-dismissal"
import { type SucontIdentity, saveMyNrOrdemFn } from "#/server/user.fn"

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
 * atende.
 *
 * Duas etapas, e a segunda é o que impede um erro de digitação de virar identidade
 * alheia: gravado o número, o diálogo MOSTRA quem ele resolveu e pergunta se é a
 * pessoa. Todo SARAM do espelho tem 7 dígitos, então um dígito trocado cai em
 * alguém de verdade — e o vínculo é lido por outros apps do ERP pela
 * `core.v_user_identity`. Sem a confirmação não haveria nenhuma outra tela por onde
 * corrigir: o diálogo é o único lugar que escreve `nrOrdem`, e ele deixaria de
 * abrir assim que o número errado ficasse gravado.
 */

const NR_ORDEM_MAXLEN = 7
const NR_ORDEM_MINLEN = 6

export function SaramDialog() {
	const queryClient = useQueryClient()
	const isAuthenticated = useQuery(authQueryOptions()).data?.isAuthenticated ?? false
	// O SARAM é da PESSOA, não da divisão em que ela trabalha: vale para qualquer
	// módulo do sucont, administração inclusive. Restringir às divisões trancaria a
	// conta só-administradora fora do vínculo, para sempre.
	const { canUseApp: canAccess } = useSucontAccess()

	// A consulta só dispara com sessão E acesso ao módulo: sem os dois a fn responde
	// 401/403, e o diálogo não teria onde aparecer de qualquer forma.
	const identity = useQuery({ ...myIdentityQueryOptions(), enabled: isAuthenticated && canAccess })

	const [dismissed, setDismissed] = useState(readSaramDismissal)
	const [nrOrdem, setNrOrdem] = useState("")
	const [error, setError] = useState<string | null>(null)
	/** Identidade recém-gravada, aguardando confirmação de quem a gravou. */
	const [pendingConfirmation, setPendingConfirmation] = useState<SucontIdentity | null>(null)
	/**
	 * Pedido reaberto para conserto, DEPOIS que já existe `nrOrdem` gravado.
	 *
	 * Sem este estado o "Corrigir" fechava o diálogo em vez de voltar ao campo: a
	 * gravação já pusera o número no cache, a consulta deixava de pedir SARAM, e a
	 * única tela que escreve `nrOrdem` sumia com o número errado no banco.
	 */
	const [reopened, setReopened] = useState(false)
	const fieldId = useId()
	const helpId = useId()
	const errorId = useId()

	const dismiss = () => {
		rememberSaramDismissal()
		setDismissed(true)
	}

	const save = useMutation({
		mutationFn: (value: string) => saveMyNrOrdemFn({ data: { nrOrdem: value } }),
		onSuccess: (saved) => {
			queryClient.setQueryData(myIdentityQueryOptions().queryKey, saved)
			// A lista de acessos passa a mostrar o nome — e quem acabou de se vincular
			// costuma ser justamente o administrador olhando a tela.
			queryClient.invalidateQueries({ queryKey: ["sucont", "grants"] })
			setPendingConfirmation(saved)
		},
		onError: (e) => setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo."),
	})

	const confirm = () => {
		const name = pendingConfirmation && formatMilitaryName(pendingConfirmation)
		toast.success(name ? `SARAM vinculado — ${name}` : "SARAM vinculado.")
		setPendingConfirmation(null)
		setReopened(false)
	}

	const correct = () => {
		setPendingConfirmation(null)
		setReopened(true)
		setError(null)
		// O campo volta preenchido com o que foi gravado: quase sempre o conserto é
		// um dígito, e reescrever os sete é o caminho mais fácil de errar de novo.
		setNrOrdem(pendingConfirmation?.nrOrdem ?? "")
	}

	// Confirmação pendente e pedido reaberto mantêm o diálogo aberto APESAR de o
	// `nrOrdem` já estar gravado — é essa janela que dá o caminho de correção.
	const open = pendingConfirmation !== null || reopened || (identity.isSuccess && !identity.data.nrOrdem && !dismissed)

	/**
	 * Esc e clique fora. O que fechar significa depende do passo: na confirmação é
	 * aceitar o que já foi gravado; no conserto é desistir dele (o número gravado
	 * fica, e o pedido não volta porque já existe `nrOrdem`); no pedido inicial é
	 * "agora não", que precisa ser lembrado para não reabrir na próxima rota.
	 */
	const closeFromOutside = () => {
		if (pendingConfirmation) return confirm()
		if (reopened) return setReopened(false)
		dismiss()
	}
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
		<Dialog open={open} onOpenChange={(next) => !next && closeFromOutside()}>
			<DialogContent aria-busy={save.isPending}>
				{pendingConfirmation ? (
					<ConfirmationStep identity={pendingConfirmation} onConfirm={confirm} onCorrect={correct} />
				) : (
					<>
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
								<Button type="button" variant="ghost" onClick={dismiss} disabled={save.isPending}>
									Agora não
								</Button>
								<Button type="submit" disabled={save.isPending}>
									{save.isPending && <Loader2 className="size-4 animate-spin" />}
									Salvar
								</Button>
							</DialogFooter>
						</form>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}

/**
 * Confirmação de quem o número resolveu.
 *
 * Duas saídas com peso diferente: confirmar é o caminho comum, corrigir é o que
 * conserta o dígito trocado. Sem correspondência no cadastro não há nome para
 * mostrar — dizer isso é o que separa "gravamos, mas confira" de um sucesso mudo
 * que faria a pessoa procurar o próprio nome numa tela onde ele nunca vai aparecer.
 */
function ConfirmationStep({ identity, onConfirm, onCorrect }: { identity: SucontIdentity; onConfirm: () => void; onCorrect: () => void }) {
	const name = formatMilitaryName(identity)

	return (
		<>
			<DialogHeader>
				<DialogTitle className="flex items-center gap-2">
					<ShieldCheck className="size-4 text-tech-cyan" aria-hidden="true" />
					{name ? "É você?" : "Número não encontrado"}
				</DialogTitle>
				<DialogDescription>
					{name ? (
						<>
							O SARAM <span className="font-mono">{identity.nrOrdem}</span> corresponde a <strong className="text-foreground">{name}</strong>. Se não for você,
							corrija o número — ele é o que identifica sua conta em todo o ERP.
						</>
					) : (
						<>
							O SARAM <span className="font-mono">{identity.nrOrdem}</span> foi gravado, mas não corresponde a ninguém no cadastro de pessoal. Pode ser um
							número novo, ainda fora da última carga — ou um dígito trocado.
						</>
					)}
				</DialogDescription>
			</DialogHeader>

			<DialogFooter>
				<Button type="button" variant="ghost" onClick={onCorrect}>
					Corrigir
				</Button>
				<Button type="button" onClick={onConfirm}>
					{name ? "Sou eu" : "Manter assim"}
				</Button>
			</DialogFooter>
		</>
	)
}
