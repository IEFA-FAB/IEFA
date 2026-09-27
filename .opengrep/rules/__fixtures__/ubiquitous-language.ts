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
// ruleid: ubiquitous-language-lot1-label
const qr = "Apresente este código ao Fiscal de Rancho"
// ruleid: ubiquitous-language-lot1-label
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
const arpRow = await supabase.from("procurement_arp").select("numero_ata, ano_ata, status_ata")
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
