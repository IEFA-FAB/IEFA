-- Complemento de 20260927166000: o código do refeitório da cozinha central da EEAR também deixa de
-- ser "Rancho". Com o nome de exibição diferente do código, o painel do fiscal mostra o código como
-- subtítulo, e "Rancho" voltaria à tela.
--
-- Nada gravado aponta para o código: o refeitório padrão do comensal (`core.user_data`
-- `.default_mess_hall_id`), o arranchamento e a presença guardam o id. O código é a chave do
-- seletor na sessão e é único (`mess_halls_code_key`). Casa pelo código e pela unidade atuais; um
-- código já editado pela tela Locais não é sobrescrito.
--
-- O nome foi escolhido pela linha do levantamento de efetivo que aponta para este refeitório
-- ("EEAR (cozinha central)"); o cadastro continua editável pela tela Locais.

update kitchen.mess_halls mh
   set code = 'EEAR-CENTRAL'
  from core.units u
 where u.id = mh.unit_id
   and u.code = 'EEAR'
   and mh.code = 'Rancho';
