// Casos de teste de `.opengrep/rules/ubiquitous-language.yaml`. Não é código do app: fica fora de
// `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/ubiquitous-language.yaml .opengrep/rules/__fixtures__/ubiquitous-language.ts
// (as regras restringem `paths` ao sisub; no modo de teste o Opengrep ignora `paths`.)

// ── Identificadores ─────────────────────────────────────────────────────────

// ruleid: ubiquitous-language-lot1-identifier
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
