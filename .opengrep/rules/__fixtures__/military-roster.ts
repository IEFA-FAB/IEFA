// Casos de teste de `.opengrep/rules/military-roster.yaml`. Não é código do app: fica fora de
// `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/military-roster.yaml .opengrep/rules/__fixtures__/military-roster.ts
// (no modo de teste o Opengrep ignora `paths`, inclusive a allowlist.)

// ── CPF e nome completo ─────────────────────────────────────────────────────

// ruleid: military-roster-personal-data, military-roster-raw-table
const cpf = await core.from("user_military_data").select("nrCpf").eq("nrOrdem", saram)
// ruleid: military-roster-personal-data, military-roster-raw-table
const row = { nome: userMilitaryDataInCore.nmPessoa }
// ruleid: military-roster-personal-data
const label = military?.nmGuerra || military?.nmPessoa || null
// ruleid: military-roster-personal-data, military-roster-raw-table
const joined = sql`select m."nrCpf" from core.user_military_data m`
// ruleid: military-roster-personal-data
type Leaky = { nr_cpf: string }

// ok: military-roster-personal-data
const identity = await core.from("military_identity").select("saram, posto, nome_guerra")
// ok: military-roster-personal-data
const masked = { maskedCpf: await fetchMaskedCpf(db, { nrOrdem }) }
// ok: military-roster-personal-data
// O CPF (`nrCpf`) e o nome completo (`nmPessoa`) não saem do banco.
// ok: military-roster-personal-data
/** Sem `nmPessoa`: a view não o tem. */

// ── Tabela crua ─────────────────────────────────────────────────────────────

// ruleid: military-roster-raw-table
const raw = await getCoreClient().from("user_military_data").select("nrOrdem, sgPosto")
// ruleid: military-roster-raw-table
const rows = await db.select({ saram: userMilitaryDataInCore.nrOrdem }).from(userMilitaryDataInCore)
// ruleid: military-roster-raw-table
const viaSql = sql`left join core.user_military_data m on m."nrOrdem" = u."nrOrdem"`

// ok: military-roster-raw-table
const view = await getCoreClient().from("military_identity").select("saram, posto, nome_guerra").in("saram", wanted)
// ok: military-roster-raw-table
const drizzleView = await db.select({ saram: militaryIdentityInCore.saram }).from(militaryIdentityInCore)
// ok: military-roster-raw-table
const viaView = sql`left join core.military_identity m on m.saram = u."nrOrdem"`
// ok: military-roster-raw-table
expect(backfill).not.toContain("user_military_data")
// ok: military-roster-raw-table
// A carga escreve em `core.user_military_data`; os apps leem a view.
