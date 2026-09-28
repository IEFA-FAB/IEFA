-- Linguagem ubíqua do sisub, lote 8a (tarefa 8.7): o refeitório de nome "Rancho" da EEAR.
--
-- "Rancho" é ambíguo (D10). No levantamento de efetivo este refeitório é a linha
-- "EEAR (cozinha central)" (`kitchen.mess_hall_workforce.mess_hall_id = 34`), então o nome passa a
-- dizer o que ele é: o refeitório da cozinha central. Só o nome de exibição muda: o `code` fica,
-- porque é a chave que o comensal guardou como refeitório padrão e que o arranchamento usa. Casa
-- pelo nome atual e pela unidade, não pelo id: rodar de novo não muda nada, e um nome já editado
-- pela tela Locais não é sobrescrito.

update kitchen.mess_halls mh
   set display_name = 'Refeitório Central'
  from core.units u
 where u.id = mh.unit_id
   and u.code = 'EEAR'
   and mh.code = 'Rancho'
   and mh.display_name = 'Rancho';
