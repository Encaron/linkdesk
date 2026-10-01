# install-test.ps1 — 件 2a 验收：单文件安装包的「真安装」两条路
#
#   路 A（界面态）：照产品路径跑 —— 开窗 → 页面自动点「立即安装」→ 宿主解压 → 四段进度 → 完成屏。
#                    进度不靠截图猜：宿主用 `--log=` 把每条宿主→页面消息落盘，这里直接断言
#                    **数值只前进不倒退**、且四个段边界都到过。
#   路 B（静默态）：更新链走的那条 —— `--silent --dir=`，不建窗、不碰 WebView2。
#                    断言退出码 0，且落位文件数/字节数与 marker 里声明的 `unpacked` 对上。
#   路 C（装完拉壳）：更新链的收尾 —— `--silent --force-run`。更新器 `app.relaunch()` 就是这两个开关
#                    （electron/services/update-install.ts 的 defaultLaunch）。断言真拉起了
#                    `<安装目录>\LinkDesk.exe`（按路径认，不按名字——机器上可能另有实例）。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File tools\install-test.ps1 -Setup <安装包.exe> [-Work <临时根>]
#
# ⚠️ 三条路的 --dir 都指向临时目录：**不碰**真正装的那份 LinkDesk（`%LocalAppData%\Programs\linkdesk`）。
# 🔴 但**会碰真机的注册表/快捷方式**（件 2b 起：关联/右键/PATH/ARP/快捷方式），故需 `-AllowSystemWrites`；
#    要备份还原请改用 tools\syswrite-test.ps1（同一链路 ＋ 全量备份还原）。
param(
    [Parameter(Mandatory=$true)][string]$Setup,
    [string]$Work = "$env:TEMP\linkdesk-install-test",
    [int]$UiTimeoutSec = 90,
    [switch]$AllowSystemWrites
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Setup = (Resolve-Path $Setup).Path

# 🔴 2026-10-02（件 2b 收口）：本脚本**不再是无副作用的**。自 2b 把系统写入接线后，三条路里的
#    每一次安装都会写**真机**：文件关联 · 右键两项（静默态按注册表现状反推）· **PATH 追加** ·
#    桌面/开始菜单快捷方式 · ARP 键。而本脚本**没有备份/还原**（2a 时这些活还没写，当时确实安全）。
#    所以这里硬拦一道——要跑必须显式认领；否则请改用带全量备份的 syswrite-test.ps1。
if (-not $AllowSystemWrites) {
    Write-Host @"
🔴 拒绝执行：install-test.ps1 现在会**改真机的注册表与快捷方式**（件 2b 起：关联/右键/PATH/ARP/快捷方式），
   而本脚本**没有备份还原**。要跑请二选一：
     ① 加 -AllowSystemWrites 显式认领（跑完自行收拾 PATH 里的临时目录与 ARP 键）；
     ② 或改跑 tools\syswrite-test.ps1 —— 同一条安装链路，但**全量备份 ＋ 无条件还原**，
        收尾崩了还能用 `powershell -File tools\syswrite-test.ps1 -RestoreOnly` 补救。
"@
    exit 2
}

$bad = 0
function Say($ok, $msg) {
    if ($ok) { Write-Host "OK   $msg" } else { Write-Host "FAIL $msg"; $script:bad++ }
}

# 收尾：本测试拉起的进程一律按路径清掉（不按名字误杀别的构建）
function Stop-TestProcs {
    Get-Process -ErrorAction SilentlyContinue |
        Where-Object { try { $_.Path -eq $Setup } catch { $false } } |
        ForEach-Object { $_.Kill(); $_.WaitForExit(5000) }
}

Stop-TestProcs
Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Work | Out-Null

Write-Host "`n=== 路 B：静默安装（--silent）==="
$silentDir = Join-Path $Work 'silent'
$t0 = Get-Date
$p = Start-Process -FilePath $Setup -ArgumentList @('--silent', "--dir=$silentDir") -PassThru -Wait
$secs = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
Say ($p.ExitCode -eq 0) "退出码 $($p.ExitCode)（期望 0），耗时 ${secs}s"

$files = Get-ChildItem -Recurse -File $silentDir -ErrorAction SilentlyContinue
$bytes = ($files | Measure-Object -Property Length -Sum).Sum
Say ($null -ne $files -and $files.Count -gt 0) "落位文件数 $($files.Count)"
Say (Test-Path (Join-Path $silentDir 'LinkDesk.exe')) "LinkDesk.exe 在位"

# marker 里声明的解压后字节数（与文件系统实测对账；读不到就跳过，不假装通过）
$raw = [System.IO.File]::ReadAllBytes($Setup)
$magic = [System.Text.Encoding]::ASCII.GetBytes('LKDESK-PAYLOAD-1')
$markerAt = -1
for ($at = $raw.Length - 64; $at -ge 0; $at--) {
    if ($raw[$at] -ne $magic[0]) { continue }
    $hit = $true
    for ($k = 0; $k -lt 16; $k++) { if ($raw[$at + $k] -ne $magic[$k]) { $hit = $false; break } }
    if (-not $hit) { continue }
    $packed = [BitConverter]::ToUInt64($raw, $at + 16)
    if (($at + 64 + $packed) -ne $raw.Length) { continue }
    $markerAt = $at; break
}
if ($markerAt -ge 0) {
    $unpacked = [BitConverter]::ToUInt64($raw, $markerAt + 24)
    $ver = [System.Text.Encoding]::ASCII.GetString($raw, $markerAt + 32, 32).TrimEnd([char]0)
    Write-Host "     marker@$markerAt 版本 $ver 声明解压后 $unpacked 字节"
    Say ($bytes -eq $unpacked) "落位字节 $bytes 与 marker 声明一致"
} else {
    Say $false "安装包里找不到自洽的 marker"
}

Write-Host "`n=== 路 A：界面态安装（--preview=autoinstall=1 --log=）==="
$uiDir = Join-Path $Work 'ui'
$log = Join-Path $Work 'host.log'
Remove-Item -Force $log -ErrorAction SilentlyContinue
$args = @("--preview=autoinstall=1", "--dir=$uiDir", "--log=$log")
Start-Process -FilePath $Setup -ArgumentList $args | Out-Null

$deadline = (Get-Date).AddSeconds($UiTimeoutSec)
while ((Get-Date) -lt $deadline) {
    if ((Test-Path $log) -and (Select-String -Path $log -Pattern 'install-done' -Quiet)) { break }
    Start-Sleep -Milliseconds 250
}
Start-Sleep -Milliseconds 800
Stop-TestProcs

Say (Test-Path $log) "宿主消息日志已生成（$log）"
if (Test-Path $log) {
    $lines = Get-Content $log | Where-Object { $_.Trim() }
    $pcts = @()
    foreach ($l in $lines) {
        if ($l -match '"type":"progress".*"pct":(\d+)') { $pcts += [int]$Matches[1] }
    }
    Say ($pcts.Count -gt 0) "收到 $($pcts.Count) 条进度消息"
    $regress = @()
    for ($i = 1; $i -lt $pcts.Count; $i++) { if ($pcts[$i] -lt $pcts[$i-1]) { $regress += "$($pcts[$i-1])->$($pcts[$i])" } }
    Say ($regress.Count -eq 0) "进度只前进不倒退（倒退 $($regress.Count) 处$(if($regress){": "+($regress -join ', ')})）"
    Say ($pcts.Count -gt 0 -and $pcts[-1] -eq 100) "进度收在 100（末值 $(if($pcts){$pcts[-1]}else{'—'})）"
    # 四段边界：0–70 解压 / 70–80 协议 / 80–92 系统项 / 92–100 校验
    $segs = @(0,0,0,0)
    foreach ($v in $pcts) {
        if ($v -lt 70) { $segs[0]++ } elseif ($v -lt 80) { $segs[1]++ } elseif ($v -lt 92) { $segs[2]++ } else { $segs[3]++ }
    }
    Write-Host "     段分布（<70 / 70-79 / 80-91 / 92-100）：$($segs -join ' / ')"
    Say ($segs[0] -gt 0) "解压段有真读数（$($segs[0]) 条）——证明进度不是摆设"
    Say ((Select-String -Path $log -Pattern 'install-done' -Quiet) -eq $true) "日志里有 install-done"
    $uiFiles = Get-ChildItem -Recurse -File $uiDir -ErrorAction SilentlyContinue
    Say ($null -ne $uiFiles -and $uiFiles.Count -gt 0) "界面态也真落了文件（$($uiFiles.Count) 个）"
}

Write-Host "`n=== 路 C：静默安装 ＋ 装完拉壳（--silent --force-run）==="
$frDir = Join-Path $Work 'forcerun'
$appExe = Join-Path $frDir 'LinkDesk.exe'
# 不 -Wait：ShellExecute 拉起的壳在本进程退出**之前**就起来了，等退出再找会漏（壳可能被单实例锁
# 立刻顶掉）。所以一边跑一边每 100ms 找 `<安装目录>\LinkDesk.exe`。
$p3 = Start-Process -FilePath $Setup -ArgumentList @('--silent', '--force-run', "--dir=$frDir") -PassThru
$seen = $false
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
    $hit = Get-Process -ErrorAction SilentlyContinue |
        Where-Object { try { $_.Path -eq $appExe } catch { $false } }
    if ($hit) { $seen = $true; break }
    Start-Sleep -Milliseconds 100
}
$p3.WaitForExit(120000)
Say ($p3.ExitCode -eq 0) "退出码 $($p3.ExitCode)（期望 0）"
Say $seen "装完拉起了 $appExe"
Say (Test-Path $appExe) "拉壳目标确实是本测试装的那份（不是机器上另装的实例）"
# 收掉本次拉起的壳及其子进程——按**安装目录路径**认，不按进程名（不误杀别的构建/用户实例）
Get-Process -ErrorAction SilentlyContinue |
    Where-Object { try { $_.Path -eq $appExe } catch { $false } } |
    ForEach-Object { $_.Kill(); $_.WaitForExit(5000) }

Write-Host ""
if ($bad -eq 0) { Write-Host "全部通过"; exit 0 }
Write-Host "$bad 项未通过"; exit 1