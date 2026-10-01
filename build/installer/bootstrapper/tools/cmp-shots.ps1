# cmp-shots.ps1 — 逐屏并排对照（件 1b 安装六屏 ／件 1d 卸载四帧 -Uninstall：mockup 与实机窗口像素级比对）
#   安装：powershell -File tools\cmp-shots.ps1            -> out\cmp-<screen>.png（780×570）
#   卸载：powershell -File tools\cmp-shots.ps1 -Uninstall   -> out\cmp-un-<screen>.png（720×540）
#
# 两侧同源不同管线，所以必须都拍成 PNG 再并排看：
#   左 = mockup（headless Edge 渲染 E-混合提案.html，见 mockup-shot.ps1）
#   右 = 实机（启动 out\bootstrapper.exe --preview=...，真实桌面窗口截图，见 capture.ps1）
# 三处口径对齐，否则并排无意义：
#   1. 尺寸：mockup 的 .stage 被钉成 780×570；实机窗口就是 780×570（高 DPI 下实机是 780*scale，
#      于是 mockup 用 -Scale 同倍渲染 —— 先拍实机量出实际像素宽再定倍数）
#   2. 状态：进度屏两侧都定格在同一 pct；自定义屏两侧都展开（mockup 调 toggleCustom，实机 ?custom=1）
#   3. 动效：都等入场/对勾/彩粒跑完再拍（mockup 用虚拟时间，实机用 -SettleMs 实时等待）
param(
    [string[]]$Screens = @(),              # 空 = 按 -Uninstall 取默认屏集
    [switch]$Uninstall,                    # 卸载屏对照（confirm/running/progress/finish，画布 720×540，--uninstall）
    [int]$Pct = 42,        # 进度屏定格百分比
    [int]$SettleMs = 4200, # 实机启动到截图之间的等待（入场 .8s + 对勾 .95s + 彩粒 1.75s，留足余量）
    [switch]$MockupOnly,   # 只拍 mockup（不启实机窗口）
    [switch]$NoComposite   # 拍完不合成（保留单侧 PNG）
)
$ErrorActionPreference = 'Stop'
$tools = $PSScriptRoot
$root = Split-Path -Parent $tools                      # -> bootstrapper/
$exe = Join-Path $root 'out\bootstrapper.exe'
$shot = Join-Path $tools 'capture.ps1'
$mockShot = Join-Path $tools 'mockup-shot.ps1'

# 卸载屏对照（件 1d）：另一份 mockup、另一套画布尺寸与文件名（不覆盖 1b 那六张）
$un = $Uninstall.IsPresent
if (-not $Screens) { $Screens = if ($un) { @('confirm', 'running', 'progress', 'finish') } else { @('home', 'custom', 'progress', 'finish', 'error', 'uac') } }
$stageW = if ($un) { 720 } else { 780 }
$stageH = if ($un) { 540 } else { 570 }
$pre    = if ($un) { 'un-' } else { '' }
$mockPath  = if ($un) { Join-Path $root '..\..\..\docs\04-软件更新\待抉择池\安装界面自绘\mockups\E-卸载屏.html' } else { Join-Path $root '..\..\..\docs\04-软件更新\待抉择池\安装界面自绘\mockups\E-混合提案.html' }
$mockLabel = if ($un) { 'E-卸载屏.html' } else { 'E-混合提案.html' }


Add-Type -AssemblyName System.Drawing

# 实机预览参数（与 app.js 的预览开关同口径：screen/custom/pct/dust）
function PrevQuery([string]$s) {
    switch ($s) {
        'custom' { return 'screen=home&custom=1&dust=0' }
        'progress' {
            if ($un) { return "screen=un-progress&pct=$Pct&dust=0" }
            return "screen=progress&pct=$Pct&dust=0"
        }
        default {
            # 卸载屏在页面里的 id 带 un- 前缀（finish -> un-finish）；confirm/running 同名
            $name = if ($un -and @('confirm', 'running') -notcontains $s) { "un-$s" } else { $s }
            return "screen=$name&dust=0"
        }
    }
}

function Composite([string]$a, [string]$b, [string]$out, [string]$label) {
    $ia = [System.Drawing.Image]::FromFile($a)   # 左：mockup
    $ib = [System.Drawing.Image]::FromFile($b)   # 右：实机
    $gap = 12; $bar = 30
    $w = $ia.Width + $gap + $ib.Width; $h = $bar + [Math]::Max($ia.Height, $ib.Height)
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(255, 26, 26, 26))       # 深色底 = 分隔条与标题栏
    $g.DrawImage($ia, 0, $bar)
    $g.DrawImage($ib, ($ia.Width + $gap), $bar)
    $font = New-Object System.Drawing.Font('Consolas', 9)
    $br = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 235, 235, 235))
    $g.DrawString(("MOCKUP  {0}   {1}x{2}" -f $label, $ia.Width, $ia.Height), $font, $br, 4, 8)
    $g.DrawString(("APP  bootstrapper.exe (WebView2)   {0}x{1}" -f $ib.Width, $ib.Height), $font, $br, ($ia.Width + $gap + 4), 8)
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $ia.Dispose(); $ib.Dispose()
}

foreach ($s in $Screens) {
    $appPng = Join-Path $root "out\app-$pre$s.png"
    $mockPng = Join-Path $root "out\mockup-$pre$s.png"

    if (-not $MockupOnly) {
        # 新鲜度守卫：exe 只从自身所在目录读 app.*（VirtualHostNameToFolderMapping），
        # 源码改了没重新 build.cmd 的话右图就是旧样式——那样的对照白做。
        $stale = @()
        foreach ($f in 'app.html', 'app.css', 'app.js') {
            $dst = Join-Path $root "out\$f"
            if (-not (Test-Path $dst)) { $stale += "$f(缺)" }
            elseif ((Get-Item (Join-Path $root $f)).LastWriteTime -gt (Get-Item $dst).LastWriteTime) { $stale += $f }
        }
        if ($stale.Count) { throw ("out\ 里的 {0} 比源码旧——先跑 build.cmd 再拍" -f ($stale -join ', ')) }
        if (Get-Process -Name bootstrapper -ErrorAction SilentlyContinue) { Write-Error "已有 bootstrapper 在跑，先关掉" }
        $argl = if ($un) { '--uninstall --preview="' + (PrevQuery $s) + '"' } else { '--preview="' + (PrevQuery $s) + '"' }
        Start-Process -FilePath $exe -ArgumentList $argl | Out-Null
        Start-Sleep -Milliseconds $SettleMs
        & $shot -OutPath $appPng | Out-Null
        Stop-Process -Name bootstrapper -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 400      # 等窗口真正消失，避免影响下一屏
    }

    # 倍数：实机窗口的实际像素宽 / 780（100% DPI = 1，125% = 1.25…）
    $scale = 1.0
    if (Test-Path $appPng) {
        $ia = [System.Drawing.Image]::FromFile($appPng); $scale = $ia.Width / $stageW; $ia.Dispose()
    }
    $mkPct = if ($s -eq 'progress') { $Pct } else { -1 }
    & $mockShot -Screen $s -Pct $mkPct -Scale $scale -Out $mockPng -Mock $mockPath -W $stageW -H $stageH | Out-Null

    if (-not $NoComposite) {
        $out = Join-Path $root "out\cmp-$pre$s.png"
        if ($MockupOnly -or -not (Test-Path $appPng)) {
            "$s : only mockup (no app png) -> $mockPng"
        } else {
            Composite $mockPng $appPng $out $mockLabel
            "$s : scale=$scale -> $out"
        }
    }
}
