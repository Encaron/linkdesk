param([string]$A, [string]$B, [int]$Tol = 6)
# pix-diff.ps1 — 两张同尺寸 PNG 的像素级差异：只回报「差异点数 / 最大通道差 / 差异包围盒」。
# 用途：改完样式重拍对照图后，先跑这个回答「哪一屏变了、变在画面哪一块」——**不必读图**（读图付 token，
# 这只要一行数）。判「没变」时给 0；判「变了」时包围盒把视线缩小到一块区域，再决定要不要看图。
# 读全图（LockBits，不是 GetPixel 逐点），780×570 秒级返回。
# 用法：powershell -File tools\pix-diff.ps1 -A out\app-home.png -B out\base-home.png
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Load-Px([string]$p) {
    $b = [System.Drawing.Bitmap]::FromFile((Resolve-Path $p).Path)
    $r = New-Object System.Drawing.Rectangle(0, 0, $b.Width, $b.Height)
    $d = $b.LockBits($r, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $d.Stride
    $n = [Math]::Abs($stride) * $b.Height
    $buf = New-Object byte[] $n
    [System.Runtime.InteropServices.Marshal]::Copy($d.Scan0, $buf, 0, $n)
    $b.UnlockBits($d)
    $w = $b.Width; $h = $b.Height
    $b.Dispose()
    return @{ buf = $buf; w = $w; h = $h; stride = $stride }
}

$pa = Load-Px $A
$pb = Load-Px $B
if ($pa.w -ne $pb.w -or $pa.h -ne $pb.h) {
    "SIZE DIFF: $A $($pa.w)x$($pa.h)  vs  $B $($pb.w)x$($pb.h)"
    exit 2
}

$count = 0; $maxd = 0
$minX = $pa.w; $minY = $pa.h; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $pa.h; $y++) {
    $oa = $y * $pa.stride; $ob = $y * $pb.stride
    for ($x = 0; $x -lt $pa.w; $x++) {
        $ia = $oa + $x * 4; $ib = $ob + $x * 4
        $d = [Math]::Abs([int]$pa.buf[$ia]     - [int]$pb.buf[$ib])       # B
        $g = [Math]::Abs([int]$pa.buf[$ia + 1] - [int]$pb.buf[$ib + 1])   # G
        $r = [Math]::Abs([int]$pa.buf[$ia + 2] - [int]$pb.buf[$ib + 2])   # R
        if ($g -gt $d) { $d = $g }
        if ($r -gt $d) { $d = $r }
        if ($d -gt $Tol) {
            $count++
            if ($d -gt $maxd) { $maxd = $d }
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
$name = Split-Path -Leaf $A
if ($count -eq 0) {
    "同：{0}  (全部 {1}×{2} 像素通道差 ≤{3})" -f $name, $pa.w, $pa.h, $Tol
} else {
    "异：{0}  {1} px 超 {2}（最大通道差 {3}）  包围盒 x={4}..{5} y={6}..{7}" -f `
        $name, $count, $Tol, $maxd, $minX, $maxX, $minY, $maxY
}
