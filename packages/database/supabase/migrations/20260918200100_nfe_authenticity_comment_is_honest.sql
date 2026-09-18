-- ============================================================================
-- O comentário da coluna `authenticity` deixa de prometer o que ela não entrega
-- ============================================================================
--
-- Só metadado; nenhum dado nem comportamento muda.
--
-- A coluna guarda checagens de COERÊNCIA do arquivo — modelo, ambiente,
-- `cStat`, chave do protocolo e se o `digVal` bate com o `DigestValue` da
-- assinatura —, todas lidas como texto do próprio XML, sem nada recalculado.
-- O comentário anterior dizia que "autorizada deixou de ser presunção", e isso
-- é falso: um `cStat` editado de 110 (denegada) para 100 passa, porque
-- `infProt` fica fora do que a assinatura da nota cobre.
--
-- Metadado que mente é lido como documentação por quem abre o banco — e é
-- exatamente o leitor que decide se pode confiar na coluna.
-- ============================================================================

comment on column inventory.nfe_document.authenticity is
  'Checagens de COERÊNCIA do arquivo (modelo, ambiente, cStat, chave do protocolo, digVal × DigestValue), lidas como texto do próprio XML. NÃO é autenticidade: cStat editado à mão passa. A autenticidade depende da validação XMLDSig com C14N (pendente) e, até lá, da consulta de situação na SEFAZ registrada antes da efetivação.';
