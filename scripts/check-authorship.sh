#!/usr/bin/env bash
# Fails if any commit has an author or committer other than 0xkinno, or any trailer-style attribution.
set -euo pipefail
OWNER_NAME="0xkinno"
bad=0
while IFS='|' read -r an cn; do
  if [ "$an" != "$OWNER_NAME" ] || [ "$cn" != "$OWNER_NAME" ]; then echo "bad identity: author=$an committer=$cn"; bad=1; fi
done < <(git log --format='%an|%cn')
if git log --format='%B' | grep -qiE '^(co-authored-by|signed-off-by|generated (with|by)|reviewed-by|assisted-by):'; then
  echo "attribution trailer found in commit history"; bad=1
fi
if git ls-files | grep -vE '(^|/)\.env\.example$' | grep -qE '^reference/|(^|/)\.env($|\.)'; then echo "reference/ or env file is tracked"; bad=1; fi
if [ "$bad" -ne 0 ]; then echo "authorship check FAILED"; exit 1; fi
echo "authorship ok"
