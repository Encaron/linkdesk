# guard-test.ps1 — 件 2c 验收：版本守卫 ＋ 进程守卫（优雅关闭）＋ 路径守卫（宿主侧）
#
# 🔴 设计底线：**零系统写入**。本脚本不写真机注册表、不碰真装目录（那是 syswrite-test/install-test
#   的活，且带备份还原）。四条路全靠两个测试缝造情形——
#     · `LK_GUARD_ASSUME_VERSION=<ver>`（main.cpp）：覆盖 ARP 的已装版本读数 ⇒ 不用改注册表
#       就能摆出「同版 / 本包更旧 / 本包更新」三种情形（与 LK_FORCE_NO_RUNTIME 同族的缝）。
#     · `?autouninstall=1` / `?autocontinue=1`（app.js）：页面**真动作**自动点「卸载」「关闭并继续」，
#       测的是产品那条 post 链，不是宿主短路（同 ?autoinstall=1 口径）。
#   对「本包更新 ⇒ 放行」那条正路，不在这里重测——它是 2a/2b 既有验收的默认情形（无旧版可比），
#   这里只顺带验「放行后守卫不再出声」（路 4 假装已装 0.0.1 ⇒ 放行 ⇒ 走到 dir-invalid）。
#
# 判据全走 **--log**（宿主→页面消息逐行落盘，留 out\guard-*.log）与**退出码**，不靠截图猜
# （同 install-test 口径）。
#
# 路 1 静默版本守卫（真安装包 + /S）：同版 / 本包更旧 ⇒ 退 1602 且目标目录**一个字节都没建**；
#      本包更新 ⇒ 放行（进到装，被故意堵死的目录拦下 ⇒ 退 5 ≠ 1602 —— 用「放行后的下一道闸」
#      证放行，代价为零）。
# 路 2 界面态版本守卫（真接线）：同版 ⇒ 日志出现 `version-guard`(kind=same) 且**没有** `progress`
#      —— 守卫屏被真正送到了页面、安装没往下走。
# 路 3 进程守卫（replica = out\LinkDesk.exe，壳的改名副本，页面功能齐全）：
#      3a 无实例 ⇒ `uninstall-norun` 后接 `uninstall-closed`（没在跑就不问，直接进帧 3）；
#      3b 有实例 ⇒ `uninstall-running`，宿主给 replica 发 WM_CLOSE（**replica 自己的日志**出现
#          `close-request` —— 这条消息只有收到 WM_CLOSE 才会发，比退出码更能证明「走的是优雅关」），
#          replica 自己退干净 ⇒ `uninstall-closed`；
#      3c 有实例但拒关（replica 带 LK_IGNORE_CLOSE=1）⇒ ~10s 后 `uninstall-close-timeout`，
#          **replica 进程还在**（证明没 taskkill、没强杀）。
# 路 4 路径守卫（2c-E 宿主半边）：假装已装旧版（守卫放行）＋ 目标目录的父级是个**文件**
#      ⇒ `dir-invalid` 就近回页面，且没有 `progress`——页面行内错那半边由 dom-probe 覆盖。
#
# 用法：powershell -File tools\guard-test.ps1            （四条路全跑）
#       tools\guard-test.ps1 -Road 3                     （只跑一条，排查用）
# 产物：out\guard-test.log（脚本流水）＋ out\guard-r*.log（各路 --log）＋ out\guard-replica.log

param(
  [string]$Setup = (Join-Path $PSScriptRoot '..\out\linkdesk-setup-2c.exe'),
  [string]$ShellExe = (Join-Path $PSScriptRoot '..\out\bootstrapper.exe'),
  [string]$Builder = (Join-Path $PSScriptRoot '..\..\..\..\scripts\build-installer.mjs'),
  [int]$ReplicaSettleMs = 7000,    # 等 replica 的 WebView2 页面起完（WM_CLOSE 要有页面回话才会真关）
  [int]$Road = 0,                  # 0 = 全部；1..4 单跑一路
  [switch]$Keep                    # 测完不删 out\LinkDesk.exe（排查用）
)
$ErrorActionPreference = 'Stop'
$outDir = Split-Path $ShellExe -Parent
$selfLog = Join-Path $outDir 'guard-test.log'
$replicaExe = Join-Path $outDir 'LinkDesk.exe'
$pass = 0; $fail = 0

function Note { param($m) $line = ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m); Write-Output $line; Add-Content -LiteralPath $selfLog -Value $line -Encoding UTF8 }
function Pass { param($m) $script:pass++; Note ("  PASS  " + $m) }
function Bail { param($m) $script:fail++; Note ("  FAIL  " + $m) }

# PS 5.1 没有 ProcessStartInfo.ArgumentList ⇒ 手工拼 Arguments（引号包住含 & 的 preview 串）。
# ⚠️ 宿主只认 **`--preview=<query>`**（等号连写，见 main.cpp 的 argv 解析）——拆成两个 token 会被
#   静默忽略（页面回到默认屏、auto* 全不触发，且没有任何报错）。--log= / --dir= 同为等号连写。
function QArg { param($s) return '"' + ($s -replace '"', '\"') + '"' }
function Start-Exe {
  param([string]$Exe, [string[]]$ArgList, [hashtable]$Env = @{}, [string]$Log = '')
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Exe
  $all = @($ArgList)
  if ($Log) { $all += ('--log=' + $Log) }
  $psi.Arguments = ($all | ForEach-Object { QArg $_ }) -join ' '
  $psi.UseShellExecute = $false
  foreach ($k in $Env.Keys) { $psi.EnvironmentVariables[$k] = $Env[$k] }
  return [System.Diagnostics.Process]::Start($psi)
}
function Stop-Exe { param($p) if ($p -and -not $p.HasExited) { try { $p.Kill(); [void]$p.WaitForExit(3000) } catch {} } }

# 等日志里同时出现全部 pattern（--log 一行一条 JSON，宿主→页面消息的逐字据）
function Wait-LogFor {
  param([string]$Log, [string[]]$Need, [int]$TimeoutSec = 30)
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    if (Test-Path -LiteralPath $Log) {
      $txt = Get-Content -LiteralPath $Log -Raw -ErrorAction SilentlyContinue
      if ($txt -and @($Need | Where-Object { $txt -notlike ("*" + $_ + "*") }).Count -eq 0) { return $true }
    }
    Start-Sleep -Milliseconds 300
  }
  return $false
}
function Log-Has {
  param([string]$Log, [string]$Need)
  if (-not (Test-Path -LiteralPath $Log)) { return $false }
  $txt = Get-Content -LiteralPath $Log -Raw -ErrorAction SilentlyContinue
  return ($txt -and $txt -like ("*" + $Need + "*"))
}

Remove-Item -LiteralPath $selfLog -ErrorAction SilentlyContinue
Note ("guard-test 开跑；setup=" + $Setup + " · 载荷版本见下")

# ── 路 0 · 前置体检（同 syswrite-test 的「目标体检」家法：条件不齐就不往下跑）────────
if (-not (Test-Path -LiteralPath $ShellExe)) { Note "FAIL 找不到壳 out\bootstrapper.exe——先 build.cmd"; exit 3 }
if (-not (Test-Path -LiteralPath $Setup)) {
  Note "FAIL 找不到带载荷的安装包 out\linkdesk-setup-2c.exe。先重拼："
  Note "  node scripts\build-installer.mjs --exe out\bootstrapper.exe --payload=<app-*.7z> --out=out\linkdesk-setup-2c.exe"
  exit 3
}
# 新鲜度门禁（README 坑 11 同款）：setup 的壳必须是当前壳——拿 setup 的 mtime 对比壳的 mtime
if ((Get-Item -LiteralPath $Setup).LastWriteTime -lt (Get-Item -LiteralPath $ShellExe).LastWriteTime) {
  Note "FAIL setup 比当前壳旧（里面还是旧壳）——重跑 build-installer.mjs 再测"; exit 3
}
# marker 自洽（顺带拿到载荷版本号，路 1/2 拿它造「同版」）
# ⚠️ node 的中文输出在 PS 5.1 里按 ANSI 读会成乱码 ⇒ 版本号只从 **ASCII 可辨**的
#    `x.y.z` 串里挑（marker 契约里它是唯一带点的数字；取最后一个，前面的数字都是字节数）
$chk = (& node $Builder --check $Setup 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { Note ("FAIL marker 不自洽：" + $chk.Trim()); exit 3 }
$allVer = [regex]::Matches($chk, '\b([0-9]+\.[0-9]+\.[0-9]+[0-9A-Za-z.+-]*)\b')
if ($allVer.Count -eq 0) { Note ("FAIL 读不出载荷版本（--check 输出：" + $chk.Trim() + "）"); exit 3 }
$ver = $allVer[$allVer.Count - 1].Groups[1].Value
Note ("载荷版本 = " + $ver)

# 🔴 别人的 LinkDesk 不许碰：replica 那条路会真的给「每一个 LinkDesk.exe 的顶层窗」发 WM_CLOSE。
#   机器上若跑着**不是本脚本副本**的 LinkDesk.exe（真装机 / 开发机），直接拒跑——先让人把它关掉。
$foreign = @(Get-Process -Name 'LinkDesk' -ErrorAction SilentlyContinue)
if ($foreign.Count -gt 0) { Note ("FAIL 已有 LinkDesk.exe 在跑（" + $foreign.Count + " 个）——本脚本会向它发 WM_CLOSE，先关掉再测"); exit 3 }

$work = Join-Path $env:TEMP ('lk-guard-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  # ══════════════════════ 路 1 · 静默版本守卫（退出码） ══════════════════════
  if ($Road -eq 0 -or $Road -eq 1) {
    Note "路 1 · 静默版本守卫（真安装包 + /S，零写入）"
    # 造一个「装不进去」的目录：父级是文件 ⇒ CreateDirectory/解压必败 ⇒ 放行后会退 5（不是 1602）
    $blocker = Join-Path $work 'blocker'; Set-Content -LiteralPath $blocker -Value 'x'
    $deadDir = Join-Path $blocker 'sub'
    $cases = @(
      @{ name = '同版 ⇒ 静默按取消办';             assume = $ver;      want = 1602 },
      @{ name = '本包更旧 ⇒ 同上';                 assume = '99.0.0';  want = 1602 },
      @{ name = '本包更新 ⇒ 放行（退 5，非被拦的 1602）'; assume = '0.0.1'; want = 5 }
    )
    foreach ($case in $cases) {
      $p = Start-Exe -Exe $Setup -ArgList @('--silent', ('--dir=' + $deadDir)) -Env @{ LK_GUARD_ASSUME_VERSION = $case.assume }
      if (-not $p.WaitForExit(120000)) { Stop-Exe $p; Bail ($case.name + ' —— 120s 没退出'); continue }
      if ($p.ExitCode -eq $case.want) { Pass ($case.name + " —— 退 " + $p.ExitCode) }
      else { Bail ($case.name + " —— 退 " + $p.ExitCode + "（期望 " + $case.want + "）") }
    }
    if (-not (Test-Path -LiteralPath $deadDir)) { Pass '被拦 / 被堵住时目标目录一个字节都没建' }
    else { Bail '目标目录被建出来了（守卫拦晚了，违反「被拦下时什么都不动」）' }
  }

  # ══════════════════════ 路 2 · 界面态版本守卫（真接线） ══════════════════════
  if ($Road -eq 0 -or $Road -eq 2) {
    Note "路 2 · 界面态版本守卫（autoinstall 真动作 → 宿主 version-guard → 页面守卫屏）"
    $log = Join-Path $outDir 'guard-r2.log'
    Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
    $dir = Join-Path $work 'never'
    $p = Start-Exe -Exe $Setup -ArgList @('--preview=autoinstall=1&dust=0&seed=1', ('--dir=' + $dir)) `
                    -Env @{ LK_GUARD_ASSUME_VERSION = $ver } -Log $log
    if (Wait-LogFor -Log $log -Need @('"type":"version-guard"', '"kind":"same"') -TimeoutSec 40) {
      Pass '日志出现 version-guard(kind=same) —— 守卫结论真正送到了页面'
    } else { Bail '40s 内没等到 version-guard（守卫没接上，或 autoinstall 没触发）—— 看 out\guard-r2.log' }
    if (Log-Has -Log $log -Need '"type":"progress"') { Bail '守卫拦下之后仍然出现了 progress —— 拦晚了' }
    else { Pass '拦下后没有任何 progress —— 一个字节没写' }
    if (Test-Path -LiteralPath $dir) { Bail '目标目录被建出来了' } else { Pass '目标目录没建' }
    Start-Sleep -Seconds 2; Stop-Exe $p
  }

  # ══════════════════════ 路 3 · 进程守卫（replica = out\LinkDesk.exe） ══════════════════════
  if ($Road -eq 0 -or $Road -eq 3) {
    Note "路 3 · 进程守卫（replica = 壳的改名副本，页面功能齐全）"
    Copy-Item -LiteralPath $ShellExe -Destination $replicaExe -Force

    # 3a · 无实例：不该问，直接进帧 3；页面自动续跑 ⇒ 宿主确认「已无进程」
    Note "路 3a · 无实例 ⇒ uninstall-norun → uninstall-closed"
    $log = Join-Path $outDir 'guard-r3a.log'
    Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
    $p = Start-Exe -Exe $ShellExe -ArgList @('--uninstall', '--preview=screen=confirm&dust=0&seed=1&autouninstall=1') -Log $log
    if (Wait-LogFor -Log $log -Need @('"type":"uninstall-norun"', '"type":"uninstall-closed"') -TimeoutSec 30) {
      Pass 'uninstall-norun + uninstall-closed 都到了（没在跑：不问、直接走）'
    } else { Bail '没等到 uninstall-norun/uninstall-closed（检测链没接上）—— 看 out\guard-r3a.log' }
    if (Log-Has -Log $log -Need '"type":"uninstall-running"') { Bail '明明没在跑却弹了「正在运行」帧' }
    else { Pass '没有误报「正在运行」' }
    Start-Sleep -Seconds 2; Stop-Exe $p

    # 3b · 有实例 + 肯关：帧 2 问一句 → WM_CLOSE 优雅关 → 对端自己退 → uninstall-closed
    Note "路 3b · 有实例 ⇒ running → WM_CLOSE（优雅关）→ closed"
    $rlog = Join-Path $outDir 'guard-replica.log'; $ulog = Join-Path $outDir 'guard-r3b.log'
    Remove-Item -LiteralPath $rlog, $ulog -ErrorAction SilentlyContinue
    $rep = Start-Exe -Exe $replicaExe -ArgList @('--preview=screen=home&dust=0&seed=1') -Log $rlog
    Start-Sleep -Milliseconds $ReplicaSettleMs
    $p = Start-Exe -Exe $ShellExe -ArgList @('--uninstall', '--preview=screen=confirm&dust=0&seed=1&autouninstall=1&autocontinue=1') -Log $ulog
    if (Wait-LogFor -Log $ulog -Need @('"type":"uninstall-running"') -TimeoutSec 30) {
      Pass 'replica 在跑 ⇒ 帧被拦在「正在运行」（没有静默杀进程）'
    } else { Bail '没等到 uninstall-running（有实例却没问）—— 看 out\guard-r3b.log' }
    $closed = Wait-LogFor -Log $ulog -Need @('"type":"uninstall-closed"') -TimeoutSec 30
    if (Log-Has -Log $rlog -Need '"type":"close-request"') {
      Pass 'replica 自己的日志出现 close-request —— 收到的是 WM_CLOSE，走的是它自己的退出流程（非强杀）'
    } else { Bail 'replica 日志里没有 close-request —— 关闭没走优雅路（或 replica 页面没起来）—— 看 out\guard-replica.log' }
    if ($closed) { Pass '对端退干净 ⇒ uninstall-closed' }
    else { Bail '没等到 uninstall-closed（对端关掉了但轮询没认出来？）' }
    if ($rep.HasExited) { Pass 'replica 进程已退出' } else { Note '  （replica 还在，收尾时清）' }
    Stop-Exe $p; Stop-Exe $rep; Start-Sleep -Milliseconds 800

    # 3c · 有实例但拒关（LK_IGNORE_CLOSE=1）⇒ 10s 超时回「稍后」，且对端还活着（没强杀）
    Note "路 3c · 拒关 ⇒ 10s 超时 → uninstall-close-timeout，对端仍活着"
    $rlog = Join-Path $outDir 'guard-replica3c.log'; $ulog = Join-Path $outDir 'guard-r3c.log'
    Remove-Item -LiteralPath $rlog, $ulog -ErrorAction SilentlyContinue
    $rep = Start-Exe -Exe $replicaExe -ArgList @('--preview=screen=home&dust=0&seed=1') `
                    -Env @{ LK_IGNORE_CLOSE = '1' } -Log $rlog
    Start-Sleep -Milliseconds $ReplicaSettleMs
    $p = Start-Exe -Exe $ShellExe -ArgList @('--uninstall', '--preview=screen=confirm&dust=0&seed=1&autouninstall=1&autocontinue=1') -Log $ulog
    if (Wait-LogFor -Log $ulog -Need @('"type":"uninstall-close-timeout"') -TimeoutSec 30) {
      Pass '10s 等不到 ⇒ uninstall-close-timeout（页面退回帧 2「稍后」）'
    } else { Bail '30s 内没有超时消息（等待/计时没接上）—— 看 out\guard-r3c.log' }
    if (-not $rep.HasExited) { Pass '超时后对端进程还活着 —— 没有被 taskkill/强杀' }
    else { Bail '超时后对端死了 —— 违反「禁 taskkill」' }
    Stop-Exe $p; Stop-Exe $rep
  }

  # ══════════════════════ 路 4 · 路径守卫（宿主半边，2c-E） ══════════════════════
  if ($Road -eq 0 -or $Road -eq 4) {
    Note "路 4 · 路径守卫（守卫放行 0.0.1 ⇒ 走到 ValidateInstallDir ⇒ dir-invalid）"
    $log = Join-Path $outDir 'guard-r4.log'
    Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
    $blocker = Join-Path $work 'blocker4'; Set-Content -LiteralPath $blocker -Value 'x'
    $badDir = Join-Path $blocker 'sub'
    $p = Start-Exe -Exe $Setup -ArgList @('--preview=autoinstall=1&dust=0&seed=1', ('--dir=' + $badDir)) `
                    -Env @{ LK_GUARD_ASSUME_VERSION = '0.0.1' } -Log $log
    if (Wait-LogFor -Log $log -Need @('"type":"dir-invalid"') -TimeoutSec 40) {
      Pass '宿主真试过写 ⇒ dir-invalid 就近回页面（页面显示行内错）'
    } else { Bail '40s 内没等到 dir-invalid（路径探测没接上）—— 看 out\guard-r4.log' }
    if (Log-Has -Log $log -Need '"type":"progress"') { Bail '路径不合法却开装了' }
    else { Pass '没有 progress —— 没往下装' }
    if (Log-Has -Log $log -Need '"type":"version-guard"') { Bail '0.0.1 比载荷旧却拦了（守卫误拦）' }
    else { Pass '守卫对「本包更新」放行（没有 version-guard）' }
    Start-Sleep -Seconds 2; Stop-Exe $p
  }
}
finally {
  foreach ($n in @('LinkDesk', 'bootstrapper', 'linkdesk-setup-2c')) {
    Get-Process -Name $n -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like ($outDir + '*') } | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  if (-not $Keep) { Remove-Item -LiteralPath $replicaExe -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

Note ("guard-test 收工：PASS " + $pass + " · FAIL " + $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
