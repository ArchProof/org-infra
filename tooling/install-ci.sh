#!/usr/bin/env bash
set -euo pipefail
dest="${RUNNER_TEMP:?}/gitops-tools"
mkdir -p "$dest"
cd "$dest"
curl --fail --silent --show-error --location https://github.com/opentofu/opentofu/releases/download/v1.12.0/tofu_1.12.0_linux_amd64.zip -o tofu.zip
echo '8d7650fd42b6d790f9f747604393ccd0a9035376bccc4f1688b905d7c5bb1137  tofu.zip' | sha256sum -c -
unzip -q tofu.zip tofu
curl --fail --silent --show-error --location https://github.com/terraform-linters/tflint/releases/download/v0.61.0/tflint_linux_amd64.zip -o tflint_linux_amd64.zip
echo 'ca4e4e8cb7cc3436f2b6979e9c4fd4e2623a66fcca1ad1fe12f8669967636ae2  tflint_linux_amd64.zip' | sha256sum -c -
unzip -q tflint_linux_amd64.zip tflint
echo "$dest" >> "$GITHUB_PATH"
