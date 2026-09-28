#!/usr/bin/env bash
# Decide se o build publica também `:latest` (passo "Decide whether to move :latest" de
# `.github/workflows/_app-build.yml`). Escreve `move=true|false` em `$GITHUB_OUTPUT`.
#
# Só segura `:latest` quando ele já tem um commit MAIS NOVO que este build (`behind`): dois runs
# da `main` em paralelo não podem deixar a imagem velha em `:latest`. Em qualquer outro caso
# move, como antes do guard: `ahead`/`identical`, `diverged` (a revisão saiu da ancestralidade,
# p. ex. reescrita de histórico — segurar aí travaria `:latest` para sempre), `:latest` sem a
# label de revisão (imagem anterior ao guard) e leitura que falhou. Leitura que falhou é
# `::warning` com o erro, para o guard desligado não passar despercebido.
#
# Roda sob o `bash -e` do runner; o teste (`decide-latest-tag.test.ts`) o executa assim.
# Entrada (env): EVENT_NAME, IMAGE_REPO, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_OUTPUT.
set -euo pipefail

emit() { echo "move=$1" >> "$GITHUB_OUTPUT"; }

# `workflow_dispatch` é ato explícito de alguém (o `force_<app>`): move sempre.
if [ "$EVENT_NAME" = "workflow_dispatch" ]; then
	emit true
	exit 0
fi

err="$(mktemp)"
trap 'rm -f "$err"' EXIT

if ! manifest="$(docker buildx imagetools inspect "$IMAGE_REPO:latest" --format '{{json .Image}}' 2>"$err")"; then
	echo "::warning::não deu para ler $IMAGE_REPO:latest ($(tr '\n' ' ' < "$err")); movendo :latest sem o guard."
	emit true
	exit 0
fi

# Imagem de uma plataforma ou índice (mapa por plataforma): a label está em `.config.Labels`.
current="$(jq -r '[.. | objects | .Labels? // empty | .["org.opencontainers.image.revision"]? // empty] | first // empty' <<<"$manifest" 2>"$err")" || {
	echo "::warning::não deu para ler a revisão de $IMAGE_REPO:latest ($(tr '\n' ' ' < "$err")); movendo :latest sem o guard."
	emit true
	exit 0
}

if [ -z "$current" ]; then
	echo "::notice:::latest sem a label de revisão (imagem anterior ao guard); movendo :latest."
	emit true
	exit 0
fi

if ! status="$(gh api "repos/${GITHUB_REPOSITORY}/compare/${current}...${GITHUB_SHA}" --jq .status 2>"$err")"; then
	echo "::warning::não deu para comparar ${current}...${GITHUB_SHA} ($(tr '\n' ' ' < "$err")); movendo :latest sem o guard."
	emit true
	exit 0
fi

echo ":latest está em ${current}; este build é ${GITHUB_SHA} (compare: ${status})"
case "$status" in
	behind)
		echo "::warning:::latest já tem um commit mais novo (${current}); publicando só a tag de SHA."
		emit false
		;;
	diverged)
		echo "::warning:::latest (${current}) não é ancestral nem descendente deste commit; movendo :latest."
		emit true
		;;
	*) emit true ;;
esac
