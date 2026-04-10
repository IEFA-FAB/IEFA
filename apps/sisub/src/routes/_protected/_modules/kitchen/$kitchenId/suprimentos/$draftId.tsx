import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { DraftEditor } from "@/components/features/local/kitchen-draft/DraftEditor"
import { PageHeader } from "@/components/layout/PageHeader"
import { useKitchenDrafts, useSendKitchenDraft, useUpdateKitchenDraft } from "@/hooks/data/useKitchenDraft"
import { useMenuTemplates } from "@/hooks/data/useTemplates"
import type { TemplateSelection } from "@/types/domain/ata"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/suprimentos/$draftId")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 2),
	component: EditDraftPage,
	head: () => ({
		meta: [{ title: "Editar Rascunho de Suprimentos" }],
	}),
})

function EditDraftPage() {
	const { kitchenId: kitchenIdStr, draftId } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const navigate = useNavigate()

	const { data: drafts, isLoading: isLoadingDraft } = useKitchenDrafts(kitchenId)
	const draft = drafts?.find((d) => d.id === draftId)

	const { data: templates, isLoading: isLoadingTemplates } = useMenuTemplates(kitchenId)
	const { mutate: updateDraft, isPending: isSaving } = useUpdateKitchenDraft()
	const { mutate: sendDraft, isPending: isSending } = useSendKitchenDraft()

	const localTemplates = templates?.filter((t) => t.kitchen_id !== null) || []
	const weeklyTemplates = localTemplates.filter((t) => (t as typeof t & { template_type?: string }).template_type !== "event")
	const eventTemplates = localTemplates.filter((t) => (t as typeof t & { template_type?: string }).template_type === "event")

	if (isLoadingDraft) {
		return (
			<div className="space-y-6">
				<div className="h-16 animate-pulse rounded bg-muted" aria-hidden="true" />
				<div className="h-48 animate-pulse rounded bg-muted" aria-hidden="true" />
			</div>
		)
	}

	if (!draft) {
		return (
			<div className="py-12 text-center">
				<p className="text-muted-foreground">Rascunho não encontrado.</p>
			</div>
		)
	}

	const initialSelections: TemplateSelection[] = draft.selections.map((s) => ({
		templateId: s.template.id,
		templateName: s.template.name || "",
		repetitions: s.repetitions,
	}))

	const handleSave = (title: string, notes: string, selections: TemplateSelection[]) => {
		updateDraft(
			{ draftId: draft.id, updates: { title, notes: notes || null }, selections },
			{
				onSuccess: () => {
					navigate({ to: "/kitchen/$kitchenId/suprimentos", params: { kitchenId: kitchenIdStr as string } })
				},
			}
		)
	}

	const handleSend = (title: string, notes: string, selections: TemplateSelection[]) => {
		updateDraft(
			{ draftId: draft.id, updates: { title, notes: notes || null }, selections },
			{
				onSuccess: () => {
					sendDraft(draft.id, {
						onSuccess: () => {
							navigate({ to: "/kitchen/$kitchenId/suprimentos", params: { kitchenId: kitchenIdStr as string } })
						},
					})
				},
			}
		)
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Editar Rascunho" description={`Editando: ${draft.title}`} />
			<DraftEditor
				initialTitle={draft.title}
				initialNotes={draft.notes || ""}
				initialSelections={initialSelections}
				weeklyTemplates={weeklyTemplates}
				eventTemplates={eventTemplates}
				isLoadingTemplates={isLoadingTemplates}
				isSaving={isSaving}
				isSending={isSending}
				onSave={handleSave}
				onSend={draft.status === "pending" ? handleSend : undefined}
			/>
		</div>
	)
}
