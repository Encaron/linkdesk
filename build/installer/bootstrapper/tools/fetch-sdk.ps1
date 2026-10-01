# Fetch the pinned WebView2 SDK into .sdk/webview2 (include/ + x64/WebView2LoaderStatic.lib).
# The SDK is NOT committed (see .gitignore); build.cmd needs it before the first build.
#   powershell -ExecutionPolicy Bypass -File tools\fetch-sdk.ps1 [-Proxy http://127.0.0.1:7890]
# ASCII-only on purpose: PowerShell 5.1 reads BOM-less scripts in the ANSI codepage.

param(
    [string]$Proxy = "",
    [string]$Version = "1.0.4258.31"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)   # -> bootstrapper/
$dest = Join-Path $root ".sdk\webview2"
$url  = "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$Version/microsoft.web.webview2.$Version.nupkg"
$tmp  = Join-Path $env:TEMP "webview2-$Version.zip"

Write-Host "downloading $url"
if ($Proxy) {
    Invoke-WebRequest -Uri $url -OutFile $tmp -Proxy $Proxy -UseBasicParsing
} else {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
}

$stage = Join-Path $env:TEMP "webview2-$Version-unpack"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
Expand-Archive -LiteralPath $tmp -DestinationPath $stage -Force

# nupkg layout: build/native/include/*.h + build/native/x64/WebView2LoaderStatic.lib
$src = Join-Path $stage "build\native"
if (-not (Test-Path $src)) { throw "unexpected nupkg layout: $src missing" }

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $dest "include"), (Join-Path $dest "x64") | Out-Null
Copy-Item (Join-Path $src "include\*") (Join-Path $dest "include") -Force
Copy-Item (Join-Path $src "x64\WebView2LoaderStatic.lib") (Join-Path $dest "x64") -Force

Remove-Item $tmp -Force
Remove-Item $stage -Recurse -Force

Write-Host "SDK $Version -> $dest"
Get-ChildItem -Recurse $dest | ForEach-Object { "  " + $_.FullName.Substring($dest.Length + 1) }
