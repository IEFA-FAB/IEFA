## 1. Descoberta

- [ ] 1.1 [database] Descobrir quem carrega `core.user_military_data` e como (insert/replace, ordem, frequência, se reescreve CPF); a carga está fora do repo
- [ ] 1.2 [database] Inventariar os leitores do espelho (não só `nrCpf`): `git grep` por `user_military_data`, `userMilitaryData`, `nmPessoa`; `pg_views`/`pg_proc`/`pg_depend` no banco

## 2. Migration (espera o mantenedor)

- [ ] 2.1 [database] PK física `id` identity; `UNIQUE` no CPF; views dependentes recriadas
- [ ] 2.2 [database] View `core.military_identity` (`saram`, `posto`, `nome_guerra`, `sg_org`, `data_atualizacao`), só servidor
- [ ] 2.3 [database] No mesmo PR, depois de aplicar: `db:types` e `db:drizzle:pull` (o pull deixa de declarar `nrCpf` como PK)

## 3. Apps e gate

- [ ] 3.1 [sisub] [sisub-domain] [sucont] [rumaer] Leituras pela view; perfil do titular com o CPF mascarado por função do servidor
- [ ] 3.2 [root] Regra `.opengrep/rules/` contra leitura de `nrCpf`/`nmPessoa` fora da allowlist com motivo

## 4. Fechamento

- [ ] 4.1 [root] `bun run check`, `bun run lint --concurrency=2`, `bun run test --concurrency=2`
