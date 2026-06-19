/**
 * Regressão happy-path — operations de KITCHEN ATA DRAFT (@iefa/sisub-domain).
 * Lifecycle pending → sent. Congela CRUD + replace de selections + ordenação ANTES da migração Drizzle.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { createKitchenDraft, deleteKitchenDraft, fetchKitchenDrafts, fetchPendingDraft, sendKitchenDraft, updateKitchenDraft } from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("kitchen-draft operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("kitchen_ata_draft")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	afterAll(async () => {
		await closeDb?.()
	})

	async function setupDraftDeps() {
		if (!seeder) throw new Error("no seeder")
		const { id: kitchenId } = await seeder.seedKitchen()
		const templateId = await seeder.seedTemplate({ kitchenId })
		return { kitchenId, templateId }
	}

	test("createKitchenDraft cria com status 'pending' e insere selections", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, templateId } = await setupDraftDeps()

		const draft = await createKitchenDraft(db, ctx, {
			kitchenId,
			title: uid("[TEST] Draft "),
			notes: "obs",
			selections: [{ templateId, templateName: "T", repetitions: 2 }],
		})
		seeder.trackWhere("kitchen_ata_draft_selection", "draft_id", draft.id)
		seeder.track("kitchen_ata_draft", draft.id)

		expect(draft.status).toBe("pending")

		const drafts = await fetchKitchenDrafts(db, ctx, { kitchenId })
		const found = drafts.find((d) => d.id === draft.id)
		expect(found).toBeDefined()
		expect(found?.selections).toHaveLength(1)
		expect(found?.selections[0].template_id).toBe(templateId)
		expect(found?.selections[0].repetitions).toBe(2)
	})

	test("fetchKitchenDrafts ordena por created_at desc; fetchPendingDraft só retorna 'sent'", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, templateId } = await setupDraftDeps()

		const first = await createKitchenDraft(db, ctx, { kitchenId, title: uid("[TEST] D1 "), notes: undefined, selections: [] })
		seeder.track("kitchen_ata_draft", first.id)
		const second = await createKitchenDraft(db, ctx, {
			kitchenId,
			title: uid("[TEST] D2 "),
			notes: undefined,
			selections: [{ templateId, templateName: "T", repetitions: 1 }],
		})
		seeder.trackWhere("kitchen_ata_draft_selection", "draft_id", second.id)
		seeder.track("kitchen_ata_draft", second.id)

		// nenhum 'sent' ainda
		expect(await fetchPendingDraft(db, ctx, { kitchenId })).toBeNull()

		await sendKitchenDraft(db, ctx, { draftId: second.id })
		const pending = await fetchPendingDraft(db, ctx, { kitchenId })
		expect(pending?.id).toBe(second.id)

		const drafts = await fetchKitchenDrafts(db, ctx, { kitchenId })
		const idx1 = drafts.findIndex((d) => d.id === first.id)
		const idx2 = drafts.findIndex((d) => d.id === second.id)
		expect(idx2).toBeLessThan(idx1) // second criado depois → vem primeiro (desc)
	})

	test("updateKitchenDraft substitui selections (delete-all + re-insert)", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, templateId } = await setupDraftDeps()
		const otherTemplate = await seeder.seedTemplate({ kitchenId })

		const draft = await createKitchenDraft(db, ctx, {
			kitchenId,
			title: uid("[TEST] D "),
			notes: undefined,
			selections: [{ templateId, templateName: "T", repetitions: 1 }],
		})
		seeder.trackWhere("kitchen_ata_draft_selection", "draft_id", draft.id)
		seeder.track("kitchen_ata_draft", draft.id)

		await updateKitchenDraft(db, ctx, {
			draftId: draft.id,
			updates: { title: uid("[TEST] Renomeado ") },
			selections: [{ templateId: otherTemplate, templateName: "T", repetitions: 5 }],
		})

		const drafts = await fetchKitchenDrafts(db, ctx, { kitchenId })
		const found = drafts.find((d) => d.id === draft.id)
		expect(found?.selections).toHaveLength(1)
		expect(found?.selections[0].template_id).toBe(otherTemplate)
		expect(found?.selections[0].repetitions).toBe(5)
	})

	test("deleteKitchenDraft remove o rascunho", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId } = await setupDraftDeps()
		const draft = await createKitchenDraft(db, ctx, { kitchenId, title: uid("[TEST] D "), notes: undefined, selections: [] })
		seeder.track("kitchen_ata_draft", draft.id) // cleanup-safe se deleteKitchenDraft falhar (delete de row já removida é no-op)

		await deleteKitchenDraft(db, ctx, { draftId: draft.id })
		const drafts = await fetchKitchenDrafts(db, ctx, { kitchenId })
		expect(drafts.map((d) => d.id)).not.toContain(draft.id)
	})
})
