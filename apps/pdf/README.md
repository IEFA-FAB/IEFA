# pdf — BentoPDF

Ferramentas de PDF (mesclar, dividir, comprimir, girar, OCR, converter…) em
`pdf.iefa.com.br`. Substitui o iLovePDF, que a rede da FAB bloqueia.

O app é o [BentoPDF](https://github.com/alam00000/bentopdf) **sem modificação**, numa
versão fixada. Não há código nosso: este diretório só tem o `Dockerfile` que o
empacota e este README. Não é workspace Bun — não tem `package.json`, não entra no
`bun install`, no turbo nem no Dockerfile raiz.

## Por que é seguro para documento interno

**Todo processamento acontece no navegador de quem usa**, via WebAssembly. O
container é um nginx que só entrega arquivo estático: o PDF nunca sobe para o
servidor, nem para o nosso. Por isso a task é a menor do Fargate (0,25 vCPU /
512 MB), qualquer que seja o tamanho dos arquivos processados.

Consequência para LGPD: o app não recebe, não armazena e não repassa dado pessoal.
Não usa cookie; o que fica no navegador (idioma, cache de fontes do OCR em
IndexedDB, service worker com os módulos WASM) é preferência técnica local.

## O que difere do Docker do upstream

| | Upstream | Aqui |
|---|---|---|
| Versão | `:latest` | tag **e** commit fixados; o build falha se a tag for movida |
| Imagens base | tag mutável | digest |
| WASM (PyMuPDF, Ghostscript, CoherentPDF) | baixado do jsDelivr em tempo de execução | servido do próprio domínio em `/wasm/` |
| OCR (Tesseract, dados de idioma, fonte) | CDN | local, `por` + `eng` |
| Idioma padrão | inglês | português |
| Modo | completo, com landing de marketing | `SIMPLE_MODE` (só as ferramentas, sem chamada à API do GitHub) |
| HSTS | não envia | envia (o ALB termina o TLS mas não injeta header) |

O WASM local não é otimização: os Web Workers carregam esses módulos com
`importScripts()`, e numa rede que filtra CDN a compressão e o OCR simplesmente não
funcionariam. O build falha se o CSP gerado ainda citar `cdn.jsdelivr.net`.

## Deploy

Mesmo caminho dos outros apps: `apps.manifest.json` (kind `dockerfile`) →
`docker-bake.hcl` / `.github/paths-filter.yml` gerados → `build-pdf` publica no ECR →
`deploy-pdf` força o rollout no ECS. Push na `main` que toque `apps/pdf/**` dispara;
manualmente, `CI/CD` → `force_pdf`.

O build leva bem mais que os apps do monorepo (npm ci + vite + páginas i18n + docs),
por isso o job tem timeout de 40 min. A camada de build fica no cache do bake e só é
refeita quando o `Dockerfile` muda.

### Primeira subida (uma vez)

1. **Antes do merge: tfvars.** Adicionar a entrada `pdf` ao secret `TF_TFVARS_JSON`
   (conteúdo de `infra/pdf/terraform.tfvars.example`, com o `state_bucket` real — o
   mesmo das outras entradas). O merge toca `infra/pdf/**`, e o `terraform-apply`
   **falha alto** para stack sem entrada no secret.
2. **Merge.** Dois workflows rodam juntos: o `terraform-apply` cria ECR, target
   group, regra do listener (`pdf.iefa.com.br`, prioridade 210) e o serviço ECS em
   poucos minutos; o `CI/CD` leva mais que isso no build, então o repositório ECR já
   existe quando a imagem é publicada, e o `deploy-pdf` faz o primeiro rollout. Se
   a ordem inverter (apply lento, push sem repositório), rode de novo
   `gh workflow run deploy.yml -f force_pdf=true`.
3. **DNS** — CNAME `pdf` → DNS do ALB, à mão no Registro.br (a zona não está no
   Route53). O certificado `*.iefa.com.br` do ALB já cobre o host.
4. **Variável** — só depois do DNS resolver:
   `gh variable set PDF_HEALTH_URL --body https://pdf.iefa.com.br/health`. Sem ela o
   deploy pula o smoke test; com ela antes do DNS, o deploy fica vermelho.

### Atualizar a versão

1. Ver o changelog em <https://github.com/alam00000/bentopdf/releases>.
2. Trocar `BENTOPDF_VERSION` e `BENTOPDF_COMMIT` no `Dockerfile`
   (`git ls-remote https://github.com/alam00000/bentopdf refs/tags/<tag>^{}`).
3. As versões dos módulos WASM e do Tesseract são lidas do próprio código do
   upstream — acompanham sozinhas. Conferir no log do estágio `wasm`.
4. Testar local antes do PR (abaixo), principalmente **comprimir** e **OCR**, que
   são os que dependem do WASM local.

### Rodar local

```bash
cd apps/pdf
docker build --build-arg SITE_URL=http://localhost:8080 -t iefa-pdf .
docker run --rm -p 8080:8080 iefa-pdf
```

`SITE_URL` precisa bater com o endereço aberto no navegador: as URLs de WASM são
absolutas e da mesma origem.

## Licença

BentoPDF é AGPL-3.0-only. Servimos o upstream sem modificação e o código-fonte
está publicado no GitHub dele; o `Dockerfile` que monta a imagem está neste
repositório, que também é público. Qualquer modificação no código do BentoPDF
passa a exigir publicar essa modificação — prefira configuração por build arg.
