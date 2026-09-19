-- Tipo e tamanho de arquivo decididos pelo Storage, não pelo navegador.
--
-- Os dois buckets gravados por URL de upload assinada aceitavam qualquer `Content-Type` e
-- qualquer tamanho: o servidor assina só o CAMINHO, e o corpo e o tipo vêm do cliente. Um
-- autor do journal subia `manuscript.pdf` como `image/svg+xml` com script, e o editor o
-- abria pelo link assinado; no rumaer, um editor gravava `.html` no bucket de fotos. O
-- `alpha-submissions` já nasceu com as duas travas — estes dois ficam iguais a ele.
--
-- Listas conferidas contra o que as telas oferecem e contra o que já está gravado
-- (journal: 1 PDF de 1,6 MB; rumaer: 251 PNG + 1 JPEG, o maior com 3,8 MB).

-- Journal: manuscrito PDF, fonte Typst (.typ, texto) ou .zip, suplementares PDF/ZIP/CSV/PNG/JPEG
-- (ALLOWED_EXTENSIONS em apps/portal/src/lib/journal/storage-paths.ts). 50 MB é o teto do
-- suplementar na tela de envio; o manuscrito e a fonte param em 10 MB no cliente.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'text/plain', 'application/zip', 'text/csv', 'image/png', 'image/jpeg'],
    file_size_limit = 52428800
where id = 'journal-submissions';

-- Rumaer: fotos de uniforme. 10 MB cobre com folga o maior arquivo de hoje.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'],
    file_size_limit = 10485760
where id = 'rumaer-uniforms';
