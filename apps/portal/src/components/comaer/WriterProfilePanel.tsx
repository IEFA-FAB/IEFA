import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, FloppyDisk, User } from "iconoir-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EMPTY_PROFILE, missingProfileFields, type WriterProfile } from "@/lib/comaer/writer-profile"
import { loadWriterProfileFn, saveWriterProfileFn } from "@/server/writer-profile.fn"

const FIELDS: { key: keyof WriterProfile; label: string; placeholder?: string }[] = [
	{ key: "om_name", label: "Nome da OM", placeholder: "Instituto de Economia e Finanças da Aeronáutica" },
	{ key: "om_acronym", label: "Sigla", placeholder: "IEFA" },
	{ key: "om_sector", label: "Setor", placeholder: "Gabinete" },
	{ key: "city", label: "Localidade padrão", placeholder: "Rio de Janeiro" },
	{ key: "om_address", label: "Endereço", placeholder: "Av. Marechal Câmara, 233" },
	{ key: "om_phone", label: "Telefone", placeholder: "(21) 2101-0000" },
	{ key: "om_email", label: "E-mail institucional", placeholder: "gabinete@fab.mil.br" },
	{ key: "nup_prefix", label: "Prefixo do NUP", placeholder: "68000" },
	{ key: "signer_name", label: "Signatário — nome", placeholder: "Fulano de Tal" },
	{ key: "signer_rank", label: "Signatário — posto", placeholder: "Cel" },
	{ key: "signer_quadro", label: "Signatário — quadro", placeholder: "Int" },
	{ key: "signer_position", label: "Signatário — cargo", placeholder: "Diretor" },
]

/**
 * Dados fixos do redator.
 *
 * Existe para que a IA não precise perguntar duas vezes a mesma coisa, e para que ela
 * continue sem inventar identidade: o que está aqui é do usuário e entra no documento
 * NOVO; o que falta vira pergunta na conversa, não palpite.
 */
export function WriterProfilePanel({ onSaved }: { onSaved: (profile: WriterProfile) => void }) {
	const queryClient = useQueryClient()
	const stored = useQuery({ queryKey: ["writer-profile"], queryFn: () => loadWriterProfileFn() })
	const [draft, setDraft] = useState<WriterProfile>(EMPTY_PROFILE)
	const [open, setOpen] = useState(false)

	useEffect(() => {
		if (stored.data) setDraft({ ...EMPTY_PROFILE, ...stored.data })
	}, [stored.data])

	const save = useMutation({
		mutationFn: () => saveWriterProfileFn({ data: { profile: draft } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["writer-profile"] })
			onSaved(draft)
		},
	})

	const missing = missingProfileFields(stored.data ?? null)

	return (
		<section className="border border-border p-4 flex flex-col gap-4">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-sm font-semibold tracking-tight uppercase flex items-center gap-2">
					<User className="size-4" /> Meus dados fixos
				</h3>
				<Button type="button" variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
					{open ? "Fechar" : "Editar"}
				</Button>
			</div>

			<p className="text-xs text-muted-foreground">
				{missing.length === 0 ? (
					<>
						<Check className="inline size-3 text-green-600" /> OM, signatário e localidade preenchem cada documento novo.
					</>
				) : (
					<>Falta preencher: {missing.join(", ")}. Sem isso, a conversa vai perguntar por eles a cada documento.</>
				)}
			</p>

			{open && (
				<>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{FIELDS.map((field) => (
							<div key={field.key} className="flex flex-col gap-1.5">
								<Label htmlFor={`profile-${field.key}`}>{field.label}</Label>
								<Input
									id={`profile-${field.key}`}
									value={draft[field.key] ?? ""}
									placeholder={field.placeholder}
									onChange={(e) => setDraft((current) => ({ ...current, [field.key]: e.target.value }))}
								/>
							</div>
						))}
					</div>
					<div className="flex items-center gap-3">
						<Button type="button" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
							<FloppyDisk className="size-4" /> {save.isPending ? "Salvando…" : "Salvar perfil"}
						</Button>
						<span className="text-xs text-muted-foreground">
							O sequencial do setor não entra aqui: é contador da seção, e sugerir número errado é pior que não sugerir.
						</span>
					</div>
					{save.error && <p className="text-xs text-destructive">{save.error instanceof Error ? save.error.message : "Falha ao salvar o perfil."}</p>}
				</>
			)}
		</section>
	)
}
