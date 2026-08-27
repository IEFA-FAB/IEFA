-- Encerrar uma pane exige AUTOR, não só data.
--
-- O check original (`20260827120000`) cobrava apenas `resolved_at` em `resolved`/`dismissed`,
-- enquanto o próprio comentário da constraint prometia "quem encerrou e quando". Na prática
-- dava para descartar um relato com `resolved_by` null e sem uma linha de justificativa — e
-- `dismissed` é exatamente a decisão que devolve um equipamento quebrado ao cálculo do
-- planejamento. Uma unidade voltava a contar para o cardápio sem ninguém responsável pelo
-- retorno e sem motivo registrado.
--
-- `resolution_note` é exigida só em `dismissed`: consertar é o desfecho esperado e o log de
-- manutenção já conta a história; descartar contraria quem relatou e precisa dizer por quê.

alter table kitchen.equipment_issue
	drop constraint if exists equipment_issue_closure_check;

alter table kitchen.equipment_issue
	add constraint equipment_issue_closure_check check (
		(status in ('open', 'in_repair') and resolved_at is null and resolved_by is null)
		or (status = 'resolved' and resolved_at is not null and resolved_by is not null)
		or (
			status = 'dismissed'
			and resolved_at is not null
			and resolved_by is not null
			and resolution_note is not null
			and length(btrim(resolution_note)) > 0
		)
	);

comment on constraint equipment_issue_closure_check on kitchen.equipment_issue is
	'Aberta/em reparo não tem desfecho gravado; encerrada tem quem encerrou e quando. Descartada exige ainda a justificativa: é a decisão que devolve a unidade ao planejamento contra o relato de quem opera.';
