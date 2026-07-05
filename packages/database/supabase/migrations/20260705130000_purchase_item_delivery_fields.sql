-- Itens de compra: descrição detalhada + forma de acondicionamento da entrega.
-- Hoje o purchase_item só tem `description` (rótulo curto, linha única). Compras
-- precisa de duas informações extras na especificação do item:
--   * detailed_description  — especificação longa/livre do item (além do rótulo curto e do CATMAT).
--   * delivery_conditioning — como o item deve ser entregue/acondicionado. Ex.: "frango
--     congelado em caminhão frigorífico" vs "descongelado em carro comum". Critério de
--     aceite/recusa na entrega. Texto livre.
-- Ambas nullable (não obrigatórias em itens já existentes).

ALTER TABLE procurement.purchase_item
  ADD COLUMN detailed_description  text,
  ADD COLUMN delivery_conditioning text;
