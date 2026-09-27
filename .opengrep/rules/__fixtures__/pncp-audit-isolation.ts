// Casos de teste de `.opengrep/rules/pncp-audit-isolation.yaml`. Não é código do app: fica fora de
// `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/pncp-audit-isolation.yaml .opengrep/rules/__fixtures__/pncp-audit-isolation.ts
// (a regra restringe `paths` ao código do PNCP; no modo de teste o Opengrep ignora `paths`.)

// ruleid: pncp-must-not-write-price-audit
await supabase.from("price_sample").insert(rows)
// ruleid: pncp-must-not-write-price-audit
await supabase.rpc("upsert_price_samples", { p_samples: rows })
// ruleid: pncp-must-not-write-price-audit
await tx.insert(priceSampleInProcurement).values(rows)
// ruleid: pncp-must-not-write-price-audit
await tx.insert(priceResearchSampleInProcurement).values(bridge)
// ruleid: pncp-must-not-write-price-audit
await tx.execute(sql`select t.id from procurement.upsert_price_samples(${payload}::jsonb) as t(id)`)
// ruleid: pncp-must-not-write-price-audit
await tx.execute(sql`insert into procurement.price_research_item (research_id) values (${id})`)

// ok: pncp-must-not-write-price-audit
await supabase.from("pncp_contratacao").insert(rows)
// ok: pncp-must-not-write-price-audit
await tx.insert(pncpItemInComprasGovIntegration).values(rows)
