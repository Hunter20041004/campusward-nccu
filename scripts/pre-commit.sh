#!/bin/sh
# 提交前：學號、寫死學期、品牌、workflow 釘版檢查＋祕密掃描（公開庫推上去就來不及了）。
set -e
npm run --silent check
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks git --staged --no-banner --redact
else
  echo "未安裝 gitleaks，無法做提交前祕密掃描。macOS：brew install gitleaks" >&2
  exit 1
fi
