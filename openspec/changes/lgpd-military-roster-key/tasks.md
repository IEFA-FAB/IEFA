## 1. Descoberta

- [ ] 1.1 [database] Descobrir quem carrega `core.user_military_data` e como (insert/replace, ordem, frequência); a carga está fora do repo
- [ ] 1.2 [database] Conferir que nenhum código ou função lê o CPF além do perfil mascarado (`git grep nrCpf`, `pg_proc`, `pg_views`)

## 2. Migration (espera o mantenedor)

- [ ] 2.1 [database] `nrOrdem` `NOT NULL` + `UNIQUE`; PK física nova (ou `nrOrdem` como PK) no lugar do CPF; FK `core.user_data."nrOrdem"` → `user_military_data."nrOrdem"` (tratar os 87 sem par e os 3 duplicados em `user_data`)
- [ ] 2.2 [database] View `core.military_identity` (snake_case, sem CPF); grants só de servidor
- [ ] 2.3 [database] Regerar tipos

## 3. Apps

- [ ] 3.1 [sisub] Perfil lê o CPF mascarado por função do servidor; o resto pela view
- [ ] 3.2 [sucont] [rumaer] [api] Leituras pela view

## 4. Fechamento

- [ ] 4.1 [root] `bun run check`, `bun run lint --concurrency=2`, `bun run test --concurrency=2`
