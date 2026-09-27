// Casos de teste de `.opengrep/rules/ubiquitous-language.yaml`. Não é código do app: fica fora de
// `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/ubiquitous-language.yaml .opengrep/rules/__fixtures__/ubiquitous-language.ts
// (as regras restringem `paths` ao sisub; no modo de teste o Opengrep ignora `paths`.)

// ── Identificadores ─────────────────────────────────────────────────────────

// ruleid: ubiquitous-language-lot1-identifier, ubiquitous-language-lot2-identifier
export type KitchenAtaDraft = { id: string }
// ruleid: ubiquitous-language-lot1-identifier
export function fetchKitchenDrafts() {}
// ruleid: ubiquitous-language-lot1-identifier
const keys = { kitchenDraft: ["kitchen_ata_draft"] }
// ruleid: ubiquitous-language-lot1-identifier
import { useKitchenDraft } from "@/hooks/data/useKitchenDraft"
// ruleid: ubiquitous-language-lot1-identifier
export const createLiquidationFn = () => null
// ruleid: ubiquitous-language-lot1-identifier
export function paymentExceedsNetProblem() {}
// ruleid: ubiquitous-language-lot1-identifier
const tool = { name: "list_preparations" }

// ok: ubiquitous-language-lot1-identifier
export type DemandForecast = { id: string }
// ok: ubiquitous-language-lot1-identifier
export const createLiquidacaoFn = () => null
// ok: ubiquitous-language-lot1-identifier
export function pagamentoExceedsNetProblem() {}
// ok: ubiquitous-language-lot1-identifier
const legacyTool = { name: "list_legacy_preparations" }
// ok: ubiquitous-language-lot1-identifier
const RENAMED_OPERATIONS = { registerDeductionPaymentFn: "registerDeductionRemittanceFn" }
// ok: ubiquitous-language-lot1-identifier
// a antiga `kitchen_ata_draft`, renomeada em 20260927010000

// ── Rotas ───────────────────────────────────────────────────────────────────

// ruleid: ubiquitous-language-lot1-route
const toForecast = { to: "/kitchen/$kitchenId/suprimentos/$draftId" }
// ruleid: ubiquitous-language-lot1-route
const toPlans = { to: "/global/weekly-plans" }
// ruleid: ubiquitous-language-lot1-identifier, ubiquitous-language-lot1-route
const hrefLiq = `${unit}/liquidations`
// ruleid: ubiquitous-language-lot1-identifier, ubiquitous-language-lot1-route
const hrefPay = "/unit/payments"

// ok: ubiquitous-language-lot1-identifier, ubiquitous-language-lot1-route
const legacyPrefix = { from: "/unit/:unitId/liquidations", to: "/unit/:unitId/liquidacoes" }
// ok: ubiquitous-language-lot1-route
const legacyE2e = { from: `/kitchen/${kitchenId}/suprimentos` }
// ok: ubiquitous-language-lot1-route
const toForecastNew ={ to: "/kitchen/$kitchenId/demand-forecasts/$forecastId" }
// ok: ubiquitous-language-lot1-route
const toMenus = { to: "/global/weekly-menus" }
// ok: ubiquitous-language-lot1-route
const keywords = ["suprimentos", "compras"]

// ── Rótulos ─────────────────────────────────────────────────────────────────

// ruleid: ubiquitous-language-lot1-label
const title = "Planos Semanais Modelo"
// ruleid: ubiquitous-language-lot1-label
const nav = { title: "Apoios" }
// ruleid: ubiquitous-language-lot1-label
const counts = "Contagem Física"
// ruleid: ubiquitous-language-lot1-label
const source = { ata: "ATA (preço homologado)" }
// ruleid: ubiquitous-language-lot1-label
const research = "Pesquisa de preço"
// ruleid: ubiquitous-language-lot1-label
const module = { name: "Fiscal", hubUrl: "/messhall" }
// ruleid: ubiquitous-language-lot1-label, ubiquitous-language-lot8a-rancho
const qr = "Apresente este código ao Fiscal de Rancho"
// ruleid: ubiquitous-language-lot1-label, ubiquitous-language-lot8a-rancho
const ask = "Peça a designação ao chefe do rancho"

// ok: ubiquitous-language-lot1-label
const titleOk = "Cardápios Semanais Modelo"
// ok: ubiquitous-language-lot1-label
const navOk = { title: "Cardápios de Apoio" }
// ok: ubiquitous-language-lot1-label
const snack = "Lanche de Apoio"
// ok: ubiquitous-language-lot1-label
const countsOk = "Inventário Físico"
// ok: ubiquitous-language-lot1-label
const sourceOk = { ata: "ARP (preço registrado)" }
// ok: ubiquitous-language-lot1-label
const researchOk = "Pesquisa de preços"
// ok: ubiquitous-language-lot1-label
const moduleOk = { name: "Fiscal de rancho", hubUrl: "/messhall" }
// ok: ubiquitous-language-lot1-label
const askOk = "Peça a designação a quem tem Gestão Unidade"
// ruleid: ubiquitous-language-lot1-label
const toolDescription = "exception — na tela, \"Apoio\" (lanches de bordo)"
// ok: ubiquitous-language-lot1-label
const toolDescriptionOk = "exception — na tela, \"Cardápio de apoio\" (lanches de bordo)"

// ══ Lote 2: anexo quantitativo ══════════════════════════════════════════════

// ── Identificadores ─────────────────────────────────────────────────────────

// ruleid: ubiquitous-language-lot2-identifier
export function loadAta(ataId: string) {}
// ruleid: ubiquitous-language-lot2-identifier
const rows = await db.select().from(procurementListInProcurement)
// ruleid: ubiquitous-language-lot2-identifier
const items = await supabase.from("procurement_list_item").select("id").eq("list_id", id)
// ruleid: ubiquitous-language-lot2-identifier
type Limits = { maxMarginPercent: number; marginJustification: string | null }
// ruleid: ubiquitous-language-lot2-identifier
const need = { total_quantity: 10 }
// ruleid: ubiquitous-language-lot2-identifier
const listTool = { name: "list_atas" }
// ruleid: ubiquitous-language-lot2-identifier
const ata = await fetchQuantityEstimateDetails(db, ctx, input)
// ruleid: ubiquitous-language-lot2-identifier
requireUnit(ctx, 1, ata.unit_id)
// ruleid: ubiquitous-language-lot2-identifier
import { AtaWizard } from "@/components/features/local/ata/AtaWizard"
// ruleid: ubiquitous-language-lot2-identifier
const key = queryKeys.ata.detail(id)
// ruleid: ubiquitous-language-lot2-identifier
throw new DomainError("ATA_NOT_DRAFT", "fora do rascunho")

// ok: ubiquitous-language-lot2-identifier
const detail = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId })
// ok: ubiquitous-language-lot2-identifier
const numero = arp.numeroAtaRegistroPreco ?? formatNumeroAta(arp.numeroAta, arp.anoAta)
// ok: ubiquitous-language-lot2-identifier
const arpRow = await supabase.from("arp").select("numero_ata, ano_ata, status_ata")
// ok: ubiquitous-language-lot2-identifier
export const ACQUISITION_INSTRUMENTS = ["ata", "contrato", "nota_empenho", "outro"] as const
// ok: ubiquitous-language-lot2-identifier
const instrumentLabel = { ata: "Ata de registro de preços" }
// ok: ubiquitous-language-lot2-identifier
const role = "Papel da unidade na ata"
// ok: ubiquitous-language-lot2-identifier
const hint = "Busque a ata no Compras.gov.br ou, se a API não responder, cadastre à mão."
// ok: ubiquitous-language-lot2-identifier
const limits = { maxIncreasePercent: 20, maxQuantityJustification: null, estimated_quantity: 10 }
// ok: ubiquitous-language-lot2-identifier
// a antiga `procurement_list`, renomeada em 20260927040000

// ── Rotas ───────────────────────────────────────────────────────────────────

// ruleid: ubiquitous-language-lot2-route
const toAnnex = { to: "/unit/$unitId/procurement/$quantityEstimateId" }
// ruleid: ubiquitous-language-lot2-route
await page.goto(`/unit/${UNIT_ID}/procurement/new`)
// ruleid: ubiquitous-language-lot2-route
const nav = { url: "/unit/procurement" }
// ruleid: ubiquitous-language-lot2-route
const printQuantities = { to: "/unit/$unitId/quantity-estimates/print/quantities/$quantityEstimateId" }
// ruleid: ubiquitous-language-lot2-identifier, ubiquitous-language-lot2-route
routes.post("/ata/:ataId", handler)

// ok: ubiquitous-language-lot2-route
const toAnnexOk = { to: "/unit/$unitId/quantity-estimates/$quantityEstimateId" }
// ruleid: ubiquitous-language-lot2-route
const legacyAnnex = { from: "/unit/:unitId/procurement", to: "/unit/:unitId/quantity-estimates" }
// ok: ubiquitous-language-lot2-route
const pca = { url: "/analytics/procurement-plan", flow: `/unit/${unitId}/flows/procurement-planning` }
// ok: ubiquitous-language-lot2-route
routes.post("/quantity-estimates/:quantityEstimateId", handler)
// ok: ubiquitous-language-lot2-route
import { seedWeeklyTemplate } from "../helpers/procurement"

// ── Rótulos ─────────────────────────────────────────────────────────────────

// ruleid: ubiquitous-language-lot2-label
const publish = <Button>Publicar anexo</Button>
// ruleid: ubiquitous-language-lot2-label
const marginLabel = <Label>Margem padrão (%)</Label>
// ruleid: ubiquitous-language-lot2-label
const targetHead = <TableHead>Qtd Alvo</TableHead>
// ruleid: ubiquitous-language-lot2-label
updateStatus({ quantityEstimateId, status: "published" })
// ruleid: ubiquitous-language-lot2-label
const STATUS_LABELS = { draft: "Rascunho", published: "Concluído", archived: "Arquivado" }

// ok: ubiquitous-language-lot2-label
const conclude = <Button>Concluir anexo</Button>
// ok: ubiquitous-language-lot2-label
const STATUS_LABELS_OK = { draft: "Rascunho", completed: "Concluído", archived: "Arquivado" }
// ok: ubiquitous-language-lot2-label
const increaseLabel = <Label>Acréscimo sobre a estimada (%)</Label>
// ok: ubiquitous-language-lot2-label
const note = "Publicar é divulgar no PNCP (Lei 14.133, art. 54)."
// ok: ubiquitous-language-lot2-label
const preference = "margem de preferência (art. 26)"

// ══ Lote 3: pesquisa de preços e prefixos redundantes ══════════════════════

// ruleid: ubiquitous-language-lot3-identifier
const research = await supabase.from("procurement_pesquisa_preco").select("id")
// ruleid: ubiquitous-language-lot3-identifier
await tx.insert(procurementPesquisaPrecoItemInProcurement).values(rows)
// ruleid: ubiquitous-language-lot3-identifier
const ids = await supabase.rpc("upsert_compras_amostras", { p_samples: facts })
// ruleid: ubiquitous-language-lot3-identifier
const bridge = { research_item_id: itemId, amostra_id: sampleId }
// ruleid: ubiquitous-language-lot3-identifier
import type { AmostraPreco } from "../../workers/pesquisa-preco/types.ts"
// ruleid: ubiquitous-language-lot3-identifier
const analysis = analisarPrecos(catmat, descricao, raw, options)
// ruleid: ubiquitous-language-lot3-identifier
import { savePrecoAuditFn } from "@/server/price-research.fn"
// ruleid: ubiquitous-language-lot3-identifier
const arps = await supabase.from("procurement_arp_item").select("id").eq("arp_id", arpId)
// ruleid: ubiquitous-language-lot3-identifier
export type ProcurementArpItem = Tables<"arp_item">
// ruleid: ubiquitous-language-lot3-identifier
await db.delete(procurementSegmentRuleInProcurement).where(eq(procurementSegmentRuleInProcurement.id, ruleId))
// ruleid: ubiquitous-language-lot3-identifier
export const createProcurementSegmentFn = () => null
// ruleid: ubiquitous-language-lot3-identifier
import { useSegmentationOverview } from "@/hooks/data/useProcurementSegments"

// ok: ubiquitous-language-lot3-identifier
const researchOk = await supabase.from("price_research").select("id")
// ok: ubiquitous-language-lot3-identifier
const idsOk = await supabase.rpc("upsert_price_samples", { p_samples: facts })
// ok: ubiquitous-language-lot3-identifier
const bridgeOk = { research_item_id: itemId, price_sample_id: sampleId }
// ok: ubiquitous-language-lot3-identifier
import type { PriceSample } from "../../workers/price-research/types.ts"
// ok: ubiquitous-language-lot3-identifier
const ENDPOINT = "/modulo-pesquisa-preco/1_consultarMaterial" as const
// ok: ubiquitous-language-lot3-identifier
export type ArpItem = Tables<"arp_item">
// ok: ubiquitous-language-lot3-identifier
export const createSegmentFn = () => null
// ok: ubiquitous-language-lot3-identifier
const label = "Pesquisa de preços: amostras válidas, outliers e poluição"
// ok: ubiquitous-language-lot3-identifier
const flow = { to: "/unit/$unitId/flows/procurement-planning", spec: "procurement-segmentation.spec.ts" }
// ok: ubiquitous-language-lot3-identifier
// a antiga `procurement_pesquisa_preco`, renomeada em 20260927060000

// ── Lote 4: finanças ───────────────────────────────────────────────────────

// ruleid: ubiquitous-language-lot4-identifier
const credit = { dotacao: Number(row.dotacao) }
// ruleid: ubiquitous-language-lot4-identifier
const columns = ["id", "saldo_siafi", "empenhado_siafi"]
// ruleid: ubiquitous-language-lot4-identifier
const line = { saldoSiafi: 0 }
// ruleid: ubiquitous-language-lot4-identifier
const neSelect = fin.from("empenho").select("id, nd, ug_emitente")
// ruleid: ubiquitous-language-lot4-identifier
const neInput = z.object({ ugEmitente: z.string().nullable() })
// ruleid: ubiquitous-language-lot4-identifier
const SALDO_SIAFI_KEY = "available"

// ok: ubiquitous-language-lot4-identifier
const creditOk = { receivedCredit: Number(row.received_credit), availableCreditSiafi: Number(row.available_credit_siafi) }
// ok: ubiquitous-language-lot4-identifier
const neInputOk = z.object({ issuerUg: z.string().nullable() })
// ok: ubiquitous-language-lot4-identifier
const fromReport = { received_credit: Number(parsed.dotacao ?? 0) }
// ok: ubiquitous-language-lot4-identifier
const tooltip = "Numa UG executora não há dotação: há crédito descentralizado por nota de crédito."
// ok: ubiquitous-language-lot4-identifier
// A coluna antiga era dotacao; o espelho a mantém até o contract.

// ── Lote 7: arranchamento ──────────────────────────────────────────────────

// ruleid: ubiquitous-language-lot7-identifier
import { mealForecastsInKitchen } from "@iefa/database/drizzle/sisub"
// ruleid: ubiquitous-language-lot7-identifier
const rows = await supabase.schema("kitchen").from("meal_forecasts").select("user_id")
// ruleid: ubiquitous-language-lot7-identifier
import { useMealForecast } from "@/hooks/data/useMealForecast"
// ruleid: ubiquitous-language-lot7-identifier
export const upsertForecastFn = createServerFn({ method: "POST" })
// ruleid: ubiquitous-language-lot7-identifier
export type Metrics = { total_forecast: number; by_meal: ForecastRecord[] }
// ruleid: ubiquitous-language-lot7-identifier
const map = await listForecastMap(db, { date, meal, messHallId, userIds })
// ruleid: ubiquitous-language-lot7-identifier
const dialog = { open: true, systemForecast: null }
// ruleid: ubiquitous-language-lot7-identifier, ubiquitous-language-lot8a-rancho
export const RESTRICTED_PATHS = ["/opinion", "/rancho_previsoes"] as const

// ok: ubiquitous-language-lot7-identifier
import { arranchamentoInKitchen } from "@iefa/database/drizzle/sisub"
// ok: ubiquitous-language-lot7-identifier
export const upsertArranchamentoFn = createServerFn({ method: "POST" })
// ok: ubiquitous-language-lot7-identifier
export type MetricsOk = { total_arranchamentos: number; by_meal: ArranchamentoRecord[] }
// ok: ubiquitous-language-lot7-identifier
type DemandNames = DemandForecastRecord | DemandForecastMap | typeof upsertForecastSelection
// ok: ubiquitous-language-lot7-identifier
const menu = { forecastedHeadcount: 300, forecasted_headcount: 300 }
// ok: ubiquitous-language-lot7-identifier
const demand = { forecastId, pendingForecasts: 1, forecast: null }
// ok: ubiquitous-language-lot7-identifier
const { mutate: deleteForecast } = useDeleteDemandForecast()
// ok: ubiquitous-language-lot7-identifier
export const LEGACY_ARRANCHAMENTO_PATH = "/rancho_previsoes"
// ok: ubiquitous-language-lot7-identifier
expect(validateSql("SELECT * FROM meal_forecasts LIMIT 10")).toEqual({ valid: false, error: "Tabela não permitida: meal_forecasts" })
// ok: ubiquitous-language-lot7-identifier
// a antiga `kitchen.meal_forecasts`, renomeada em 20260927130000

// ruleid: ubiquitous-language-lot7-route
const toArranchamentoOld = { title: "Arranchamento", url: "/diner/forecast" }
// ruleid: ubiquitous-language-lot7-route
navigate({ to: "/diner/forecast" })

// ok: ubiquitous-language-lot7-route
const toArranchamento = { to: "/diner/arranchamento" }
// ok: ubiquitous-language-lot7-route
const legacyDiner = { from: "/diner/forecast", to: "/diner/arranchamento" }
// ok: ubiquitous-language-lot7-route
const demandRoute = { to: "/kitchen/$kitchenId/demand-forecasts/$forecastId" }

// ruleid: ubiquitous-language-lot7-label
const pageTitle = <PageHeader title="Previsão" />
// ruleid: ubiquitous-language-lot7-label
const totalLabel = <p className="text-caption">Total Previsto</p>
// ruleid: ubiquitous-language-lot7-label
const fiscalLine = "Previsão do sistema: Não previsto"

// ok: ubiquitous-language-lot7-label
const pageTitleOk = <PageHeader title="Arranchamento" />
// ok: ubiquitous-language-lot7-label
const totalLabelOk = <p className="text-caption">Total de arranchamentos</p>
// ok: ubiquitous-language-lot7-label
const navEntry = { title: "Arranchamento", keywords: ["previsão", "marcar refeição"] }
// ok: ubiquitous-language-lot7-label
const headcount = "Sem número, vale o efetivo previsto da refeição."
// ok: ubiquitous-language-lot7-label
const demandLabel = "Previsão de demanda das cozinhas"

// ── Lote 8a: "rancho" ──────────────────────────────────────────────────────

// ruleid: ubiquitous-language-lot8a-rancho
const allMessHalls = "Todos os ranchos"
// ruleid: ubiquitous-language-lot8a-rancho
export function listRanchos() {}
// ruleid: ubiquitous-language-lot8a-rancho
const selector = <SearchableSelect placeholder="Selecione um rancho..." />
// ruleid: ubiquitous-language-lot8a-rancho
const snackKit = { description: "Material de rancho entregue com os kits" }
// ruleid: ubiquitous-language-lot8a-rancho
const kitchenPrompt = `Use linguagem técnica militar quando apropriado (rancho, comensal, efetivo)`
// ruleid: ubiquitous-language-lot8a-rancho
const regularGroup = { key: "rancho", snackRequest: null }
// ruleid: ubiquitous-language-lot8a-rancho
const unitHint = "Pode ser compra fora do rancho; se não for, inclua a pasta."

// ok: ubiquitous-language-lot8a-rancho
const qrOk2 = "Apresente este código ao Fiscal de rancho para registrar sua presença."
// ok: ubiquitous-language-lot8a-rancho
const docsRow = "| `messhall` | `mess_hall_id` | Operadores de refeitório e Fiscais de rancho |"
// ok: ubiquitous-language-lot8a-rancho
const navItem = { title: "Locais", keywords: ["rancho", "refeitório", "cozinha", "om"] }
// ok: ubiquitous-language-lot8a-rancho
const allMessHallsOk = "Todos os refeitórios"
// ok: ubiquitous-language-lot8a-rancho
const analyticsSchema = `### mess_halls (refeitórios; quem pergunta pode dizer “rancho”)`
// ok: ubiquitous-language-lot8a-rancho
const NORM_REFS = { stops: "Recomendações — deslocamento com parada sem apoio de rancho" }
// ruleid: ubiquitous-language-lot8a-rancho
const stopNote = { text: "Há escala sem apoio de rancho: o lanche cobre o tempo total do deslocamento." }
// ok: ubiquitous-language-lot8a-rancho
const pi = "'339030', 'PIRANCHO', '120001'"
// ok: ubiquitous-language-lot8a-rancho
export const LEGACY_ARRANCHAMENTO_PATH = "/rancho_previsoes"
// ok: ubiquitous-language-lot8a-rancho
const tag = { tags: ["Arranchamento"], description: "Retorna quem está arranchado; will_eat = false é desarranchado" }
// ok: ubiquitous-language-lot8a-rancho
const roster = sql`delete from kitchen.workforce_submission where rancho_id in (select id from kitchen.rancho)`
// ok: ubiquitous-language-lot8a-rancho
export { createRancho, updateRancho, computeRanchoMetrics } from "./workforce.ts"
// ok: ubiquitous-language-lot8a-rancho
// o "rancho" da matriz de efetivo sai no lote 8b

// ── Lote 5: cardápio de apoio ──────────────────────────────────────────────

// ruleid: ubiquitous-language-lot5-identifier
const buckets = { exceptionSelections: [] }
// ruleid: ubiquitous-language-lot5-identifier
const { exceptionId } = Route.useParams()
// ruleid: ubiquitous-language-lot5-identifier
const isException = templateType === "apoio"
// ruleid: ubiquitous-language-lot5-identifier
function GlobalExceptionEditorPage() {}
// ruleid: ubiquitous-language-lot5-identifier
throw new DomainError("SNACK_STANDARD_NOT_EXCEPTION", "Só um cardápio de apoio pode ser padrão de lanche.")

// ok: ubiquitous-language-lot5-identifier
const bucketsOk = { supportMenuSelections: [] }
// ok: ubiquitous-language-lot5-identifier
const { supportMenuId } = Route.useParams()
// ok: ubiquitous-language-lot5-identifier
const approval = { exceptionReason: "Único responsável nível 3" }
// ok: ubiquitous-language-lot5-identifier
// o `isException` antigo virou `isSupportMenu`

// ruleid: ubiquitous-language-lot5-route
const toSupport = { to: "/kitchen/$kitchenId/exceptions/$supportMenuId" }
// ruleid: ubiquitous-language-lot5-route
const hrefSupport = `${kitchen}/exceptions`

// ok: ubiquitous-language-lot5-route
const toSupportOk = { to: "/kitchen/$kitchenId/support-menus/$supportMenuId" }
// ok: ubiquitous-language-lot5-route
const legacySupport = { from: "/global/exceptions", to: "/global/support-menus" }

// ruleid: ubiquitous-language-lot5-value
const receiptRoles = ["manager", "committee_member"]
// ruleid: ubiquitous-language-lot5-value
const designation = { role: "manager", source: "ato" }
// ruleid: ubiquitous-language-lot5-value
if (template.template_type === "exception") applySupportMenu()
// ruleid: ubiquitous-language-lot5-value
const menuItem = { originTemplateType: "exception" }
// ruleid: ubiquitous-language-lot5-value
const rules = await listPolicyRules(db, ctx, { target: "product" })
// ruleid: ubiquitous-language-lot5-value
const count = { kitchenId, type: "rotating", scope: "full" }
// ruleid: ubiquitous-language-lot5-value
const rows = await tx`select 1 from kitchen.menu_template where template_type = 'exception'`

// ok: ubiquitous-language-lot5-value
const receiptRolesOk = ["gestor", "membro_comissao"]
// ok: ubiquitous-language-lot5-value
if (template.template_type === "apoio") applySupportMenu()
// ok: ubiquitous-language-lot5-value
const countOk = { kitchenId, type: "rotativo", scope: "full" }
// ok: ubiquitous-language-lot5-value
span.recordException(new Error("exception"))
// ok: ubiquitous-language-lot5-value
const snack = { snack_family: "apoio" }
