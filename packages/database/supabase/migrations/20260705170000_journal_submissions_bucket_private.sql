-- ============================================
-- Bucket journal-submissions → privado (confidencialidade + duplo-cego)
-- ============================================
-- Os manuscritos em avaliação são confidenciais e o processo é duplo-cego.
-- O bucket estava público (getPublicUrl expunha o PDF a qualquer um com a URL,
-- inclusive com a autoria no arquivo). Tornamos o bucket privado; o app passa a
-- servir os manuscritos via URL assinada temporária (getSignedFileUrl).
--
-- Uploads continuam funcionando (createSignedUploadUrl não depende de bucket
-- público). Quando houver fluxo de publicação, o PDF publicado deve ser servido
-- por URL assinada ou copiado para um bucket público próprio.

update storage.buckets set public = false where id = 'journal-submissions';
