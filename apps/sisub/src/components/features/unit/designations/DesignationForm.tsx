import {
	brasiliaToday,
	DESIGNATION_ROLE_LABELS,
	DESIGNATION_ROLES,
	DESIGNATION_SOURCE_LABELS,
	DESIGNATION_SOURCES,
	type DesignationRole,
	type DesignationSource,
	designationInputProblems,
} from "@iefa/sisub-domain"
import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { useCreateDesignation, useDesignationCandidates, useDesignationScopes } from "@/hooks/data/useExpenseExecution"

type ScopeKind = "unit" | "acquisition" | "arp" | "empenho"

const SCOPE_LABELS: Record<ScopeKind, string> = {
	unit: "Toda a OM",
	acquisition: "Uma contratação",
	arp: "Uma ARP",
	empenho: "Um empenho",
}

export interface DesignationPreset {
	role?: DesignationRole
	/** Papéis oferecidos (ex.: só gestor e comissão para o definitivo). */
	roles?: readonly DesignationRole[]
	empenhoId?: string | null
}

/**
 * Cadastro de designação: quem, em que papel, por qual ato e para quê. Criação explícita (modo D
 * de SAVE_BEHAVIOR): o ato já existe no boletim; aqui se registra o número e a vigência.
 */
export function DesignationForm({ unitId, preset, onSaved }: { unitId: number; preset?: DesignationPreset; onSaved: () => void }) {
	const ids = {
		person: useId(),
		role: useId(),
		source: useId(),
		reference: useId(),
		from: useId(),
		to: useId(),
		scope: useId(),
		target: useId(),
		substitute: useId(),
	}
	const candidates = useDesignationCandidates(unitId)
	const scopes = useDesignationScopes(unitId)
	const create = useCreateDesignation(unitId)

	const roles = preset?.roles ?? DESIGNATION_ROLES
	const [personId, setPersonId] = useState<string | null>(null)
	const [role, setRole] = useState<DesignationRole>(preset?.role ?? roles[0])
	const [source, setSource] = useState<DesignationSource>("ato")
	const [reference, setReference] = useState("")
	const [validFrom, setValidFrom] = useState(() => brasiliaToday())
	const [validTo, setValidTo] = useState("")
	const [isSubstitute, setIsSubstitute] = useState(false)
	const [scope, setScope] = useState<ScopeKind>(preset?.empenhoId ? "empenho" : "unit")
	const [target, setTarget] = useState<string | null>(preset?.empenhoId ?? null)
	const [submitted, setSubmitted] = useState(false)

	// Ninguém vem pré-escolhido: a designação é ato de outro papel, e sugerir a própria pessoa
	// ensinaria a se designar (segregação de funções — o domínio recusa o gestor que efetiva).
	const person = personId

	const scopeOptions =
		scope === "acquisition" ? scopes.data?.acquisitions : scope === "arp" ? scopes.data?.arps : scope === "empenho" ? scopes.data?.empenhos : []
	const payload = {
		unitId,
		personId: person ?? "",
		role,
		source,
		sourceReference: reference.trim() || null,
		validFrom,
		validTo: validTo || null,
		isSubstitute,
		acquisitionId: scope === "acquisition" ? target : null,
		arpId: scope === "arp" ? target : null,
		empenhoId: scope === "empenho" ? target : null,
	}
	const problems = [
		...(person ? [] : ["Escolha quem está sendo designado"]),
		...(scope !== "unit" && !target ? [`Escolha ${SCOPE_LABELS[scope].toLowerCase()}`] : []),
		...designationInputProblems(payload),
	]

	async function submit(event: React.FormEvent) {
		event.preventDefault()
		setSubmitted(true)
		if (problems.length > 0) return
		try {
			await create.mutateAsync(payload)
			toast.success(`${DESIGNATION_ROLE_LABELS[role]} designado${isSubstitute ? " (substituto)" : ""}`)
			onSaved()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Não foi possível gravar a designação")
		}
	}

	return (
		<form onSubmit={submit} noValidate>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={ids.person}>Quem</FieldLabel>
					<SearchableSelect
						id={ids.person}
						value={person}
						onValueChange={setPersonId}
						options={(candidates.data ?? []).map((c) => ({ value: c.personId, label: c.label }))}
						placeholder={candidates.isLoading ? "Carregando…" : "Escolha a pessoa"}
						emptyLabel="Ninguém com acesso ao estoque ou à gestão desta OM"
					/>
					<FieldDescription>Só aparece quem opera o estoque de uma cozinha da OM ou a Gestão Unidade.</FieldDescription>
				</Field>

				<div className="grid gap-4 sm:grid-cols-2">
					<Field>
						<FieldLabel htmlFor={ids.role}>Papel</FieldLabel>
						<Select
							items={roles.map((value) => ({ value, label: DESIGNATION_ROLE_LABELS[value] }))}
							value={role}
							onValueChange={(value) => value && setRole(value as DesignationRole)}
						>
							<SelectTrigger id={ids.role} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{roles.map((value) => (
									<SelectItem key={value} value={value}>
										{DESIGNATION_ROLE_LABELS[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field orientation="horizontal">
						<Switch id={ids.substitute} checked={isSubstitute} onCheckedChange={setIsSubstitute} />
						<FieldLabel htmlFor={ids.substitute}>Substituto</FieldLabel>
					</Field>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<Field>
						<FieldLabel htmlFor={ids.source}>Ato</FieldLabel>
						<Select
							items={DESIGNATION_SOURCES.map((value) => ({ value, label: DESIGNATION_SOURCE_LABELS[value] }))}
							value={source}
							onValueChange={(value) => value && setSource(value as DesignationSource)}
						>
							<SelectTrigger id={ids.source} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{DESIGNATION_SOURCES.map((value) => (
									<SelectItem key={value} value={value}>
										{DESIGNATION_SOURCE_LABELS[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor={ids.reference}>Boletim ou portaria</FieldLabel>
						<Input id={ids.reference} value={reference} maxLength={200} placeholder="BI nº 123, de 20/09/2026" onChange={(e) => setReference(e.target.value)} />
					</Field>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<Field>
						<FieldLabel htmlFor={ids.from}>Vale a partir de</FieldLabel>
						<Input id={ids.from} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
					</Field>
					<Field>
						<FieldLabel htmlFor={ids.to}>Até (opcional)</FieldLabel>
						<Input id={ids.to} type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
					</Field>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<Field>
						<FieldLabel htmlFor={ids.scope}>Vale para</FieldLabel>
						<Select
							items={(Object.keys(SCOPE_LABELS) as ScopeKind[]).map((value) => ({ value, label: SCOPE_LABELS[value] }))}
							value={scope}
							onValueChange={(value) => {
								if (!value) return
								setScope(value as ScopeKind)
								setTarget(value === "empenho" ? (preset?.empenhoId ?? null) : null)
							}}
						>
							<SelectTrigger id={ids.scope} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(Object.keys(SCOPE_LABELS) as ScopeKind[]).map((value) => (
									<SelectItem key={value} value={value}>
										{SCOPE_LABELS[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldDescription>Designação da OM toda cobre a entrega sem contrato; a de uma contratação cobre todas as NEs dela.</FieldDescription>
					</Field>
					{scope !== "unit" && (
						<Field>
							<FieldLabel htmlFor={ids.target}>{SCOPE_LABELS[scope]}</FieldLabel>
							<SearchableSelect
								id={ids.target}
								value={target}
								onValueChange={setTarget}
								options={(scopeOptions ?? []).map((option) => ({ value: option.id, label: option.label }))}
								placeholder={scopes.isLoading ? "Carregando…" : "Escolha"}
							/>
						</Field>
					)}
				</div>

				{submitted && problems.length > 0 && <FieldError errors={problems.map((message) => ({ message }))} />}

				<div className="flex justify-end">
					<Button type="submit" disabled={create.isPending}>
						{create.isPending && <Spinner data-icon="inline-start" />}
						Designar
					</Button>
				</div>
			</FieldGroup>
		</form>
	)
}
