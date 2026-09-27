-- Linguagem ubíqua do sisub, lote 8a (change `sisub-ubiquitous-language`, D10): "rancho" sai dos
-- textos do sistema gravados como dado. "Rancho" é ambíguo (refeitório, cozinha ou a unidade com a
-- sua subsistência); nestes três textos ele quer dizer a subsistência da OM.
--
-- Só dado, sem DDL. Cada `update` casa pelo id E pelo texto atual: rodar de novo não muda nada, e
-- um texto que alguém já editou pela tela não é sobrescrito. Não casa por `policy_rule.target`,
-- que o lote 5 troca (`product` → `ingredient`).
--
-- Fica de fora o refeitório de código e nome "Rancho" da EEAR (`kitchen.mess_halls`): é cadastro,
-- renomeado pela tela Locais. Texto livre de usuário (`kitchen.opinions`, `kitchen.workforce_note`)
-- também fica (D3).

-- Regra de política dos insumos.
update procurement.policy_rule
   set title = 'Sem itens impróprios para a alimentação coletiva militar',
       updated_at = now()
 where id = '7fb176c5-42ce-4bfd-897a-e05e0f3fdc2a'
   and title = 'Sem itens impróprios para rancho militar FAB';

update procurement.policy_rule
   set description = 'O insumo não deve ser um item impróprio para a alimentação coletiva militar da Força Aérea Brasileira. São impróprios: bebidas alcoólicas (cerveja, cachaça, vinho, destilados), itens de uso recreativo, produtos não alimentares ou de higiene pessoal que não tenham função culinária.',
       updated_at = now()
 where id = '7fb176c5-42ce-4bfd-897a-e05e0f3fdc2a'
   and description = 'O insumo não deve ser um item impróprio para serviço em rancho militar da Força Aérea Brasileira. São impróprios: bebidas alcoólicas (cerveja, cachaça, vinho, destilados), itens de uso recreativo, produtos não alimentares ou de higiene pessoal que não tenham função culinária.';

-- Regra de política das preparações.
update procurement.policy_rule
   set title = 'Sem itens impróprios para a alimentação coletiva militar',
       updated_at = now()
 where id = 'fab7f0aa-bdef-43e3-b293-a5f16c3663e7'
   and title = 'Sem itens impróprios para rancho militar FAB';

update procurement.policy_rule
   set description = 'A preparação não deve conter ingredientes impróprios para a alimentação coletiva militar da Força Aérea Brasileira. São impróprios: bebidas alcoólicas como cerveja, cachaça, vinho ou qualquer destilado como ingrediente; ingredientes de uso recreativo; ou itens que não tenham função culinária em preparações de alimentação coletiva militar.',
       updated_at = now()
 where id = 'fab7f0aa-bdef-43e3-b293-a5f16c3663e7'
   and description = 'A preparação não deve conter ingredientes impróprios para serviço em rancho militar da Força Aérea Brasileira. São impróprios: bebidas alcoólicas como cerveja, cachaça, vinho ou qualquer destilado como ingrediente; ingredientes de uso recreativo; ou itens que não tenham função culinária em preparações de alimentação coletiva militar.';

-- Cartão do sisub no portal.
update iefa.apps
   set description = 'Sistema de Subsistência da FAB — cardápios, receitas, planejamento, compras e analytics da subsistência. Muito além da previsão.'
 where id = '54956df1-bcde-4f41-9e1e-c62ace67447d'
   and description = 'Sistema de Subsistência da FAB — cardápios, receitas, planejamento, compras e analytics do rancho. Muito além da previsão.';
