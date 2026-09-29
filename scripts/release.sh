#!/usr/bin/env bash
#
# Cut a release: build the userscript from a clean tree, tag it, and publish the built file as a
# release asset.
#
# The build output is not committed (see docs/PLAN.md §1, D9). It reaches users as the asset this
# script uploads, named by `@downloadURL`/`@updateURL` in src/grok-export/meta.js through GitHub's
# version-independent `releases/latest/download/` alias. Violentmonkey compares the `@version` in
# that file against the installed copy, so the version has to be bumped before this runs — the
# script refuses to guess one for you.
#
# The alias resolves only for anonymous readers, which is why this repository is public: a private
# one answers Violentmonkey's credential-less update check with 404 (docs/PLAN.md §1, D9).
#
# Usage: pnpm release        (requires: gh authenticated, pnpm, clean working tree, remote set)
set -euo pipefail

cd "$(dirname "$0")/.."

META=src/grok-export/meta.js
ASSET=dist/grok-export.user.js

fail() { echo "release: $*" >&2; exit 1; }

version=$(sed -n 's|^// *@version  *||p' "$META" | head -1)
[[ -n $version ]] || fail "no @version line in $META"
[[ $version != 0.0.0 ]] || fail "bump @version in $META first (still the template's 0.0.0)"

tag="v$version"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && fail "$tag already exists"
[[ -z $(git status --porcelain) ]] || fail "working tree is not clean; commit first"

pnpm build
grep -q "^// @version *$version\$" "$ASSET" \
  || fail "$ASSET lost @version $version somewhere between $META and the bundle"

git tag -a "$tag" -m "$tag"
git push origin HEAD "$tag"
gh release create "$tag" "$ASSET" --title "$tag" --generate-notes

echo "release: $tag is up — $(gh release view "$tag" --json url -q .url)"
