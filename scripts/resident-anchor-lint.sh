#!/usr/bin/env sh
# Resident-summary anchor lint: the condensed summary in
# hooks/resident-summary.md is a second text beside
# skills/poteto-mode/SKILL.md. This check pins the summary's structural
# anchors to that file so the two cannot drift silently: every skill
# reference the summary carries must resolve in the skill file, and a
# pinned minimum set of anchors (sections, skills, the playbook pointer)
# must appear in both.
# Rationale: docs/adr/0009-resident-mode-opt-in.md (drift guard).
#
# Usage: scripts/resident-anchor-lint.sh
# Exit 0: every anchor resolves. Exit 1: one or more anchors are broken.

set -eu
# Keep slash-prefixed tokens literal under Git Bash on Windows.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

cd "$(git rev-parse --show-toplevel)"

summary=hooks/resident-summary.md
skill=skills/poteto-mode/SKILL.md

[ -f "$summary" ] || { echo "resident-anchor: missing $summary"; exit 1; }
[ -f "$skill" ] || { echo "resident-anchor: missing $skill"; exit 1; }

status=0

# 1. Every skill reference the summary carries must resolve in the skill
#    file, as a whole name (a longer name sharing the prefix does not count).
refs=$(grep -oE 'pstack-[a-z0-9-]+' "$summary" | sort -u || true)
skill_ref_count=0
for ref in $refs; do
	skill_ref_count=$((skill_ref_count + 1))
	if ! grep -qE -- "${ref}([^a-z0-9-]|$)" "$skill"; then
		echo "resident-anchor: skill reference '$ref' in $summary does not resolve in $skill"
		status=1
	fi
done
if [ "$skill_ref_count" -eq 0 ]; then
	echo "resident-anchor: $summary carries no pstack-* skill reference; the router is gone"
	status=1
fi

# 2. Pinned anchors must appear in BOTH files: the summary must keep
#    pointing at them, and the skill file must still have them to point at.
#    Skill names here are a minimum set; edit this list deliberately when
#    the summary's routing changes.
pins='pstack-how
pstack-architect
pstack-unslop
pstack-technical-writing'
for pin in $pins; do
	grep -qF -- "$pin" "$summary" || {
		echo "resident-anchor: pinned skill '$pin' missing from $summary"
		status=1
	}
	grep -qE -- "${pin}([^a-z0-9-]|$)" "$skill" || {
		echo "resident-anchor: pinned skill '$pin' no longer in $skill"
		status=1
	}
done

sections='Non-negotiables
Principles
Autonomy
Writing the reply
Playbooks'
section_count=0
while IFS= read -r section; do
	section_count=$((section_count + 1))
	grep -qF -- "$section" "$summary" || {
		echo "resident-anchor: pinned section '$section' missing from $summary"
		status=1
	}
	grep -qF -- "## $section" "$skill" || {
		echo "resident-anchor: pinned section '## $section' no longer a heading in $skill"
		status=1
	}
done <<EOF
$sections
EOF

# 3. The playbook pointer shape must match in both files.
grep -qF -- 'playbooks/<title>.md' "$summary" || {
	echo "resident-anchor: playbook pointer 'playbooks/<title>.md' missing from $summary"
	status=1
}
grep -qF -- 'playbooks/<title>.md' "$skill" || {
	echo "resident-anchor: playbook pointer 'playbooks/<title>.md' no longer in $skill"
	status=1
}

[ "$status" -eq 0 ] && echo "resident-anchor: clean ($skill_ref_count skill reference(s), $section_count pinned section(s), playbook pointer all resolve against $skill)."
exit "$status"

# 4. Every SKILL.md frontmatter name carries the pstack- prefix.
#    Added after the v0.15.36 sync lost three prefixes in a merge.
bad_names=$(grep -rL "^name: pstack-" skills/*/SKILL.md 2>/dev/null || true)
if [ -n "$bad_names" ]; then
	echo "resident-anchor: SKILL.md without pstack- prefix:"
	echo "$bad_names"
	status=1
fi

[ "$status" -eq 0 ] && echo "resident-anchor: clean ($skill_ref_count skill reference(s), $section_count pinned section(s), playbook pointer all resolve against $skill; all skills prefixed)."
exit "$status"
