# Fetch the pinned 7-Zip standalone console (7zr.exe) into tools\.cache\7zr.exe.
# The bootstrapper embeds this binary as a RCDATA resource (icon.rc, id 2) and drops it to
# %TEMP% at install time to unpack the appended payload. 7zr is 7z-format-only (~590 KB) and
# is the smallest official standalone that can read what electron-builder's 7z target writes.
#   powershell -ExecutionPolicy Bypass -File tools\fetch-7z.ps1 [-Proxy http://127.0.0.1:7890]
# ASCII-only on purpose: PowerShell 5.1 reads BOM-less scripts in the ANSI codepage.
#
# Why not reuse electron-builder's own 7za.exe: it is resolved at runtime into a per-user cache
# (app-builder-lib/toolsets/7zip.js) and only exists after a packaging run -- not a build input
# we can depend on. Pinning the official binary keeps the bootstrapper build reproducible offline
# (once fetched) and auditable (hash below).

param(
    [string]$Proxy = "",
    [string]$Version = "25.01",
    [string]$Sha256 = "ad4c82fadcbdf93c03b4fc440f300509c7d60c5c2f4d183e35d9d70d6957037d"
)

$ErrorActionPreference = "Stop"

# SHA256 via .NET on purpose -- Get-FileHash exists only in Windows PowerShell 4.0+ and does NOT
# resolve on the GitHub runner (2026-10-02: the tag run's build died here with
# "Get-FileHash : The term 'Get-FileHash' is not recognized"). This route needs no module
# auto-loading and works on every PowerShell. Keep this file ASCII-only (see header).
function Get-Sha256([string]$Path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $fs = $null
    try {
        $fs = [System.IO.File]::OpenRead($Path)
        $bytes = $sha.ComputeHash($fs)
        return (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
        if ($fs -ne $null) { $fs.Dispose() }
        $sha.Dispose()
    }
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)   # -> bootstrapper/
$cache = Join-Path $root "tools\.cache"
$dest = Join-Path $cache "7zr.exe"
$url = "https://www.7-zip.org/a/7zr.exe"

if (Test-Path $dest) {
    $have = Get-Sha256 $dest
    if ($have -eq $Sha256) { Write-Host "7zr.exe already present and verified -> $dest"; exit 0 }
    Write-Host "cached 7zr.exe hash mismatch ($have) -- refetching"
    Remove-Item $dest -Force
}

New-Item -ItemType Directory -Force -Path $cache | Out-Null
$tmp = Join-Path $env:TEMP "7zr-$Version.exe"
Write-Host "downloading $url  (7-Zip $Version)"
if ($Proxy) {
    Invoke-WebRequest -Uri $url -OutFile $tmp -Proxy $Proxy -UseBasicParsing
} else {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
}

$got = Get-Sha256 $tmp
if ($got -ne $Sha256) {
    Remove-Item $tmp -Force
    throw "7zr.exe SHA256 mismatch: expected $Sha256, got $got (7-Zip moved the file -- re-pin deliberately)"
}
Move-Item -LiteralPath $tmp -Destination $dest -Force
Write-Host "7zr.exe -> $dest  ($((Get-Item $dest).Length) bytes, sha256 $Sha256)"
