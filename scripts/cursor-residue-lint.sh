#!/usr/bin/env sh
# Cursor-residue lint: assert that no Cursor-specific token remains in a
# tracked file outside scripts/cursor-residue-allowlist.txt.
# Rationale: docs/adr/0002-minimal-diff-adaptation.md — this tree is pstack
# adapted for ZCode, so a Cursor mechanism may appear only where an allowlist
# entry justifies it.
#
# Usage: scripts/cursor-residue-lint.sh
# Exit 0: clean. Exit 1: violations, stale entries, or malformed entries.
# The lint skips itself and the allowlist; both must name tokens to work.

set -eu
# Keep slash-prefixed tokens (/loop) literal under Git Bash on Windows.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

cd "$(git rev-parse --show-toplevel)"

allowlist=scripts/cursor-residue-allowlist.txt
tokens='.cursor/
.cursorrules
.mdc
subagent_type
AskQuestion
grok-4.7
claude-opus-5-5
cursor-grok-
composer-
cursor.com
cursor.sh
Custom Mode
cursor-team-kit
Bugbot
agent-transcripts
in-cloud
create-skill
/loop
update_state
crsr_'

skip() {
	case $1 in
	scripts/cursor-residue-lint.sh | scripts/cursor-residue-allowlist.txt) return 0 ;;
	esac
	return 1
}

tmp=${TMPDIR:-/tmp}/cursor-residue.$$
trap 'rm -f "$tmp".occ "$tmp".entries "$tmp".used "$tmp".viol "$tmp".stale "$tmp".bad' 0 INT TERM

# Every raw occurrence, as "path<TAB>token".
: >"$tmp.occ"
while IFS= read -r token; do
	{ git grep -I -n -F -e "$token" -- . || true; } |
		while IFS= read -r hit; do
			path=${hit%%:*}
			skip "$path" && continue
			printf '%s\t%s\n' "$path" "$token" >>"$tmp.occ"
		done
done <<EOF
$tokens
EOF

# Validate and number the allowlist: "n<TAB>path<TAB>token<TAB>justification".
n=0
: >"$tmp.entries"
: >"$tmp.bad"
while IFS= read -r line; do
	case $line in '' | '#'*) continue ;; esac
	n=$((n + 1))
	path=${line%%" ::"*}
	rest=${line#*" :: "}
	token=${rest%%" ::"*}
	just=${rest#*" :: "}
	case $line in
	*" :: "*" :: "*) ;;
	*) printf 'malformed allowlist entry (want: path :: token :: one-line justification): %s\n' "$line" >>"$tmp.bad"; continue ;;
	esac
	if [ -z "$path" ] || [ -z "$token" ] || [ -z "$just" ]; then
		printf 'malformed allowlist entry (want: path :: token :: one-line justification): %s\n' "$line" >>"$tmp.bad"
		continue
	fi
	if [ "$token" != '*' ] && ! printf '%s\n' "$tokens" | grep -qxF -- "$token"; then
		printf 'allowlist entry names an unknown token %s: %s\n' "$token" "$line" >>"$tmp.bad"
		continue
	fi
	printf '%s\t%s\t%s\t%s\n' "$n" "$path" "$token" "$just" >>"$tmp.entries"
done <"$allowlist"

# An occurrence is covered when some entry matches its path (glob) and token.
covered() { # $1 = path, $2 = token; prints the entry number
	while IFS="$(printf '\t')" read -r n epath etoken ejust; do
		[ "$etoken" = "$2" ] || [ "$etoken" = '*' ] || continue
		case $1 in
		$epath) printf '%s\n' "$n"; return 0 ;;
		esac
	done <"$tmp.entries"
	return 1
}

: >"$tmp.used"
: >"$tmp.viol"
sort -u "$tmp.occ" | while IFS="$(printf '\t')" read -r path token; do
	if en=$(covered "$path" "$token"); then
		printf '%s\n' "$en" >>"$tmp.used"
	else
		printf 'cursor-residue: %s in %s\n' "$token" "$path" >>"$tmp.viol"
	fi
done

# An entry nothing matched is stale: the token left that path, so drop the entry.
: >"$tmp.stale"
while IFS="$(printf '\t')" read -r sn sepath setoken sejust; do
	if ! grep -qx "$sn" "$tmp.used"; then
		printf 'stale allowlist entry (no occurrence matches): %s :: %s :: %s\n' "$sepath" "$setoken" "$sejust" >>"$tmp.stale"
	fi
done <"$tmp.entries"

status=0
if [ -s "$tmp.viol" ]; then
	cat "$tmp.viol"
	echo "cursor-residue: $(wc -l <"$tmp.viol") uncovered occurrence(s). Swap the Cursor mechanism for its ZCode equivalent, or add 'path :: token :: one-line justification' to $allowlist."
	status=1
fi
if [ -s "$tmp.stale" ]; then
	cat "$tmp.stale"
	echo "cursor-residue: $(wc -l <"$tmp.stale") stale allowlist entry/entries. Remove them."
	status=1
fi
if [ -s "$tmp.bad" ]; then
	cat "$tmp.bad"
	status=1
fi
[ "$status" -eq 0 ] && echo "cursor-residue: clean ($(wc -l <"$tmp.entries" | tr -d '[:space:]') allowlist entries, $(sort -u "$tmp.occ" | wc -l | tr -d '[:space:]') covered occurrence pair(s))."
exit "$status"
