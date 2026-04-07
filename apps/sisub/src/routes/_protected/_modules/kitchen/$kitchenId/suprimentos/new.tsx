import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { DraftEditor } from "@/components/features/local/kitchen-draft/DraftEditor"
import { PageHeader } from "@/components/layout/PageHeader"
import { useCreateKitchenDraft, useSendKitchenDraft } from "@/hooks/data/useKitchenDraft"
import { useMenuTemplates } from "@/hooks/data/useTemplates"
import type { TemplateSelection } from "@/types/domain/ata"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/suprimentos/new")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 2),
	component: NewDraftPage,
	head: () => ({
		meta: [{ title: "Novo Rascunho de Suprimentos" }],
	}),
})

function NewDraftPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const navigate = useNavigate()

	const { data: templates, isLoading: isLoadingTemplates } = useMenuTemplates(kitchenId)
	const { mutate: createDraft, isPending: isSaving } = useCreateKitchenDraft()
	const { mutate: sendAfterCreate, isPending: isSending } = useSendKitchenDraft()

	// Separar templates locais por tipo
	const localTemplates = templates?.filter((t) => t.kitchen_id !== null) || []
	const weeklyTemplates = localTemplates.filter((t) => (t as typeof t & { template_type?: string }).template_type !== "event")
	const eventTemplates = localTemplates.filter((t) => (t as typeof t & { template_type?: string }).template_type === "event")

	const handleSave = (title: string, notes: string, selections: TemplateSelection[]) => {
		createDraft(
			{ kitchenId, title, notes: notes || undefined, selections },
			{
				onSuccess: () => {
					navigate({ to: "/kitchen/$kitchenId/suprimentos", params: { kitchenId: kitchenIdStr as string } })
				},
			}
		)
	}

	const handleSend = (title: string, notes: string, selections: TemplateSelection[]) => {
		createDraft(
			{ kitchenId, title, notes: notes || undefined, selections },
			{
				onSuccess: (draft) => {
					if (draft) {
						sendAfterCreate(draft.id, {
							onSuccess: () => {
								navigate({ to: "/kitchen/$kitchenId/suprimentos", params: { kitchenId: kitchenIdStr as string } })
							},
						})
					}
				},
			}
		)
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Novo Rascunho de Suprimentos" description="Selecione os templates e eventos para sugerir à gestão da unidade." />
			<DraftEditor
				weeklyTemplates={weeklyTemplates}
				eventTemplates={eventTemplates}
				isLoadingTemplates={isLoadingTemplates}
				isSaving={isSaving}
				isSending={isSending}
				onSave={handleSave}
				onSend={handleSend}
			/>
		</div>
	)
}
