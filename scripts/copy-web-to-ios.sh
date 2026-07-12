#!/usr/bin/env bash
set -euo pipefail

# Xcode build phases run with a minimal PATH. Resolve npm from common installers.
ensure_npm_on_path() {
  if command -v npm >/dev/null 2>&1; then
    return 0
  fi

  local path_prefix
  path_prefix="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${HOME}/.local/share/mise/shims:${HOME}/.volta/bin"
  export PATH="${path_prefix}:${PATH:-}"

  if command -v npm >/dev/null 2>&1; then
    return 0
  fi

  if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    source "${HOME}/.nvm/nvm.sh"
  fi

  if command -v npm >/dev/null 2>&1; then
    return 0
  fi

  if command -v mise >/dev/null 2>&1; then
    eval "$(mise activate bash --shims)"
  elif [[ -x "${HOME}/.local/bin/mise" ]]; then
    eval "$("${HOME}/.local/bin/mise" activate bash --shims)"
  fi

  command -v npm >/dev/null 2>&1
}

if ! ensure_npm_on_path; then
  echo "error: npm not found in Xcode build environment." >&2
  echo "Install Node.js (Homebrew, mise, nvm, etc.) or add its bin directory to PATH." >&2
  echo "Current PATH: ${PATH}" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build:ios

if ! grep -q 'src="./assets/' dist/index.html; then
  echo "error: iOS web build does not use relative asset paths." >&2
  echo "Expected ./assets/... in dist/index.html (check BASE_PATH=./ vite build)." >&2
  exit 1
fi

DEST="$ROOT/ios/YHKPrinter/Resources/Web"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R dist/* "$DEST/"

echo "Copied web build to $DEST"
