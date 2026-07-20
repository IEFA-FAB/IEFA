-- Rastreabilidade de origem dos itens do cardápio diário.
--
-- Até aqui, um menu_item materializado por template (semanal, evento ou exceção)
-- era indistinguível de um item lançado à mão no DayDrawer. Eventos/exceções
-- passam a poder ser aplicados a datas do calendário (produção, não só Ata), e o
-- item materializado carrega de onde veio:
--   origin_template_id   → template que o gerou (null = lançado manualmente)
--   origin_template_type → regime do template no momento da aplicação (weekly |
--                          event | exception). Desnormalizado de propósito: o
--                          template pode mudar de tipo ou ser excluído depois.

alter table kitchen.menu_items
  add column origin_template_id uuid references kitchen.menu_template(id) on delete set null,
  add column origin_template_type text check (origin_template_type in ('weekly', 'event', 'exception'));

create index menu_items_origin_template_id_idx
  on kitchen.menu_items (origin_template_id)
  where origin_template_id is not null;
