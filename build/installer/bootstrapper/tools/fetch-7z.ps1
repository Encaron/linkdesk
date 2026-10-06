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
#
# The URL below is 7-Zip's *rolling* "current release" path -- it silently serves whatever the
# newest build is, so this pin WILL trip whenever upstream cuts a release (2026-10-07: 26.03 ->
# 26.04, the tag run died here with an empty "got" in the runner's log). Re-pin deliberately,
# never by copying the hash out of a failing log:
#   1. download it yourself and hash it -- it must match what the runner reported;
#   2. `.\7zr.exe` with no args must print "7-Zip (r) <Version> (x86) : Igor Pavlov : Public
#      domain : <date>" -- that banner, not the $Version label, is the real version. Compare it
#      with the previous binary and with https://www.7-zip.org/download.html;
#   3. it should be a rebuilt binary (nearly every byte differs), not a same-size near-copy --
#      a byte here and there is what a tampered download looks like.
# Also refresh $Version to the banner version: it is only a label (the cache filename and the
# "downloading ..." line), and it had drifted to 25.01 while the binary was already 26.03.

param(
    [string]$Proxy = "",
    [string]$Version = "26.04",
    [string]$Sha256 = "256feca8e274e5da655e2a284fabafd9f554365eb164862089dacd4e8276d282"
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
