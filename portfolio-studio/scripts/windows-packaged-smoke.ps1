$ErrorActionPreference = "Stop"
$studioRoot = Split-Path -Parent $PSScriptRoot
$packagedExe = Join-Path $studioRoot "out/portfolio-studio-win32-x64/portfolio-studio.exe"
$package = Get-ChildItem -Path (Join-Path $studioRoot "out/make") -Filter "*-full.nupkg" -Recurse |
  Select-Object -First 1
if (-not (Test-Path -LiteralPath $packagedExe) -or -not $package) {
  throw "Missing Forge executable or full Squirrel nupkg"
}

$diagnostic = Join-Path $env:RUNNER_TEMP "portfolio-studio-squirrel-diagnostic"
New-Item -ItemType Directory -Path $diagnostic -Force | Out-Null
$zip = Join-Path $diagnostic "package.zip"
Copy-Item -LiteralPath $package.FullName -Destination $zip
Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $diagnostic "extracted")
$extractedExe = Join-Path $diagnostic "extracted/lib/net45/portfolio-studio.exe"
if (-not (Test-Path -LiteralPath $extractedExe)) {
  Get-ChildItem -Path $diagnostic -Recurse | Select-Object FullName
  throw "Squirrel nupkg does not contain the expected executable"
}

Write-Host "Windows version: $([Environment]::OSVersion.VersionString)"
Write-Host "Squirrel package: $($package.FullName)"
Write-Host "Squirrel package SHA256: $((Get-FileHash $package.FullName -Algorithm SHA256).Hash)"
$failures = 0
$started = Get-Date
foreach ($variant in @(
  @{ Label = "Forge"; Executable = $packagedExe },
  @{ Label = "Squirrel-extracted"; Executable = $extractedExe }
)) {
  $exe = $variant.Executable
  $info = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
  Write-Host "$($variant.Label) path: $exe"
  Write-Host "$($variant.Label) SHA256: $((Get-FileHash $exe -Algorithm SHA256).Hash)"
  Write-Host "$($variant.Label) version: $($info.FileVersion), signature: $((Get-AuthenticodeSignature -FilePath $exe).Status)"
  $env:PACKAGED_APP_EXE = $exe
  $env:PACKAGED_APP_VARIANT = $variant.Label
  & node (Join-Path $PSScriptRoot "packaged-smoke.mjs")
  if ($LASTEXITCODE -ne 0) {
    $failures++
    Write-Warning "$($variant.Label) repeated-launch diagnostic failed"
  }
}

# Application Error / WER events are read-only evidence; the event log may be unavailable.
try {
  Get-WinEvent -FilterHashtable @{ LogName = "Application"; StartTime = $started } -ErrorAction Stop |
    Where-Object { $_.Message -match "(?i)portfolio-studio|0x80000003" } |
    Select-Object -First 10 TimeCreated, Id, ProviderName, Message |
    Format-List
} catch {
  Write-Host "Application event log was unavailable: $_"
}
if ($failures -gt 0) { throw "$failures packaged variants failed repeated-launch diagnostics" }
