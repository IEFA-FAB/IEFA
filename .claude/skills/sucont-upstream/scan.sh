#!/usr/bin/env bash
# Varredura dos repositórios de origem das ferramentas do sucont.
#
#   scan.sh                      panorama: todo repo dos owners, pendência vs checkpoint
#   scan.sh <repo>               commits novos + arquivos tocados desde o checkpoint
#   scan.sh <repo> --patch <sha> patch de um commit
#   scan.sh <repo> --files <sha> árvore do repositório naquele commit
#   scan.sh <repo> --cat <sha> <path>   conteúdo de um arquivo naquele commit
#
# <repo> aceita só o nome (sacdgccomaer) ou owner/nome.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCES="$DIR/sources.json"

die() { echo "erro: $*" >&2; exit 1; }
command -v gh >/dev/null || die "gh não encontrado"
command -v jq >/dev/null || die "jq não encontrado"
[ -f "$SOURCES" ] || die "sources.json não encontrado em $DIR"

# Resolve nome curto -> owner/repo usando sources.json; senão tenta os owners na ordem.
resolve() {
	local q="$1" hit
	hit=$(jq -r --arg q "$q" '.repos[] | select((.repo|ascii_downcase) == ($q|ascii_downcase) or ((.repo|split("/")[1]|ascii_downcase) == ($q|ascii_downcase))) | .repo' "$SOURCES" | head -1)
	if [ -n "$hit" ]; then echo "$hit"; return; fi
	if [[ "$q" == */* ]]; then echo "$q"; return; fi
	local owner
	while read -r owner; do
		if gh api "repos/$owner/$q" --jq .full_name 2>/dev/null; then return; fi
	done < <(jq -r '.owners[]' "$SOURCES")
	die "repo '$q' não resolvido"
}

entry() { jq -c --arg r "$1" '.repos[] | select(.repo == $r)' "$SOURCES"; }

default_branch() { gh api "repos/$1" --jq .default_branch; }

overview() {
	echo "# Panorama upstream — $(date -u +%Y-%m-%dT%H:%MZ)"
	echo
	# /user/repos é a única listagem que enxerga repo PRIVADO de terceiro em que
	# você é colaborador — users/<owner>/repos devolve só os públicos.
	local all owners
	all=$(gh api "/user/repos?affiliation=owner,collaborator,organization_member&per_page=100" --paginate \
		--jq '.[] | [.full_name, .pushed_at, .visibility, .default_branch] | @tsv')
	while read -r owner; do
		echo "## $owner"
		echo "$all" | awk -F'\t' -v o="$owner/" 'index($1,o)==1' | sort -t$'\t' -k2,2r | while IFS=$'\t' read -r full pushed vis branch; do
			local_entry=$(entry "$full")
			if [ -z "$local_entry" ]; then
				printf -- "- %-50s %s  %-7s  ⚠ FORA do sources.json\n" "$full" "${pushed:0:10}" "$vis"
				continue
			fi
			cp=$(echo "$local_entry" | jq -r '.checkpoint // ""')
			rev=$(echo "$local_entry" | jq -r '.lastReviewed // ""')
			pend=$(echo "$local_entry" | jq -r '(.pending // []) | length')
			[ "$pend" != "0" ] && rev="$rev, $pend pendência(s)"
			if [ -z "$cp" ]; then
				printf -- "- %-50s %s  %-7s  sem checkpoint\n" "$full" "${pushed:0:10}" "$vis"
			else
				ahead=$(gh api "repos/$full/compare/$cp...$branch" --jq '.ahead_by' 2>/dev/null || echo "?")
				printf -- "- %-50s %s  %-7s  +%s commit(s) desde o checkpoint (revisto %s)\n" "$full" "${pushed:0:10}" "$vis" "$ahead" "${rev:-nunca}"
			fi
		done
		echo
	done < <(jq -r '.owners[]' "$SOURCES")
	# Repo mapeado fora da listagem: público sem vínculo de colaborador (aparece
	# aqui do mesmo jeito) ou acesso revogado/renomeado (vira aviso).
	echo "## mapeados sem vínculo de colaborador"
	jq -r '.repos[].repo' "$SOURCES" | while read -r r; do
		echo "$all" | cut -f1 | grep -qx "$r" && continue
		if info=$(gh api "repos/$r" --jq '[.pushed_at, .visibility] | @tsv' 2>/dev/null); then
			printf -- "- %-50s %s  %-7s  sem checkpoint\n" "$r" "$(echo "$info" | cut -f1 | cut -c1-10)" "$(echo "$info" | cut -f2)"
		else
			echo "⚠ mapeado e inacessível para este token: $r"
		fi
	done
}

detail() {
	local full="$1" e cp base branch
	e=$(entry "$full")
	branch=$(default_branch "$full")
	cp=$(echo "${e:-}" | jq -r '.checkpoint // ""')

	echo "# $full (branch $branch)"
	if [ -n "$e" ]; then
		echo
		echo "Ferramenta: $(echo "$e" | jq -r '.tool // "?"')  •  rota: $(echo "$e" | jq -r '.route // "—"')"
		echo "Alvos no monorepo:"
		echo "$e" | jq -r '.targets[]? | "  - " + .'
		local n; n=$(echo "$e" | jq -r '.notes // ""'); [ -n "$n" ] && echo "Nota: $n"
	else
		echo "(não mapeado em sources.json)"
	fi
	echo

	if [ -n "$cp" ]; then
		echo "## Commits após o checkpoint $cp"
		gh api "repos/$full/compare/$cp...$branch" --jq \
			'.commits[] | "- \(.sha[0:8])  \(.commit.author.date)  \(.commit.message | split("\n")[0])"'
		echo
		echo "## Arquivos tocados no intervalo"
		gh api "repos/$full/compare/$cp...$branch" --jq \
			'.files[]? | "- \(.status[0:1] | ascii_upcase) \(.filename)  (+\(.additions)/-\(.deletions))"'
	else
		echo "## Sem checkpoint — últimos 30 commits"
		gh api "repos/$full/commits?per_page=30" --jq \
			'.[] | "- \(.sha[0:8])  \(.commit.author.date)  \(.commit.message | split("\n")[0])"'
	fi
}

main() {
	[ $# -eq 0 ] && { overview; exit 0; }
	local full; full=$(resolve "$1"); shift || true
	case "${1:-}" in
		"") detail "$full" ;;
		--patch) gh api "repos/$full/commits/$2" --jq '.files[] | "=== \(.filename) (\(.status), +\(.additions)/-\(.deletions))\n\(.patch // "(binário ou patch omitido)")"' ;;
		--files) gh api "repos/$full/git/trees/$2?recursive=1" --jq '.tree[] | select(.type=="blob") | "\(.size)\t\(.path)"' ;;
		--cat) gh api "repos/$full/contents/$3?ref=$2" --jq '.content' | base64 -d ;;
		*) die "flag desconhecida: $1" ;;
	esac
}

main "$@"
