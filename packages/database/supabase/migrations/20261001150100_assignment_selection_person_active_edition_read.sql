-- assignment_selection_person_active_edition_read
-- O anônimo (telão público) lê `assignment_selection.person` só da edição ATIVA.
--
-- ── Por quê ──────────────────────────────────────────────────────────────────
--
-- A policy `public read person` era `using (true)` para anon/authenticated: qualquer um com a
-- chave publicável (que está no bundle) listava pelo PostgREST os militares de TODAS as
-- edições, inclusive a de 2025, encerrada. O telão só mostra a edição ativa, e o controlador
-- lê pelo service role (server function com `requireAccess`), sem depender desta policy.
--
-- ── Por que não também `not hide_card` ──────────────────────────────────────
--
-- Avaliado e descartado. Na edição ativa, o militar confirmado (`hide_card`) é justamente o
-- que o telão exibe em público: rosto, nome e OM no mapa. Esconder a linha dele não protege
-- nada, e com RLS o Realtime deixa de entregar ao anônimo o UPDATE que a torna invisível — o
-- telão perderia o push da CONFIRMAÇÃO (o card sair e o rosto ir para o mapa) e ficaria até
-- 2 s no poll, no momento central do evento. A prioridade do mantenedor é o telão fluido.
--
-- ── Custo ──────────────────────────────────────────────────────────────────
--
-- `exists` sobre `edition` pela PK (duas linhas hoje). O Realtime avalia a policy por mudança
-- e por assinante; o telão é um assinante, o controlador outro.
--
-- Nenhuma tabela nova. Idempotente.

drop policy if exists "public read person" on assignment_selection.person;
create policy "public read person" on assignment_selection.person
	for select
	to anon, authenticated
	using (
		exists (
			select 1
				from assignment_selection.edition e
				where e.id = person.edition_id
					and e.active
		)
	);
