# =============================================================================
# PDF — BentoPDF (https://github.com/alam00000/bentopdf), AGPL-3.0-only
#
# Ferramentas de PDF (mesclar, dividir, comprimir, OCR…) que rodam INTEIRAS no
# navegador, via WebAssembly. O servidor só entrega arquivo estático: nenhum PDF
# de usuário passa por ele. Ver apps/pdf/README.md.
#
# Não há código nosso aqui — o app é o upstream sem modificação, numa versão
# fixada. Três decisões fazem este Dockerfile diferente do upstream:
#
#   1. Tag E commit fixados. A tag é mutável no GitHub; o commit não. O build
#      falha se a tag tiver sido movida.
#   2. WASM servido do PRÓPRIO domínio. O upstream baixa PyMuPDF, Ghostscript e
#      CoherentPDF do jsDelivr em tempo de execução, e os Web Workers carregam
#      esses scripts com importScripts(), que não aceita outra origem sob a CSP
#      do app. Numa rede que filtra CDN a compressão simplesmente não funcionaria.
#      O layout de /wasm/ espelha o scripts/prepare-airgap.sh do upstream.
#   3. OCR em português e inglês, também local, pelo mesmo motivo.
# =============================================================================

ARG NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
ARG NGINX_IMAGE=quay.io/nginx/nginx-unprivileged:alpine-slim@sha256:123fb7283ffb4788e260d4e980005a978995fefedcdbb04d268077a19b84576d

# ---- Código-fonte do upstream, na versão fixada ------------------------------
FROM ${NODE_IMAGE} AS source
ARG BENTOPDF_VERSION=v2.8.8
ARG BENTOPDF_COMMIT=f96cd4e5166f3d51393dfe9f3c440b5bb77802f1
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch "${BENTOPDF_VERSION}" https://github.com/alam00000/bentopdf.git . \
    && actual="$(git rev-parse HEAD)" \
    && if [ "$actual" != "${BENTOPDF_COMMIT}" ]; then \
         echo "❌ ${BENTOPDF_VERSION} aponta para $actual, esperado ${BENTOPDF_COMMIT}"; exit 1; \
       fi \
    && rm -rf .git

# ---- Módulos WASM + dados de OCR, servidos do mesmo domínio -------------------
# As versões saem do próprio código do upstream (cdn-version.ts, wasm-provider.ts,
# package-lock.json), então acompanham o bump de BENTOPDF_VERSION sozinhas. O
# CoherentPDF é lido do default do wasm-provider de propósito: o prepare-airgap.sh
# do upstream faz `npm pack coherentpdf` sem versão, o que traria a mais recente.
FROM ${NODE_IMAGE} AS wasm
RUN apk add --no-cache curl
WORKDIR /src
COPY --from=source /src/src/js/const/cdn-version.ts /src/src/js/utils/wasm-provider.ts /src/package-lock.json ./
RUN set -eu; \
    PYMUPDF="$(grep 'pymupdf:' cdn-version.ts | grep -o "'[^']*'" | tr -d "'")"; \
    GS="$(grep 'ghostscript:' cdn-version.ts | grep -o "'[^']*'" | tr -d "'")"; \
    CPDF="$(grep -o 'coherentpdf@[0-9][0-9.]*' wasm-provider.ts | head -1 | cut -d@ -f2)"; \
    TESS="$(node -p "require('./package-lock.json').packages['node_modules/tesseract.js'].version")"; \
    TESS_CORE="$(node -p "require('./package-lock.json').packages['node_modules/tesseract.js-core'].version")"; \
    for v in "$PYMUPDF" "$GS" "$CPDF" "$TESS" "$TESS_CORE"; do [ -n "$v" ] || { echo "❌ versão de WASM não resolvida"; exit 1; }; done; \
    echo "pymupdf=$PYMUPDF gs=$GS cpdf=$CPDF tesseract=$TESS core=$TESS_CORE"; \
    mkdir -p /tmp/pkg /wasm/pymupdf /wasm/gs /wasm/cpdf /wasm/ocr/core /wasm/ocr/lang-data /wasm/ocr/fonts; \
    cd /tmp/pkg; \
    npm pack --quiet "@bentopdf/pymupdf-wasm@$PYMUPDF" "@bentopdf/gs-wasm@$GS" "coherentpdf@$CPDF" \
      "tesseract.js@$TESS" "tesseract.js-core@$TESS_CORE"; \
    tar xzf bentopdf-pymupdf-wasm-*.tgz -C /wasm/pymupdf --strip-components=1; \
    mkdir gs && tar xzf bentopdf-gs-wasm-*.tgz -C gs && cp -r gs/package/assets/* /wasm/gs/; \
    mkdir cpdf && tar xzf coherentpdf-*.tgz -C cpdf && cp -r cpdf/package/dist/* /wasm/cpdf/; \
    mkdir tess && tar xzf "tesseract.js-$TESS.tgz" -C tess && cp tess/package/dist/worker.min.js /wasm/ocr/worker.min.js; \
    tar xzf "tesseract.js-core-$TESS_CORE.tgz" -C /wasm/ocr/core --strip-components=1; \
    for lang in por eng; do \
      curl -fsSL "https://cdn.jsdelivr.net/npm/@tesseract.js-data/$lang/4.0.0_best_int/$lang.traineddata.gz" \
        -o "/wasm/ocr/lang-data/$lang.traineddata.gz"; \
    done; \
    curl -fsSL "https://raw.githubusercontent.com/googlefonts/noto-fonts/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSans/NotoSans-Regular.ttf" \
      -o /wasm/ocr/fonts/NotoSans-Regular.ttf; \
    test -f /wasm/gs/gs.wasm && test -f /wasm/cpdf/coherentpdf.browser.min.js; \
    rm -rf /tmp/pkg

# ---- Build do app ------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV HUSKY=0
COPY --from=source /src/package.json /src/package-lock.json ./
COPY --from=source /src/vendor ./vendor
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 60000 \
    && npm config set fetch-retry-maxtimeout 300000 \
    && npm ci
COPY --from=source /src ./

# URL pública do site. As URLs de WASM precisam ser absolutas (o gerador de CSP
# do upstream extrai a origem delas) e da MESMA origem do app.
ARG SITE_URL=https://pdf.iefa.com.br

# SIMPLE_MODE é a build de self-hosting do upstream: só as ferramentas, sem a
# landing de marketing e sem a chamada à API do GitHub para contar estrelas.
ENV SIMPLE_MODE=true \
    DISABLE_GITHUB_STARS=true \
    COMPRESSION_MODE=all \
    VITE_DEFAULT_LANGUAGE=pt \
    VITE_BRAND_NAME="IEFA PDF" \
    SITE_URL=${SITE_URL} \
    VITE_WASM_PYMUPDF_URL=${SITE_URL}/wasm/pymupdf/ \
    VITE_WASM_GS_URL=${SITE_URL}/wasm/gs/ \
    VITE_WASM_CPDF_URL=${SITE_URL}/wasm/cpdf/ \
    VITE_TESSERACT_WORKER_URL=${SITE_URL}/wasm/ocr/worker.min.js \
    VITE_TESSERACT_CORE_URL=${SITE_URL}/wasm/ocr/core \
    VITE_TESSERACT_LANG_URL=${SITE_URL}/wasm/ocr/lang-data \
    VITE_TESSERACT_AVAILABLE_LANGUAGES=por,eng \
    VITE_OCR_FONT_BASE_URL=${SITE_URL}/wasm/ocr/fonts \
    NODE_OPTIONS=--max-old-space-size=3072
RUN npm run build:with-docs \
    && test -f dist/index.html \
    && test -f security-headers.conf

# O CSP gerado precisa apontar só para a própria origem. Se uma URL de WASM tiver
# escapado para o jsDelivr, o app sobe e a compressão falha só no navegador.
RUN if grep -q 'cdn.jsdelivr.net' security-headers.conf; then \
      echo "❌ CSP ainda cita cdn.jsdelivr.net — alguma URL de WASM não foi sobrescrita"; exit 1; \
    fi

# ---- Runtime: nginx sem root, com a config do próprio upstream ----------------
FROM ${NGINX_IMAGE}
LABEL org.opencontainers.image.source="https://github.com/IEFA-FAB/IEFA" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.description="BentoPDF (github.com/alam00000/bentopdf), sem modificações"

USER root
RUN apk upgrade --no-cache

COPY --chown=nginx:nginx --from=build /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx --from=wasm /wasm /usr/share/nginx/html/wasm
COPY --chown=nginx:nginx --from=source /src/nginx.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx --from=build /app/security-headers.conf /etc/nginx/security-headers.conf
COPY --chown=nginx:nginx --from=build /app/security-headers-docs.conf /etc/nginx/security-headers-docs.conf
COPY --chown=nginx:nginx --chmod=755 --from=source /src/nginx-ipv6.sh /docker-entrypoint.d/99-disable-ipv6.sh

# HSTS: o ALB termina o TLS mas não injeta header, e o upstream não o envia
# (serve também HTTP puro). Os apps SSR do monorepo mandam o mesmo valor.
# /health: alvo do health check do ALB — arquivo estático, sem tocar em WASM.
RUN printf 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n' \
      | tee -a /etc/nginx/security-headers.conf >> /etc/nginx/security-headers-docs.conf \
    && printf 'ok\n' > /usr/share/nginx/html/health \
    && mkdir -p /etc/nginx/tmp \
    && chown nginx:nginx /usr/share/nginx/html/health /etc/nginx/tmp
USER nginx

ENV PORT=8080 \
    DISABLE_IPV6=true
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
