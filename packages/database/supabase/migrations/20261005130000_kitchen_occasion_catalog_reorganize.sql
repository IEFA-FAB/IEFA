-- Reorganiza o catálogo global de eventos e cardápios de apoio nas pastas que a SDAB pediu
-- (2026-10-05) e separa as variantes que estavam num modelo só. Só dados; a estrutura veio em
-- 20261005120000. Ver openspec/changes/sisub-occasion-catalog-variants (design D6).
--
-- O modelo "Evento Café da manhã Padrão B" guardava cinco refeições que NÃO são servidas juntas
-- (café, brunch, almoço, coquetel, jantar): eram variantes. Cada uma vai para o modelo dela; os
-- modelos vazios de almoço, coquetel e jantar do Padrão B já existiam e recebem as refeições. O
-- brunch embutido foi substituído pelo modelo próprio "Evento Brunch Padrão B" (cadastro errado,
-- confirmado pela SDAB) e vai para a lixeira como modelo, restaurável. "Eventos Padrão C" (vazio)
-- vira a pasta Padrão C e o modelo vai para a lixeira.
--
-- As refeições e os itens trocam de modelo por UPDATE: ids de modelo, refeição e item ficam. Cada
-- passo confere o estado de partida pelo id, então rodar de novo (ou com um modelo já mexido) não
-- muda nada nem falha. Nada disto foi aplicado ao calendário nem adaptado por cozinha (conferido em
-- 2026-10-05: 0 menu_items com origem evento/apoio, 0 cópias locais).
--
-- A chave de cada grupo passa a seguir o rótulo (design D5): "Frios e ovos" com a chave
-- `sobremesa` virava a coluna de sobremesas de outro cardápio aplicado no mesmo dia.

-- Uma transação só: a CLI executa comando a comando, e uma falha no meio deixaria o catálogo
-- meio reorganizado. Trava as tabelas antes de tudo: aplicar migration com teste de integração
-- rodando já deu deadlock (40P01) neste banco.
begin;

lock table kitchen.menu_template, kitchen.menu_template_event_meal, kitchen.menu_template_items, kitchen.menu_template_folder in share row exclusive mode;

-- 1. Pastas (nomes e descrições das duas imagens da SDAB). Raiz antes da subpasta, pela FK.
insert into kitchen.menu_template_folder (id, template_type, parent_id, name, description, sort_order)
values
	('ef0d0fd3-b3c9-499a-88d4-82fee451515a'::uuid, 'event', null, 'Padrão A — Especial/Solene', 'Eventos solenes e especiais, com maior nível de elaboração e apresentação.', 0),
	('c6cf8b87-bab2-4f5d-adcd-1e25d4e682b8'::uuid, 'event', null, 'Padrão B — Institucional/Intermediário', 'Eventos institucionais e intermediários, com nível moderado de elaboração.', 1),
	('9c962a9e-7aab-4eeb-ae6a-e2e5bb1916db'::uuid, 'event', null, 'Padrão C — Simples/Operacional', 'Eventos operacionais e de menor complexidade, com preparações mais simples.', 2),
	('69f9eea2-9759-408b-bd56-fb468a70d595'::uuid, 'event', 'ef0d0fd3-b3c9-499a-88d4-82fee451515a'::uuid, 'Café da Manhã', 'Cardápios de café da manhã – Padrão A.', 0),
	('d99bf38d-dd59-43e8-ab03-0693127195c7'::uuid, 'event', 'ef0d0fd3-b3c9-499a-88d4-82fee451515a'::uuid, 'Brunch', 'Cardápios de brunch – Padrão A.', 1),
	('56d3c6dc-4891-4b75-9eac-d5fa4aca52ae'::uuid, 'event', 'ef0d0fd3-b3c9-499a-88d4-82fee451515a'::uuid, 'Almoço', 'Cardápios de almoço – Padrão A.', 2),
	('1beabf70-7ebb-4fdb-86c9-a5640173b20d'::uuid, 'event', 'ef0d0fd3-b3c9-499a-88d4-82fee451515a'::uuid, 'Coquetel', 'Cardápios de coquetel – Padrão A.', 3),
	('b9e03e0e-81d8-409d-bcfe-955ad1f401fb'::uuid, 'event', 'ef0d0fd3-b3c9-499a-88d4-82fee451515a'::uuid, 'Jantar', 'Cardápios de jantar – Padrão A.', 4),
	('e2193e3e-3301-45dc-b876-1b7c0e8435a2'::uuid, 'event', 'c6cf8b87-bab2-4f5d-adcd-1e25d4e682b8'::uuid, 'Café da Manhã', 'Cardápios de café da manhã – Padrão B.', 0),
	('9247fd5c-f6d5-4c51-8bad-20cc49ca01c7'::uuid, 'event', 'c6cf8b87-bab2-4f5d-adcd-1e25d4e682b8'::uuid, 'Brunch', 'Cardápios de brunch – Padrão B.', 1),
	('97ce7bd4-5a7a-4566-bfa7-8bc9edff7613'::uuid, 'event', 'c6cf8b87-bab2-4f5d-adcd-1e25d4e682b8'::uuid, 'Almoço', 'Cardápios de almoço – Padrão B.', 2),
	('adafa7fe-48e1-43c5-b603-7aafe730d348'::uuid, 'event', 'c6cf8b87-bab2-4f5d-adcd-1e25d4e682b8'::uuid, 'Coquetel', 'Cardápios de coquetel – Padrão B.', 3),
	('c62020fd-3504-415e-99e0-90a52b80d16e'::uuid, 'event', 'c6cf8b87-bab2-4f5d-adcd-1e25d4e682b8'::uuid, 'Jantar', 'Cardápios de jantar – Padrão B.', 4),
	('f4bc9fbd-cdc6-4692-98a4-adf7903878ce'::uuid, 'event', '9c962a9e-7aab-4eeb-ae6a-e2e5bb1916db'::uuid, 'Café da Manhã', 'Cardápios de café da manhã – Padrão C.', 0),
	('9b938d92-1fe0-4fdf-881a-2e85f2934452'::uuid, 'event', '9c962a9e-7aab-4eeb-ae6a-e2e5bb1916db'::uuid, 'Brunch', 'Cardápios de brunch – Padrão C.', 1),
	('881c84bb-af76-4eaa-a328-8b5771bea277'::uuid, 'event', '9c962a9e-7aab-4eeb-ae6a-e2e5bb1916db'::uuid, 'Almoço', 'Cardápios de almoço – Padrão C.', 2),
	('0e58d215-3a47-4b80-9c07-5058c65e96e2'::uuid, 'event', '9c962a9e-7aab-4eeb-ae6a-e2e5bb1916db'::uuid, 'Coquetel', 'Cardápios de coquetel – Padrão C.', 3),
	('843ad443-c28a-4c7d-9712-5f05e53216cc'::uuid, 'event', '9c962a9e-7aab-4eeb-ae6a-e2e5bb1916db'::uuid, 'Jantar', 'Cardápios de jantar – Padrão C.', 4),
	('f2fe2807-aadf-4536-97ea-7292b5ccb494'::uuid, 'apoio', null, 'APOIO DE REUNIÕES E PALESTRAS', 'Cardápios de apoio para reuniões e palestras.', 0),
	('6d8292a8-2672-48e6-9e89-226ba46e0541'::uuid, 'apoio', null, 'APOIO SALA VIP', 'Cardápios de apoio para Sala VIP.', 1),
	('75d090a9-e43f-45c2-95be-62b1d636b4cd'::uuid, 'apoio', null, 'KIT REPOUSAR', 'Kits para repousar.', 2),
	('e8db2d95-ad6b-404a-badc-bc8ef015180b'::uuid, 'apoio', null, 'LANCHE DE APOIO', 'Lanches de apoio para eventos e atividades.', 3),
	('6b996848-14c3-43b7-b380-947bc1b09d36'::uuid, 'apoio', null, 'LANCHE DE BORDO', 'Lanches para bordo.', 4),
	('0f207f98-3994-47a9-bdff-f0a38c36eed3'::uuid, 'apoio', null, 'LANCHE TERRESTRE', 'Lanches para atividades terrestres.', 5),
	('045d3d37-3cb8-40c8-ad5a-2e27c19563f3'::uuid, 'apoio', 'f2fe2807-aadf-4536-97ea-7292b5ccb494'::uuid, 'CLASSE A', 'Opções de maior elaboração.', 0),
	('a49ac4e8-8bea-4c3b-8ddc-50a862443f3d'::uuid, 'apoio', 'f2fe2807-aadf-4536-97ea-7292b5ccb494'::uuid, 'CLASSE B', 'Opções intermediárias.', 1),
	('8c4459f7-711b-40c7-9f07-1de7676d0d63'::uuid, 'apoio', '6d8292a8-2672-48e6-9e89-226ba46e0541'::uuid, 'CLASSE A', 'Opções de maior elaboração.', 0),
	('d44372e3-a568-4a3c-aa13-fc1a028bcb20'::uuid, 'apoio', '6d8292a8-2672-48e6-9e89-226ba46e0541'::uuid, 'CLASSE B', 'Opções intermediárias.', 1),
	('0a60b75e-8519-4d08-aebe-63d4b1a9c5b6'::uuid, 'apoio', '75d090a9-e43f-45c2-95be-62b1d636b4cd'::uuid, 'CLASSE A', 'Composições mais elaboradas.', 0),
	('6138b041-5a77-4c51-8902-2f45a638d0b0'::uuid, 'apoio', '75d090a9-e43f-45c2-95be-62b1d636b4cd'::uuid, 'CLASSE B', 'Composições intermediárias.', 1),
	('ae014321-407e-4f8c-86cc-f56f89c17442'::uuid, 'apoio', 'e8db2d95-ad6b-404a-badc-bc8ef015180b'::uuid, 'CLASSE A', 'Opções de maior elaboração.', 0),
	('d968ab4f-d2c1-45c1-aef0-c0c695714e61'::uuid, 'apoio', 'e8db2d95-ad6b-404a-badc-bc8ef015180b'::uuid, 'CLASSE B', 'Opções intermediárias.', 1),
	('7028f68c-284e-4961-b706-f0df282576d5'::uuid, 'apoio', 'e8db2d95-ad6b-404a-badc-bc8ef015180b'::uuid, 'CLASSE C', 'Opções simples/operacionais.', 2),
	('5553e5f3-6917-4779-849a-255d340b0c18'::uuid, 'apoio', '6b996848-14c3-43b7-b380-947bc1b09d36'::uuid, 'CLASSE A', 'Opções de maior elaboração.', 0),
	('05985c1e-7cc3-441a-816b-98953c63f1cc'::uuid, 'apoio', '6b996848-14c3-43b7-b380-947bc1b09d36'::uuid, 'CLASSE B', 'Opções intermediárias.', 1),
	('9d83757d-1fb4-4c62-b763-7d0e6dc9881c'::uuid, 'apoio', '6b996848-14c3-43b7-b380-947bc1b09d36'::uuid, 'CLASSE C', 'Opções simples/operacionais.', 2),
	('30fc90a7-8bc0-4618-afb2-f4e0400bc3fb'::uuid, 'apoio', '0f207f98-3994-47a9-bdff-f0a38c36eed3'::uuid, 'CLASSE A', 'Opções de maior elaboração.', 0),
	('58ff0bf0-811d-4881-8164-296f434c4ade'::uuid, 'apoio', '0f207f98-3994-47a9-bdff-f0a38c36eed3'::uuid, 'CLASSE B', 'Opções intermediárias.', 1)
on conflict (id) do nothing;

-- 2. Brunch embutido no café Padrão B: vira modelo próprio, na lixeira.
insert into kitchen.menu_template (id, name, description, kitchen_id, template_type, deleted_at)
select '55b19125-718d-4cb8-8178-7f4d8ef87971'::uuid, 'Brunch Padrão B (cadastro anterior)',
	'Estava dentro de "Evento Café da manhã Padrão B". Substituído por "Evento Brunch Padrão B"; restaure se for uma segunda opção (com outro nome).',
	null, 'event', now()
where exists (select 1 from kitchen.menu_template_event_meal where id = '0e7b169f-1a04-4003-8708-012d5fbf546d' and menu_template_id = '9be7dd33-44d7-4920-bb5d-0b91af7fa947')
on conflict (id) do nothing;

-- 3. Cada refeição do café Padrão B que não é café vai para o modelo dela, com os itens.
with moves(meal_id, target_id) as (
	values
		('36bcbef9-ec10-487c-b988-43b83bd7a076'::uuid, 'fab3640b-6900-4c15-b67d-a3c1d49e2da1'::uuid),
		('54cdec8f-8689-4419-9c56-dfae8ddac14d'::uuid, '869095c8-187a-4669-b3e2-c2ae85981bc0'::uuid),
		('322165bb-0f32-4a06-b0f6-a922b3b2ce53'::uuid, 'cd5c9629-771a-4220-a4ca-3b62a29d814d'::uuid),
		('0e7b169f-1a04-4003-8708-012d5fbf546d'::uuid, '55b19125-718d-4cb8-8178-7f4d8ef87971'::uuid)
),
movable as (
	select m.meal_id, m.target_id
	from moves m
	join kitchen.menu_template_event_meal e on e.id = m.meal_id and e.menu_template_id = '9be7dd33-44d7-4920-bb5d-0b91af7fa947'
	join kitchen.menu_template t on t.id = m.target_id
	-- O destino precisa continuar vazio: se a SDAB já montou a refeição lá, não sobrepõe.
	where not exists (select 1 from kitchen.menu_template_event_meal x where x.menu_template_id = m.target_id)
),
moved_items as (
	update kitchen.menu_template_items i
	set menu_template_id = mv.target_id
	from movable mv
	where i.event_meal_id = mv.meal_id
	returning i.id
)
update kitchen.menu_template_event_meal e
set menu_template_id = mv.target_id, sort_order = 0
from movable mv
where e.id = mv.meal_id;

update kitchen.menu_template_event_meal set sort_order = 0
where id = 'c759668d-2645-42ff-bd76-fad95de649c7' and menu_template_id = '9be7dd33-44d7-4920-bb5d-0b91af7fa947';

-- 4. Cada modelo na pasta do nome.
with placement(template_id, folder_id) as (
	values
	('a6189831-e99c-4a06-a669-61484bbefe19'::uuid, '69f9eea2-9759-408b-bd56-fb468a70d595'::uuid),
	('728bad9d-0e45-40e2-8f9d-8a3d1f61ada4'::uuid, 'd99bf38d-dd59-43e8-ab03-0693127195c7'::uuid),
	('9be7dd33-44d7-4920-bb5d-0b91af7fa947'::uuid, 'e2193e3e-3301-45dc-b876-1b7c0e8435a2'::uuid),
	('68936539-7190-4d14-ad3f-19b713621b16'::uuid, '9247fd5c-f6d5-4c51-8bad-20cc49ca01c7'::uuid),
	('fab3640b-6900-4c15-b67d-a3c1d49e2da1'::uuid, '97ce7bd4-5a7a-4566-bfa7-8bc9edff7613'::uuid),
	('869095c8-187a-4669-b3e2-c2ae85981bc0'::uuid, 'adafa7fe-48e1-43c5-b603-7aafe730d348'::uuid),
	('cd5c9629-771a-4220-a4ca-3b62a29d814d'::uuid, 'c62020fd-3504-415e-99e0-90a52b80d16e'::uuid),
	('55b19125-718d-4cb8-8178-7f4d8ef87971'::uuid, '9247fd5c-f6d5-4c51-8bad-20cc49ca01c7'::uuid),
	('d8991512-ffc5-4d56-bb97-8379a12856a7'::uuid, '045d3d37-3cb8-40c8-ad5a-2e27c19563f3'::uuid),
	('6fd05b2d-ae73-48f6-ae11-fe25e106fb4d'::uuid, 'a49ac4e8-8bea-4c3b-8ddc-50a862443f3d'::uuid),
	('a3c04a54-2415-4c6e-bee6-93f14a6d54af'::uuid, '8c4459f7-711b-40c7-9f07-1de7676d0d63'::uuid),
	('06fece28-1168-42e6-a502-cd9e31b1fbcb'::uuid, 'd44372e3-a568-4a3c-aa13-fc1a028bcb20'::uuid),
	('c6847043-35d6-4179-a577-62cc834e2f91'::uuid, '0a60b75e-8519-4d08-aebe-63d4b1a9c5b6'::uuid),
	('30674554-8c18-4ce6-b407-e698c67814d1'::uuid, '6138b041-5a77-4c51-8902-2f45a638d0b0'::uuid),
	('30b34c73-8890-4e32-b60e-9a45b3e15811'::uuid, 'ae014321-407e-4f8c-86cc-f56f89c17442'::uuid),
	('5c168222-fa25-455f-b8c2-64e6d6e69cba'::uuid, 'd968ab4f-d2c1-45c1-aef0-c0c695714e61'::uuid),
	('6aa85cd9-1e67-4162-810b-9ed9946760b1'::uuid, '7028f68c-284e-4961-b706-f0df282576d5'::uuid),
	('eb0e6037-d698-4674-964c-bd1aed2cd0b9'::uuid, '5553e5f3-6917-4779-849a-255d340b0c18'::uuid),
	('00f6ef7b-29ed-4370-aef5-b09dd0e31055'::uuid, '05985c1e-7cc3-441a-816b-98953c63f1cc'::uuid),
	('1f007f86-9b25-4ebf-b9b5-01125c7a5ffc'::uuid, '9d83757d-1fb4-4c62-b763-7d0e6dc9881c'::uuid),
	('7adffa52-b5c3-4a35-8111-13efc655c16c'::uuid, '30fc90a7-8bc0-4618-afb2-f4e0400bc3fb'::uuid),
	('33a9d469-b814-477c-8f9b-7a7232e55f06'::uuid, '58ff0bf0-811d-4881-8164-296f434c4ade'::uuid)
)
update kitchen.menu_template t
set folder_id = p.folder_id
from placement p
where t.id = p.template_id and t.kitchen_id is null and t.folder_id is null;

-- 5. "Eventos Padrão C": o papel dele virou a pasta. Vazio, vai para a lixeira.
update kitchen.menu_template t
set deleted_at = now()
where t.id = 'aa466501-012d-46ee-8217-c8a6473ec2b5'
	and t.deleted_at is null
	and not exists (select 1 from kitchen.menu_template_event_meal e where e.menu_template_id = t.id)
	and not exists (select 1 from kitchen.menu_template_items i where i.menu_template_id = t.id);

-- 6. Chave do grupo pelo rótulo (mesma regra de `eventGroupKeyFor`, conferida rótulo a rótulo).
--    Itens primeiro, lendo a composição ainda com a chave antiga.
with label_key(label, key) as (
	values
		('Bebidas Quentes', 'bebidas_quentes'),
		('Bebidas Frias', 'bebidas_frias'),
		('Pães', 'paes'),
		('Acompanhamento', 'acompanhamento'),
		('Acompanhamentos', 'acompanhamentos'),
		('Frios e Ovos', 'frios_e_ovos'),
		('Frios e ovos', 'frios_e_ovos'),
		('Bolos', 'bolos'),
		('Frutas', 'fruta'),
		('Complementos', 'complemento'),
		('Salada', 'salada'),
		('Prato principal', 'prato_principal'),
		('Guarnição', 'guarnicao'),
		('Sobremesas', 'sobremesa'),
		('Bebidas', 'bebida'),
		('Salgados', 'salgados'),
		('Volantes', 'volante'),
		('Doces e Sobremesas', 'doces_e_sobremesas')
),
remap as (
	select e.id as meal_id, g ->> 'key' as old_key, lk.key as new_key
	from kitchen.menu_template_event_meal e
	cross join lateral jsonb_array_elements(e.groups) g
	join label_key lk on lk.label = g ->> 'label'
	where e.menu_template_id in ('a6189831-e99c-4a06-a669-61484bbefe19'::uuid, '728bad9d-0e45-40e2-8f9d-8a3d1f61ada4'::uuid, '9be7dd33-44d7-4920-bb5d-0b91af7fa947'::uuid, '68936539-7190-4d14-ad3f-19b713621b16'::uuid, 'fab3640b-6900-4c15-b67d-a3c1d49e2da1'::uuid, '869095c8-187a-4669-b3e2-c2ae85981bc0'::uuid, 'cd5c9629-771a-4220-a4ca-3b62a29d814d'::uuid, '55b19125-718d-4cb8-8178-7f4d8ef87971'::uuid)
		and g ->> 'key' is distinct from lk.key
)
update kitchen.menu_template_items i
set item_group = r.new_key
from remap r
where i.event_meal_id = r.meal_id and i.item_group = r.old_key;

with label_key(label, key) as (
	values
		('Bebidas Quentes', 'bebidas_quentes'),
		('Bebidas Frias', 'bebidas_frias'),
		('Pães', 'paes'),
		('Acompanhamento', 'acompanhamento'),
		('Acompanhamentos', 'acompanhamentos'),
		('Frios e Ovos', 'frios_e_ovos'),
		('Frios e ovos', 'frios_e_ovos'),
		('Bolos', 'bolos'),
		('Frutas', 'fruta'),
		('Complementos', 'complemento'),
		('Salada', 'salada'),
		('Prato principal', 'prato_principal'),
		('Guarnição', 'guarnicao'),
		('Sobremesas', 'sobremesa'),
		('Bebidas', 'bebida'),
		('Salgados', 'salgados'),
		('Volantes', 'volante'),
		('Doces e Sobremesas', 'doces_e_sobremesas')
)
update kitchen.menu_template_event_meal e
set groups = (
	select jsonb_agg(case when lk.key is null then g.value else jsonb_set(g.value, '{key}', to_jsonb(lk.key)) end order by g.ordinality)
	from jsonb_array_elements(e.groups) with ordinality g
	left join label_key lk on lk.label = g.value ->> 'label'
)
where e.menu_template_id in ('a6189831-e99c-4a06-a669-61484bbefe19'::uuid, '728bad9d-0e45-40e2-8f9d-8a3d1f61ada4'::uuid, '9be7dd33-44d7-4920-bb5d-0b91af7fa947'::uuid, '68936539-7190-4d14-ad3f-19b713621b16'::uuid, 'fab3640b-6900-4c15-b67d-a3c1d49e2da1'::uuid, '869095c8-187a-4669-b3e2-c2ae85981bc0'::uuid, 'cd5c9629-771a-4220-a4ca-3b62a29d814d'::uuid, '55b19125-718d-4cb8-8178-7f4d8ef87971'::uuid)
	and jsonb_array_length(e.groups) > 0
	and exists (
		select 1 from jsonb_array_elements(e.groups) g2 join label_key lk2 on lk2.label = g2 ->> 'label' where g2 ->> 'key' is distinct from lk2.key
	);

commit;
