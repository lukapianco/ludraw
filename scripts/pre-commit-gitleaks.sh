#!/bin/sh
# LuDraw — gancho OPCIONAL de pré-commit: procura segredos no que está no stage antes de cada commit
# (Chat 09 · R6). Não é instalado sozinho; para usar, veja CONTRIBUTING.md §2.1:
#
#   cp scripts/pre-commit-gitleaks.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
#
# Precisa do gitleaks do release oficial (github.com/gitleaks/gitleaks/releases), a mesma versão do CI
# (GITLEAKS_VERSION em .github/workflows/ci.yml), com o SHA-256 conferido. O binário fica FORA do repositório:
# no PATH, ou indicado por GITLEAKS=/caminho/do/gitleaks.
# Os valores encontrados nunca aparecem na tela (--redact). Falsos positivos já triados: .gitleaksignore.
set -eu

bin="${GITLEAKS:-gitleaks}"
if ! command -v "$bin" >/dev/null 2>&1; then
  echo "pre-commit: gitleaks não encontrado (instale o release oficial ou defina GITLEAKS=/caminho/do/gitleaks)." >&2
  echo "pre-commit: para pular só desta vez, use git commit --no-verify (e rode a varredura antes do push)." >&2
  exit 1
fi

exec "$bin" git --pre-commit --staged --redact --no-banner --exit-code 1 .
