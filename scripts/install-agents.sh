#!/usr/bin/env sh
# Subagent installer: fetch the two agent files (poteto-agent,
# comment-sicko) from the repo's raw URLs into ~/.zcode/agents/ and
# self-check every file before it can replace an existing one: present
# and non-empty, frontmatter parses (opens and closes, name field
# present), the expected name, and a markdown body heading (guards a
# file truncated past its frontmatter). Any miss exits non-zero with a
# clear message; a re-run that finds identical files installs nothing
# and says so.
# Rationale: docs/adr/0003-distribute-via-npx-skills-add.md — the skills
# CLI is the distribution channel and does not install agent files.
#
# Usage:
#   scripts/install-agents.sh            fetch, install, self-check
#   scripts/install-agents.sh --check    self-check the files already in place
# The install dir honors $HOME; run under a temp HOME for an isolated try.

set -eu

base=https://raw.githubusercontent.com/ChHsiching/pstack-zcode/main/agents
dir=${HOME}/.zcode/agents
agents='poteto-agent comment-sicko'

fail() { echo "install-agents: FAIL: $*" >&2; exit 1; }

# check NAME FILE — the self-check for one agent file.
check() { # $1 = expected name, $2 = file
	c_name=$1 c_file=$2
	[ -f "$c_file" ] || fail "$c_file is missing"
	[ -s "$c_file" ] || fail "$c_file is empty"
	c_first=$(head -n 1 "$c_file" | tr -d '\r')
	[ "$c_first" = '---' ] ||
		fail "$c_file does not open a YAML frontmatter block (first line: '$c_first')"
	tail -n +2 "$c_file" | grep -qE '^---[[:space:]]*$' ||
		fail "$c_file frontmatter never closes (truncated download?)"
	c_got=$(awk 'NR > 1 && /^---[[:space:]]*$/ {exit}
		NR > 1 && /^name:/ {sub(/^name:[[:space:]]*/, ""); gsub(/[[:space:]]+$/, ""); print; exit}' "$c_file")
	[ -n "$c_got" ] || fail "$c_file frontmatter has no name field"
	[ "$c_got" = "$c_name" ] ||
		fail "$c_file frontmatter name is '$c_got', expected '$c_name' (wrong file served?)"
	tail -n +2 "$c_file" | grep -q '^# ' ||
		fail "$c_file has no markdown body heading (truncated download?)"
}

[ $# -gt 1 ] && fail "too many arguments (want: --check, or no arguments)"
case ${1:-} in
'') ;;
--check) ;;
*) fail "unknown argument: $1 (want: --check, or no arguments)" ;;
esac

if [ "${1:-}" = '--check' ]; then
	ok=0
	for name in $agents; do
		check "$name" "$dir/$name.md"
		echo "install-agents: self-check ok: $dir/$name.md (name: $name)"
		ok=$((ok + 1))
	done
	echo "install-agents: OK: $ok agent(s) verified in $dir"
	exit 0
fi

[ -d "$dir" ] || mkdir -p "$dir" || fail "cannot create $dir"

tmp=$dir/.install-agents.$$.tmp
trap 'rm -f "$tmp"' 0 INT TERM

installed=0
unchanged=0
for name in $agents; do
	url=$base/$name.md
	dest=$dir/$name.md
	echo "install-agents: fetching $url"
	curl -fsSL --retry 3 --connect-timeout 15 -o "$tmp" "$url" ||
		fail "could not fetch $url"
	check "$name" "$tmp"
	if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then
		echo "install-agents: $name.md already present and unchanged (idempotent)"
		unchanged=$((unchanged + 1))
	else
		mv -f "$tmp" "$dest"
		echo "install-agents: installed $dest"
		installed=$((installed + 1))
	fi
done

ok=0
for name in $agents; do
	check "$name" "$dir/$name.md"
	echo "install-agents: self-check ok: $dir/$name.md (name: $name)"
	ok=$((ok + 1))
done
echo "install-agents: OK: $ok agent(s) verified in $dir ($installed installed, $unchanged already up to date). re-runs install nothing when files are identical."
