-- Linguagem ubíqua do sisub, lote 8a (change `sisub-ubiquitous-language`, D10): "rancho" sai dos
-- textos do sistema gravados como dado. "Rancho" é ambíguo (refeitório, cozinha ou a unidade com a
-- sua subsistência); nestes três textos ele quer dizer a subsistência da OM.
--
-- Só dado, sem DDL. Cada `update` casa pelo texto atual, não pelo id: as linhas nasceram com
-- `gen_random_uuid()` (`20260411_policy_rules.sql`, `iefa.apps`), então o id difere entre um banco
-- montado pelas migrations e o compartilhado. Rodar de novo não muda nada, e um texto que alguém
-- já editou pela tela não é sobrescrito. Não casa por `policy_rule.target`, que o lote 5 troca
-- (`product` → `ingredient`). As duas regras (insumo e preparação) têm o mesmo título.
--
-- Fica de fora o refeitório de código e nome "Rancho" da EEAR (`kitchen.mess_halls`): é cadastro,
-- renomeado pela tela Locais. Texto livre de usuário (`kitchen.opinions`, `kitchen.workforce_note`)
-- também fica (D3).

-- Título das duas regras (insumo e preparação).
update procurement.policy_rule
   set title = 'Sem itens impróprios para a alimentação coletiva militar',
       updated_at = now()
 where title = 'Sem itens impróprios para rancho militar FAB';

-- Regra de política dos insumos.
update procurement.policy_rule
   set description = 'O insumo não deve ser um item impróprio para a alimentação coletiva militar da Força Aérea Brasileira. São impróprios: bebidas alcoólicas (cerveja, cachaça, vinho, destilados), itens de uso recreativo, produtos não alimentares ou de higiene pessoal que não tenham função culinária.',
       updated_at = now()
 where description = 'O insumo não deve ser um item impróprio para serviço em rancho militar da Força Aérea Brasileira. São impróprios: bebidas alcoólicas (cerveja, cachaça, vinho, destilados), itens de uso recreativo, produtos não alimentares ou de higiene pessoal que não tenham função culinária.';

-- Regra de política das preparações.
update procurement.policy_rule
   set description = 'A preparação não deve conter ingredientes impróprios para a alimentação coletiva militar da Força Aérea Brasileira. São impróprios: bebidas alcoólicas como cerveja, cachaça, vinho ou qualquer destilado como ingrediente; ingredientes de uso recreativo; ou itens que não tenham função culinária em preparações de alimentação coletiva militar.',
       updated_at = now()
 where description = 'A preparação não deve conter ingredientes impróprios para serviço em rancho militar da Força Aérea Brasileira. São impróprios: bebidas alcoólicas como cerveja, cachaça, vinho ou qualquer destilado como ingrediente; ingredientes de uso recreativo; ou itens que não tenham função culinária em preparações de alimentação coletiva militar.';

-- Cartão do sisub no portal.
update iefa.apps
   set description = 'Sistema de Subsistência da FAB — cardápios, receitas, planejamento, compras e analytics da subsistência. Muito além da previsão.'
 where description = 'Sistema de Subsistência da FAB — cardápios, receitas, planejamento, compras e analytics do rancho. Muito além da previsão.';
