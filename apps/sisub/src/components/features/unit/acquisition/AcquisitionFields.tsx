import {
	ACQUISITION_INSTRUMENT_LABEL,
	ACQUISITION_INSTRUMENTS,
	ACQUISITION_KIND_LABEL,
	ACQUISITION_KINDS,
	type AcquisitionInstrument,
	type AcquisitionKind,
	isMaterialClassLine,
	SRP_ROLE_LABEL,
	SRP_ROLES,
	type SrpRole,
} from "@iefa/sisub-domain"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useActivityLines } from "@/hooks/data/useAcquisitions"

const NONE = "none"

export function KindSelect({ id, value, onChange }: { id: string; value: AcquisitionKind; onChange: (kind: AcquisitionKind) => void }) {
	return (
		<Select value={value} onValueChange={(next) => next && onChange(next as AcquisitionKind)}>
			<SelectTrigger id={id} className="w-full">
				<SelectValue>{ACQUISITION_KIND_LABEL[value]}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{ACQUISITION_KINDS.map((kind) => (
					<SelectItem key={kind} value={kind}>
						{ACQUISITION_KIND_LABEL[kind]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

export function SrpRoleSelect({ id, value, onChange }: { id: string; value: SrpRole | null; onChange: (role: SrpRole | null) => void }) {
	return (
		<Select value={value ?? NONE} onValueChange={(next) => onChange(next == null || next === NONE ? null : (next as SrpRole))}>
			<SelectTrigger id={id} className="w-full">
				<SelectValue>{value ? SRP_ROLE_LABEL[value] : "Não informado"}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NONE}>Não informado</SelectItem>
				{SRP_ROLES.map((role) => (
					<SelectItem key={role} value={role}>
						{SRP_ROLE_LABEL[role]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

export function InstrumentSelect({
	id,
	value,
	onChange,
}: {
	id: string
	value: AcquisitionInstrument | null
	onChange: (instrument: AcquisitionInstrument | null) => void
}) {
	return (
		<Select value={value ?? NONE} onValueChange={(next) => onChange(next == null || next === NONE ? null : (next as AcquisitionInstrument))}>
			<SelectTrigger id={id} className="w-full">
				<SelectValue>{value ? ACQUISITION_INSTRUMENT_LABEL[value] : "Não informado"}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NONE}>Não informado</SelectItem>
				{ACQUISITION_INSTRUMENTS.map((instrument) => (
					<SelectItem key={instrument} value={instrument}>
						{ACQUISITION_INSTRUMENT_LABEL[instrument]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

/**
 * Ramo de atividade (IN SEGES/ME 67/2021, art. 4º, § 2º): classe do PDM no CATMAT para bens, ou a
 * descrição do serviço. O combobox é pesquisável (a lista de classes passa de 25 itens).
 */
export function ActivityLineField({
	id,
	unitId,
	value,
	onChange,
}: {
	id: string
	unitId: number
	value: string | null
	/** Chamado quando o usuário escolhe a classe ou sai do campo de serviço. */
	onChange: (line: string | null) => void
}) {
	const { data: classes = [], isError } = useActivityLines(unitId)
	const isClass = isMaterialClassLine(value)
	const [service, setService] = useState(isClass ? "" : (value ?? ""))

	return (
		<div className="grid gap-2 sm:grid-cols-2">
			<SearchableSelect
				id={id}
				value={isClass ? value : null}
				onValueChange={(next) => onChange(next)}
				options={classes.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}`, keywords: c.name }))}
				placeholder={isError ? "Classes indisponíveis" : "Classe do CATMAT (bens)"}
				searchPlaceholder="Buscar classe pelo código ou nome"
				clearLabel="Sem classe"
				aria-label="Classe de material do CATMAT"
			/>
			<Input
				aria-label="Descrição do serviço"
				value={service}
				placeholder="Ou descreva o serviço"
				onChange={(e) => setService(e.target.value)}
				onBlur={() => {
					const next = service.trim()
					if (next === "" && isClass) return
					if (next !== (isClass ? "" : (value ?? ""))) onChange(next === "" ? null : next)
				}}
			/>
		</div>
	)
}
