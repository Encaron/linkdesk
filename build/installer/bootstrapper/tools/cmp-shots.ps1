# cmp-shots.ps1 — 逐屏并排对照（件 1b 安装六屏 ／件 1d 卸载四帧 -Uninstall：mockup 与实机窗口像素级比对）
#   安装：powershell -File tools\cmp-shots.ps1            -> out\cmp-<screen>.png（780×570）
#   卸载：powershell -File tools\cmp-shots.ps1 -Uninstall   -> out\cmp-un-<screen>.png（720×540）
#
# 两侧同源不同管线，所以必须都拍成 PNG 再并排看：
#   左 = mockup（headless Edge 渲染 E-混合提案.html，见 mockup-shot.ps1）
#   右 = 实机（启动 out\bootstrapper.exe --preview=...）——**默认让宿主自己拍**：`--capture=<png>` 走
#        WebView2 的 CapturePreview，只拍页面自己 ⇒ **不碰桌面、不最小化你的任何前台窗口**（无边框窗口
#        仍会出现在屏幕上 `-SettleMs` 那么久，默认 4.2 秒）。`-Desktop` 才改走真实桌面拷贝
#        （capture.ps1：MinimizeAll → 屏拷贝 → UndoMinimizeAll，**每屏把全部前台窗口最小化 4–5 秒**）
#        ——只在「要看真桌面上的样子」时才用。
# 五处口径对齐，否则并排无意义：
#   1. 尺寸：mockup 的 .stage 被钉成 780×570；实机窗口就是 780×570（高 DPI 下实机是 780*scale，
#      于是 mockup 用 -Scale 同倍渲染 —— 先拍实机量出实际像素宽再定倍数）
#   2. 状态：进度屏两侧都定格在同一 pct；自定义屏两侧都展开（mockup 调 toggleCustom，实机 ?custom=1）
#   3. 动效：都等入场/对勾/彩粒跑完再拍（mockup 用虚拟时间，实机用 -SettleMs 实时等待）
#   4. 🔴 语言：宿主会把「上次选择」（`HKCU\Software\LinkDesk\Installer\Language`，本机实测 = `en`）
#      作为 `?lang=` 附到实机 URL 上（main.cpp 只在 query 里没有 `lang=` 时才附）⇒ 不钉死拍出来就是
#      **左中文 / 右英文**的错配图（2026-10-02 实测：十张图全中）。本脚本一律发 `lang=zh-CN` 对齐
#      mockup 的默认语言；要看英文侧传 `-Lang en`。
#   5. 🔴 桌面扰动：默认路径（宿主自拍）零扰动；`-Desktop` 每屏会把用户的**全部前台窗口最小化**
#      4–5 秒（MinimizeAll → 等 SettleMs → 屏拷贝 → UndoMinimizeAll）——批量重拍请用默认路径，
#      别让别人的桌面连闪十次（2026-10-02 实测踩过：十屏 ≈ 40 秒的「全部最小化」）。
param(
    [string[]]$Screens = @(),              # 空 = 按 -Uninstall 取默认屏集
    [switch]$Uninstall,                    # 卸载屏对照（confirm/running/progress/finish，画布 720×540，--uninstall）
    [int]$Pct = 42,        # 进度屏定格百分比
    [int]$SettleMs = 4200, # -Desktop 路径的等待（入场 .8s + 对勾 .95s + 彩粒 1.75s，留足余量）
    [switch]$Desktop,      # 用真桌面拷贝取实机图（会 MinimizeAll，见口径 5；默认走宿主 --capture 自拍）
    [switch]$MockupOnly,   # 只拍 mockup（不启实机窗口）
    [switch]$NoComposite,  # 拍完不合成（保留单侧 PNG）
    [string]$Lang = 'zh-CN' # 实机侧语言（钉死以对齐 mockup，见上方口径 4；要英文侧传 -Lang en）
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

# 实机预览参数（与 app.js 的预览开关同口径：screen/custom/pct/dust）＋语言钉死（见口径 4）
function PrevQuery([string]$s) {
    $q = switch ($s) {
        'custom' { 'screen=home&custom=1&dust=0' }
        'progress' {
            if ($un) { "screen=un-progress&pct=$Pct&dust=0" }
            else { "screen=progress&pct=$Pct&dust=0" }
        }
        default {
            # 卸载屏在页面里的 id 带 un- 前缀（finish -> un-finish）；confirm/running 同名
            $name = if ($un -and @('confirm', 'running') -notcontains $s) { "un-$s" } else { $s }
            "screen=$name&dust=0"
        }
    }
    return "$q&lang=$Lang"   # 带 lang= 会抑制宿主附上的「上次选择」（否则左右语言对不上）
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
        if ($Desktop) {
            Start-Process -FilePath $exe -ArgumentList $argl | Out-Null
            Start-Sleep -Milliseconds $SettleMs
            & $shot -OutPath $appPng | Out-Null
            Stop-Process -Name bootstrapper -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 400      # 等窗口真正消失，避免影响下一屏
        } else {
            # 宿主自拍（默认）：CapturePreview 只拍 WebView2 自己 —— 不碰桌面、不动任何前台窗口。
            # 落图延时由宿主自己掌握（kCaptureDelayMs＝1200ms，在 i18n fetch 与入场动效之后），拍完自退。
            if (Test-Path $appPng) { Remove-Item $appPng -Force }
            $p = Start-Process -FilePath $exe -ArgumentList ($argl + ' --capture="' + $appPng + '" --capture-delay=' + $SettleMs) -PassThru
            if (-not $p.WaitForExit(30000)) { try { $p.Kill() } catch {} ; throw "宿主自拍超时（30s）：$s" }
            if (-not (Test-Path $appPng)) { throw "宿主自拍没落图：$s" }
        }
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
