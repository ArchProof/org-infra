# Synchronize GitOps secrets using GitHub CLI (gh)
param(
  [string]$Repo = "ArchProof/org-infra"
)

Write-Host "Syncing secrets to $Repo using GitHub CLI..." -ForegroundColor Cyan

$endpoint = $env:STATE_ENDPOINT
if (-not $endpoint -and (Test-Path "secrets/state-endpoint.txt")) { $endpoint = (Get-Content "secrets/state-endpoint.txt").Trim() }
if ($endpoint) { 
  gh secret set STATE_ENDPOINT --body $endpoint.Trim() -R $Repo
  Write-Host "  ✅ STATE_ENDPOINT -> set" -ForegroundColor Green
}

$bucket = $env:STATE_BUCKET
if (-not $bucket -and (Test-Path "secrets/state-bucket.txt")) { $bucket = (Get-Content "secrets/state-bucket.txt").Trim() }
if ($bucket) { 
  gh secret set STATE_BUCKET --body $bucket.Trim() -R $Repo
  Write-Host "  ✅ STATE_BUCKET -> set" -ForegroundColor Green
}

$accessKey = $env:STATE_ACCESS_KEY
if (-not $accessKey -and (Test-Path "secrets/state-access-key.txt")) { $accessKey = (Get-Content "secrets/state-access-key.txt").Trim() }
if ($accessKey) { 
  gh secret set STATE_ACCESS_KEY --body $accessKey.Trim() -R $Repo
  Write-Host "  ✅ STATE_ACCESS_KEY -> set" -ForegroundColor Green
}

$secretKey = $env:STATE_SECRET_KEY
if (-not $secretKey -and (Test-Path "secrets/state-secret-key.txt")) { $secretKey = (Get-Content "secrets/state-secret-key.txt").Trim() }
if ($secretKey) { 
  gh secret set STATE_SECRET_KEY --body $secretKey.Trim() -R $Repo
  Write-Host "  ✅ STATE_SECRET_KEY -> set" -ForegroundColor Green
}

$pemPath = $env:GOVERNANCE_PEM_PATH
if (-not $pemPath -and (Test-Path "secrets/governance.pem")) { $pemPath = "secrets/governance.pem" }
if ($pemPath -and (Test-Path $pemPath)) {
  Get-Content $pemPath | gh secret set GOVERNANCE_PEM -R $Repo
  Write-Host "  ✅ GOVERNANCE_PEM -> set" -ForegroundColor Green
}

Write-Host "`nSync complete! Current secrets for $Repo:" -ForegroundColor Cyan
gh secret list -R $Repo
