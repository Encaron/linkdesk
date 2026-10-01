# syswrite-test.ps1 — 件 2b 验收：系统写入（关联/右键/PATH/ARP/快捷方式）**在真机上**跑一遍
#
# 为什么要有这个脚本：2b 写的是**用户真实注册表**——ARP 键名与现装的 NSIS 版**同一个**
#   （`d7b1f08d-…` = UUID.v5('com.linkdesk.app', …)），PATH 更是「写坏了用户就找不到命令」。
#   所以本脚本干的第一件事不是跑安装，是**把要碰的东西全量导出备份**，跑完无条件还原
#   （导出到 $Work\_back\*.reg，`reg.exe` 原样往返，值的类型/编码不经过我这层手）。
#     树导出  Software\Microsoft\Windows\CurrentVersion\Uninstall\d7b1f08d-…
#             Software\LinkDesk
#             Software\Classes\LinkDesk.Document
#             Software\Classes\*\shell\OpenWithLinkDesk            （字面 `*` 是键名）
#             Software\Classes\Directory\shell\OpenWithLinkDesk
#             Software\Classes\Directory\Background\shell\OpenWithLinkDesk
#             Software\Classes\<13 个扩展名>\OpenWithProgids       （只动这个子键，不碰扩展名键本身）
#     值导出  Software\RegisteredApplications → LinkDesk        （共用键，**整键不能删**）
#             Environment → Path                                （共用键同上）
#     文件    Desktop\LinkDesk.lnk · Programs\LinkDesk.lnk       （会被覆盖）
#
# 四条路（各测一件事，互不掩盖）：
#   路 1  静默 · 反推现状   `--silent --dir=<临时>`：静默没有勾选值 ⇒ 走「按现状反推」
#                          （口径同 installer.nsh 的 `lkInitTaskDefaults`：读右键键的**默认值**，
#                           非空 ⇒ 用户当初勾过 ⇒ 保持；键不存在/默认值空 ⇒ 不复活）。
#                          故断言**逐键跟着装前现状走**——装前非空的必须被改写指向本次目录，
#                          装前没有的必须**仍然没有**。同时断言 **PATH 一个字节没动**（幂等）。
#                          ⚠️ 这条不是「三键都该被写」：本机 `Software\Classes\*\shell\OpenWithLinkDesk`
#                              **本来就不存在**（2026-10-01 实测），所以它不该出现——写死期望会在本机假红。
#   路 1b 静默 · 反推为勾   先把三个右键键**预置**成「用户当初勾过」（默认值 ＋ 指向老目录的 Icon/command）
#                          ⇒ 反推全为勾 ⇒ 断言三键**都被改写**指向本次目录。本机 `*\shell` 本不存在，
#                          只有这一路能验到它的**写入侧**（顺带验「覆盖装不静默丢弃用户勾过的项」）。
#   路 2  界面态 · 勾选真值  先删掉三个右键键（含路 1b 预置的），再走**页面真动作**
#                          （`--preview=autoinstall=1`，页面里两个右键框默认不勾）⇒ 断言三键**没被写**、
#                          而 ProgId/Capabilities 写了。顺带覆盖「覆盖安装」：本路不给 --dir，目录从
#                          ARP 键里读出来 ⇒ 断言 UninstallString **一字未变**。
#   路 3  静默 · PATH 真追加  临时摘掉 PathAdded（备份其值），跑一次 ⇒ 断言 Path 末尾追加了目标目录、
#                          PathBackup == 追加前的原值、再装一次不重复追加，然后还原。
#                          **这是唯一会真改用户 PATH 的一路。**
#   路 3b 静默 · 类型不降级  **故意**把 PATH 改成 `REG_EXPAND_SZ`（值不变）再装一次 ⇒ 断言出来的类型
#                          仍是 EXPAND。本机 PATH 是 `REG_SZ`，路 3 只验到「SZ 进 SZ 出」这一个分支，
#                          而真机 PATH 常含 `%USERPROFILE%\…` 未展开项——被降级成 SZ 就**永远不再展开**。
#                          现场由 Restore-All 连值带类型一起还原（还原处有类型断言兜底）。
# 还原口径：装前**不存在**的键没有导出文件可导，Restore-All 是「先删后导」⇒ 它自然回到「没有」。
#   （`-SkipRestore` 是留现场的调试开关，此时路 1b 预置的那个 `*\shell` 键会留在注册表里；
#     跑一次 `-RestoreOnly` 即可清掉——它照上面的口径把不存在的键删干净。）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File tools\syswrite-test.ps1 -Setup out\linkdesk-setup-dev.exe
#   powershell -ExecutionPolicy Bypass -File tools\syswrite-test.ps1 -SkipRestore    # 调试：留现场
#   powershell -ExecutionPolicy Bypass -File tools\syswrite-test.ps1 -RestoreOnly    # 只按上次的备份还原
#
# ⚠️ 不跑真 LinkDesk 的任何东西；安装目录一律 <临时根> 下。**不做 2d 的清理**（那是另一件的活）。
param(
    [string]$Setup = "",
    [string]$Work = "$env:TEMP\linkdesk-syswrite-test",
    [string]$SevenZip = "",
    [switch]$SkipRestore,
    [switch]$RestoreOnly
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($Setup) { $Setup = (Resolve-Path $Setup).Path }
# 7zr 的落点是 tools\.cache（fetch-7z.ps1 拉的，与 build.cmd 同一份）；找不到就明说跳过，不猜路径
if (-not $SevenZip) { $SevenZip = Join-Path $here '.cache\7zr.exe' }
$SevenZip = (Resolve-Path $SevenZip -ErrorAction SilentlyContinue).Path

$bad = 0
function Say($ok, $msg) {
    if ($ok) { Write-Host "OK   $msg" } else { Write-Host "FAIL $msg"; $script:bad++ }
}

# ── 注册表读取：走 .NET API，**不用 PowerShell 提供程序** ────────────────────────
# 提供程序把 `*` 当通配符（`HKCU:\Software\Classes\*\shell` 会枚举，不是定位），
# 而 .NET 的 OpenSubKey 只认 `\` 作分隔、`*` 就是普通键名。这一处偷懒会静默测错对象。
# ⚠️ 写入/还原一律走 `reg.exe import`（见下），**不用**这里的 SetValue——值的类型与编码
#    由 reg.exe 原样往返，比我在脚本里重新拼一遍可靠。
$HK = [Microsoft.Win32.Registry]::CurrentUser
$DONTEXPAND = [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames

function Reg-Get([string]$sub, [string]$name) {
    $k = $HK.OpenSubKey($sub, $false); if (-not $k) { return $null }
    $v = $k.GetValue($name, $null, $DONTEXPAND); $k.Close(); return $v
}
function Reg-Kind([string]$sub, [string]$name) {
    $k = $HK.OpenSubKey($sub, $false); if (-not $k) { return -1 }
    try { $t = [int]$k.GetValueKind($name) } catch { $t = -1 }
    $k.Close(); return $t
}
function Reg-Has([string]$sub) { $k = $HK.OpenSubKey($sub, $false); if ($k) { $k.Close(); return $true }; return $false }
function Reg-HasValue([string]$sub, [string]$name) {
    $k = $HK.OpenSubKey($sub, $false); if (-not $k) { return $false }
    $hit = ($k.GetValueNames() -contains $name); $k.Close(); return $hit
}
function Reg-DelTree([string]$sub) {
    if (Reg-Has $sub) {
        try { $HK.DeleteSubKeyTree($sub, $false) } catch {
            # `*` 这类键名删不掉时退回 reg.exe（同一件事的两个入口，一个不行换另一个）
            Invoke-Reg "删键树 $sub" @('delete', "HKCU\$sub", '/f') -AllowFail | Out-Null
        }
    }
}
function Reg-DelValue([string]$sub, [string]$name) {
    # 值/键本来就不在 ⇒ reg.exe 退 1 属预期，用 -AllowFail（"删干净了"这件事由调用方自己断言）
    Invoke-Reg "删值 $sub\$name" @('delete', "HKCU\$sub", '/v', $name, '/f') -AllowFail | Out-Null
}
# 只为**预置**取值（路 1b 造「当初勾过」的现场、路 3b 造 REG_EXPAND_SZ 现场）——类型是我自己定的，
# 不涉及往返未知类型，所以走 .NET 比 reg.exe 稳：值里带 `"`／`%1`／`%USERPROFILE%`，交给 reg.exe
# 命令行会被引号或变量解析吃掉一层（`$kind`：1=String(REG_SZ) · 2=ExpandString(REG_EXPAND_SZ)）。
function Reg-Set([string]$sub, [string]$name, [string]$val, [int]$kind = 1) {
    $k = $HK.CreateSubKey($sub, $true)
    $k.SetValue($name, $val, [Microsoft.Win32.RegistryValueKind]$kind)
    $k.Close()
}
# `RegistryValueKind` 的枚举数 → `reg.exe` 认的类型名。
# ⚠️ `[RegistryValueKind]::ToString()` 给的是 `String`/`ExpandString`，**reg.exe 不认**——
#    它要的是 `REG_SZ`/`REG_EXPAND_SZ`。混用会静默写错类型（PATH 尤其致命）。
function Reg-TypeName([int]$kind) {
    switch ($kind) {
        1 { 'REG_SZ' }
        2 { 'REG_EXPAND_SZ' }
        3 { 'REG_BINARY' }
        4 { 'REG_DWORD' }
        7 { 'REG_MULTI_SZ' }
        default { 'REG_SZ' }
    }
}

# ── 新鲜度门禁（先于一切断言，硬拦）───────────────────────────────────────────
# 🔴 2026-10-02 实测教训：改完 `syswrite.cpp`／`main.cpp` 忘了重跑 `build.cmd` ＋ 重拼，
#    本脚本**照样跑得下去**——它验的是**旧的壳**，绿的是旧代码。假绿比红贵：看着有证据，证据是陈的。
#    （当时读数：`syswrite.cpp` 10-02 00:39:42 改，`out/bootstrapper.exe` 00:38:12 编译，
#      setup exe 00:45:18 —— 比源文件**旧 90 秒**，于是「PATH 类型不降级」那条假红跑成了 FAIL。）
# 判据：setup.exe 必须比壳源 ＋ 页源都新；壳 exe 若在，还必须比 setup.exe 旧（否则＝改了壳忘了拼）。
$newest = $null; $newestName = ''
foreach ($n in @('main.cpp', 'syswrite.cpp', 'syswrite.h', 'app.js', 'app.css', 'app.html')) {
    $p = Join-Path (Join-Path $here '..') $n
    if (Test-Path $p) {
        $t = (Get-Item $p).LastWriteTime
        if (-not $newest -or $t -gt $newest) { $newest = $t; $newestName = $n }
    }
}
$setupTime = $null
if ($Setup) { $setupTime = (Get-Item $Setup).LastWriteTime }
if ($newest -and $setupTime -and $setupTime -lt $newest) {
    Write-Host "🔴 安装包比源文件旧——先 build.cmd，再用 scripts/build-installer.mjs 重拼，别拿旧壳验收"
    Write-Host "     $([IO.Path]::GetFileName($Setup)) = $setupTime"
    Write-Host "     最新源 $newestName = $newest"
    exit 3
}
$shellExe = Join-Path $here '..\out\bootstrapper.exe'
if ($setupTime -and (Test-Path $shellExe)) {
    $shellTime = (Get-Item $shellExe).LastWriteTime
    if ($shellTime -gt $setupTime) {
        Write-Host "🔴 壳 exe 比安装包新——壳重建了但没重拼载荷（out\bootstrapper.exe $shellTime > setup $setupTime）"
        exit 3
    }
}
if ($setupTime) { Write-Host "新鲜度 OK：安装包 $setupTime ≥ 最新源 $newestName（$newest）" }

$EXTS = @('.txt', '.py', '.js', '.json', '.md', '.html', '.css', '.ts', '.tsx', '.yaml', '.xml', '.csv', '.log')
# 右键三项：键名 → command 参数。`*\` 与 `Directory\` 传的是 "%1"（被点的那一项本身），
# `Directory\Background\` 传的是 "%V"（被点的那一层目录）。**字面 `*` 是键名、不是通配符**——
# 判据见 Reg-Get 上方注释（用提供程序的 Test-Path 会被它当通配符匹配到 Directory，静默测错对象）。
$MENUS = @(
    @{ k = 'Software\Classes\*\shell\OpenWithLinkDesk'; arg = '"%1"' },
    @{ k = 'Software\Classes\Directory\shell\OpenWithLinkDesk'; arg = '"%1"' },
    @{ k = 'Software\Classes\Directory\Background\shell\OpenWithLinkDesk'; arg = '"%V"' }
)
$ARP = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\d7b1f08d-e543-5ebb-a1d6-cfc088dc2c70'
$TREE_ROOTS = @(
    $ARP,
    'Software\LinkDesk',
    'Software\Classes\LinkDesk.Document',
    'Software\Classes\*\shell\OpenWithLinkDesk',
    'Software\Classes\Directory\shell\OpenWithLinkDesk',
    'Software\Classes\Directory\Background\shell\OpenWithLinkDesk'
) + ($EXTS | ForEach-Object { "Software\Classes\$_\OpenWithProgids" })

$desktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'LinkDesk.lnk'
$menuLnk    = Join-Path ([Environment]::GetFolderPath('Programs')) 'LinkDesk.lnk'
$backDir    = Join-Path $Work '_back'
$stateFile  = Join-Path $Work '_state.json'

# ── 还原 ────────────────────────────────────────────────────────────────────
# 🔴 还原的每一步都必须**各自兜异常**：还原是本脚本唯一的「把用户机器还回去」的路，
#    它自己有一步抛异常，后面几步就不跑了——半还原比不还原更难发现。
#    （定义必须在本节之前：`-RestoreOnly` 分支紧跟在下面，脚本自上而下执行。）
$restoreBad = 0
# 🔴 `reg.exe` 的提示语（`操作成功完成。`）**走 stderr**，而 `$ErrorActionPreference='Stop'`
#    会把原生命令的 stderr 当**终止性错误** ⇒ 明明成功却抛异常。2026-10-02 实机两次栽在这：
#    ① 上次 `Restore-All` 被一句成功提示打断，ARP/PATH 没还原（机器留在临时目录上）；
#    ② 本次加固版又在 import 处假红 18 条。⇒ 原生调用一律经这里，临时把偏好降回 Continue。
#    `-AllowFail`：删不存在的值/键时 reg.exe 退 1 是**预期**，不该抛（调用方自己判后果）。
function Invoke-Reg([string]$what, [string[]]$regArgs, [switch]$AllowFail) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $out = & reg.exe @regArgs 2>&1 } finally { $ErrorActionPreference = $prev }
    if ($LASTEXITCODE -ne 0 -and -not $AllowFail) {
        throw "$what：reg.exe 退出码 $LASTEXITCODE（$(($out | Out-String).Trim())）"
    }
    return $LASTEXITCODE
}
function Restore-Step([string]$what, [scriptblock]$body) {
    try { & $body } catch {
        Write-Host "🔴 还原步骤失败：$what —— $($_.Exception.Message)"
        $script:restoreBad++
    }
}
function Restore-RegFile([string]$file) {
    Invoke-Reg "import $file" @('import', $file) | Out-Null
}
function Restore-All {
    $st = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    Write-Host "`n=== 还原现场（备份 $backDir）==="
    foreach ($r in $TREE_ROOTS) { Restore-Step "删键树 $r" { Reg-DelTree $r } }
    foreach ($f in @($st.exports)) { Restore-Step "导回 $f" { Restore-RegFile (Join-Path $backDir $f) } }
    if ($st.regAppsHad) {
        Restore-Step 'RegisteredApplications → LinkDesk' {
            Invoke-Reg '写 RegisteredApplications' @('add', 'HKCU\Software\RegisteredApplications',
                '/v', 'LinkDesk', '/t', (Reg-TypeName $st.regAppsKind), '/d', $st.regAppsVal, '/f') | Out-Null
        }
    } else { Restore-Step '删 RegisteredApplications → LinkDesk' { Reg-DelValue 'Software\RegisteredApplications' 'LinkDesk' } }
    if ($st.envHad) {
        Restore-Step 'Environment → Path' {
            Invoke-Reg '写 Environment\Path' @('add', 'HKCU\Environment',
                '/v', 'Path', '/t', (Reg-TypeName $st.envKind), '/d', $st.envVal, '/f') | Out-Null
        }
    } else { Restore-Step '删 Environment → Path' { Reg-DelValue 'Environment' 'Path' } }
    foreach ($pair in @(@{ had = $st.desktopHad; f = 'desktop.lnk'; dst = $desktopLnk },
                        @{ had = $st.menuHad;    f = 'menu.lnk';    dst = $menuLnk })) {
        if ($pair.had) { Restore-Step "放回 $($pair.f)" { Copy-Item -LiteralPath (Join-Path $backDir $pair.f) -Destination $pair.dst -Force } }
        else { Restore-Step "删 $($pair.dst)" { Remove-Item -LiteralPath $pair.dst -Force -ErrorAction SilentlyContinue } }
    }
    # 还原本身也要验——不然「跑完测试机器坏了」没人知道
    Say ((Reg-Get $ARP 'DisplayName') -eq $st.arpName0) "ARP DisplayName 已还原为 `"$($st.arpName0)`"（现值 `"$(Reg-Get $ARP 'DisplayName')`"）"
    # 旧备份（2026-10-02 之前）没有这个字段 ⇒ 缺就跳过，不假红
    if ($st.arpUninstall0) {
        Say ((Reg-Get $ARP 'UninstallString') -eq $st.arpUninstall0) "ARP UninstallString 已还原为 `"$($st.arpUninstall0)`"（现值 `"$(Reg-Get $ARP 'UninstallString')`"）"
    }
    Say ((Reg-Get 'Environment' 'Path') -eq $st.envVal) "PATH 已还原（长度 $((Reg-Get 'Environment' 'Path').Length)）"
    # 类型也要断言：路 3b 会临时把 PATH 改成 REG_EXPAND_SZ，只断言「值对」会让一次漏还原静默过关
    Say ((Reg-Kind 'Environment' 'Path') -eq $st.envKind) "PATH 值类型已还原（现 $([Microsoft.Win32.RegistryValueKind](Reg-Kind 'Environment' 'Path'))，应 $([Microsoft.Win32.RegistryValueKind]$st.envKind)）"
    Say ((Test-Path -LiteralPath $desktopLnk) -eq [bool]$st.desktopHad) "桌面 lnk 还原（应有=$($st.desktopHad)）"
    if ($restoreBad -gt 0) {
        Say $false "还原有 $restoreBad 个步骤抛过异常（见上面 🔴 行）——机器可能只还原了一半，请人工核对"
    }
}

if ($RestoreOnly) {
    if (-not (Test-Path $stateFile)) { Write-Host "没有备份状态 $stateFile —— 无从还原"; exit 2 }
    Restore-All
    Write-Host "`n=== 还原汇总：$($bad) 条失败 ==="
    if ($bad -gt 0) { exit 1 }
    exit 0
}
if (-not $Setup) { Write-Host "-Setup 必给（或改用 -RestoreOnly）"; exit 2 }

# ── 备份 ────────────────────────────────────────────────────────────────────
Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $backDir | Out-Null

$exports = @()
$i = 0
foreach ($r in $TREE_ROOTS) {
    if (Reg-Has $r) {
        $i++
        $f = "k$i.reg"
        & reg.exe export "HKCU\$r" (Join-Path $backDir $f) /y | Out-Null
        $exports += $f
    }
}
$regAppsHad = Reg-HasValue 'Software\RegisteredApplications' 'LinkDesk'
$envHad = Reg-HasValue 'Environment' 'Path'
$desktopHad = Test-Path -LiteralPath $desktopLnk
$menuHad = Test-Path -LiteralPath $menuLnk
if ($desktopHad) { Copy-Item -LiteralPath $desktopLnk -Destination (Join-Path $backDir 'desktop.lnk') -Force }
if ($menuHad) { Copy-Item -LiteralPath $menuLnk -Destination (Join-Path $backDir 'menu.lnk') -Force }

$arpName0 = Reg-Get $ARP 'DisplayName'
# 🔴 卸载串才是**真正会变**的那个值：DisplayName 无论装到哪都是 `LinkDesk <ver>`，
#    只断言它 ⇒「ARP 指向临时目录」这种脏状态能一路绿过去（2026-10-02 实机发生过）。
$arpUninst0 = Reg-Get $ARP 'UninstallString'
$envVal = Reg-Get 'Environment' 'Path'
$envKindNum = Reg-Kind 'Environment' 'Path'      # 枚举数（还原时经 Reg-TypeName 转回 REG_*）
@{
    exports    = $exports
    arpName0   = $arpName0
    arpUninstall0 = $arpUninst0
    regAppsHad = $regAppsHad
    regAppsVal = Reg-Get 'Software\RegisteredApplications' 'LinkDesk'
    regAppsKind = if ($regAppsHad) { Reg-Kind 'Software\RegisteredApplications' 'LinkDesk' } else { 1 }
    envHad     = $envHad
    envVal     = $envVal
    envKind    = if ($envHad) { $envKindNum } else { 1 }
    desktopHad = $desktopHad
    menuHad    = $menuHad
} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
Write-Host "备份完成：$($exports.Count) 个键树导出 · 桌面 lnk=$desktopHad · 开始菜单 lnk=$menuHad · 状态 $stateFile"
$path0 = $envVal

# ── 装前反推表（静默安装的勾选值来源）─────────────────────────────────────────
# 口径 = installer.nsh `lkInitTaskDefaults`：读右键键的**默认值**，非空即「当初勾过」。
# 本机现状（2026-10-01 实测）：`Directory\` 与 `Directory\Background\` 两键在（指向 dev 的
# electron.exe），`*\shell\OpenWithLinkDesk` **不存在** ⇒ 反推 fileMenu=不勾、dirMenu=勾。
$menuDefBefore = @()
for ($i = 0; $i -lt $MENUS.Count; $i++) {
    $v = Reg-Get $MENUS[$i].k ''
    $menuDefBefore += (($null -ne $v) -and ($v -ne ''))
    Write-Host ("     装前 {0,-56} 默认值=`"{1}`" ⇒ 反推{2}" -f `
        $MENUS[$i].k, $v, $(if ($menuDefBefore[$i]) { '勾' } else { '不勾' }))
}
$path0 = $envVal

function Stop-SetupProcs {
    Get-Process -ErrorAction SilentlyContinue |
        Where-Object { try { $_.Path -eq $Setup } catch { $false } } |
        ForEach-Object {
            $proc = $_
            # [void] 是必要的：`WaitForExit()` 返回 bool，直接丢在管道里会打到控制台（无信息量的 `True`）
            # 🔴 杀不掉**绝对不能往外抛**：本函数在 finally 里第一个被调，一抛就顶掉它后面的
            #    `Restore-All` ⇒「测试红 + 机器没还原」。2026-10-02 实机就是这么留下脏 ARP 的：
            #    读数是 `Stop-SetupProcs` 抛「拒绝访问」→ 还原整段没跑 → ARP/PATH 停在临时目录。
            try { $proc.Kill(); [void]$proc.WaitForExit(5000) }
            catch { Write-Host "⚠️ 杀不掉 PID $($proc.Id)（$($_.Exception.Message)）——继续，还原照做" }
        }
}

# marker 里读版本（与 scripts/build-installer.mjs 的 64 字节契约同源）
$raw = [System.IO.File]::ReadAllBytes($Setup)
$magic = [System.Text.Encoding]::ASCII.GetBytes('LKDESK-PAYLOAD-1')
$ver = ''
for ($at = $raw.Length - 64; $at -ge 0; $at--) {
    if ($raw[$at] -ne $magic[0]) { continue }
    $hit = $true
    for ($k = 0; $k -lt 16; $k++) { if ($raw[$at + $k] -ne $magic[$k]) { $hit = $false; break } }
    if (-not $hit) { continue }
    if (($at + 64 + [BitConverter]::ToUInt64($raw, $at + 16)) -ne $raw.Length) { continue }
    $ver = [System.Text.Encoding]::ASCII.GetString($raw, $at + 32, 32).TrimEnd([char]0)
    break
}
Write-Host "待测安装包 $Setup （marker 版本 `"$ver`"）"

try {
    # 载荷里必须有 linkdeskctl 两个垫片——PATH 加的是 $INSTDIR，敲得到 linkdeskctl 全靠 extraFiles
    # 把这两份东西解到安装根（electron-builder.yml:79-102）。这条在**壳这一侧看不见**，只有真载荷能证。
    if ($SevenZip) {
        $list = & $SevenZip l -ba $Setup 2>$null | Out-String
        Say (([regex]::Matches($list, 'linkdeskctl\.cmd')).Count -ge 1) "载荷含 linkdeskctl.cmd（cmd 系壳垫片）"
        Say (([regex]::Matches($list, 'linkdeskctl\s*$', 'Multiline')).Count -ge 1) "载荷含无扩展名 linkdeskctl（POSIX 壳垫片）"
    } else {
        Write-Host "     （没找到 7zr.exe，跳过载荷垫片检查）"
    }

    # ══ 路 1：静默 · 幂等现状 ══════════════════════════════════════════════
    Write-Host "`n=== 路 1：静默安装（--silent --dir=临时）＋ 系统项断言 ==="
    $d1 = Join-Path $Work 'l1'
    $p1 = Start-Process -FilePath $Setup -ArgumentList @('--silent', "--dir=$d1") -PassThru -Wait
    Say ($p1.ExitCode -eq 0) "退出码 $($p1.ExitCode)（期望 0）"
    Say (Test-Path (Join-Path $d1 'LinkDesk.exe')) "LinkDesk.exe 落在 $d1"

    # ARP：逐值与实机现装逐字对齐（无 Publisher、Comments 空、DisplayIcon 带 ,0）
    Say ((Reg-Get $ARP 'DisplayName') -eq "LinkDesk $ver") "ARP DisplayName = `"$(Reg-Get $ARP 'DisplayName')`""
    Say ((Reg-Get $ARP 'DisplayVersion') -eq $ver) "DisplayVersion = $ver"
    Say ((Reg-Get $ARP 'UninstallString') -eq "`"$d1\linkdesk-setup.exe`" --uninstall") "UninstallString 指向安装根 ＋ --uninstall"
    Say ((Reg-Get $ARP 'QuietUninstallString') -eq "`"$d1\linkdesk-setup.exe`" --uninstall /S") "QuietUninstallString 带 /S"
    Say ((Reg-Get $ARP 'DisplayIcon') -eq "$d1\LinkDesk.exe,0") "DisplayIcon 带 ``,0`` 后缀"
    Say ((Reg-HasValue $ARP 'Comments') -and ((Reg-Get $ARP 'Comments') -eq '')) "Comments 存在且为空串"
    Say ((Reg-Get $ARP 'NoModify') -eq 1 -and (Reg-Get $ARP 'NoRepair') -eq 1) "NoModify/NoRepair = 1"
    Say (-not (Reg-HasValue $ARP 'Publisher')) "**没有** Publisher（实机那条键也没有 ⇒ 不发明）"
    $dirBytes = (Get-ChildItem -LiteralPath $d1 -Recurse -File -ErrorAction SilentlyContinue |
                 Measure-Object -Property Length -Sum).Sum
    $wantKb = [math]::Ceiling($dirBytes / 1024)
    $gotKb = Reg-Get $ARP 'EstimatedSize'
    Say ([math]::Abs($gotKb - $wantKb) -le 4) "EstimatedSize $gotKb ≈ 目录实测 $wantKb KB"

    # ProgId 三键
    $progId = 'Software\Classes\LinkDesk.Document'
    Say ((Reg-Get $progId '') -eq 'LinkDesk Document') "ProgId 默认值 = LinkDesk Document"
    Say ((Reg-Get "$progId\DefaultIcon" '') -eq "$d1\LinkDesk.exe") "ProgId DefaultIcon **不带** ,0（实机读数如此）"
    Say ((Reg-Get "$progId\shell\open\command" '') -eq "`"$d1\LinkDesk.exe`" `"%1`"") "ProgId open 命令带引号 ＋ %1"

    # 13 扩展名 ×2（OpenWithProgids 是**零长度**值；Capabilities 指回 ProgId）
    $missExt = @(); $missEmpty = @(); $missCaps = @()
    foreach ($e in $EXTS) {
        if (-not (Reg-HasValue "Software\Classes\$e\OpenWithProgids" 'LinkDesk.Document')) { $missExt += $e }
        elseif ((Reg-Get "Software\Classes\$e\OpenWithProgids" 'LinkDesk.Document') -ne '') { $missEmpty += $e }
        if ((Reg-Get 'Software\LinkDesk\Capabilities\FileAssociations' $e) -ne 'LinkDesk.Document') { $missCaps += $e }
    }
    Say ($missExt.Count -eq 0) "13 扩展名 OpenWithProgids 值齐（缺 $($missExt -join ',')）"
    Say ($missEmpty.Count -eq 0) "OpenWithProgids 值为**零长度**（非空 $($missEmpty -join ',')）"
    Say ($missCaps.Count -eq 0) "Capabilities\FileAssociations 13 条齐（缺 $($missCaps -join ',')）"
    Say ((Reg-Get 'Software\LinkDesk\Capabilities' 'ApplicationName') -eq 'LinkDesk') "Capabilities ApplicationName"
    Say ((Reg-Get 'Software\LinkDesk\Capabilities' 'ApplicationDescription') -eq 'LinkDesk 通用容器') "Capabilities ApplicationDescription"
    Say ((Reg-Get 'Software\RegisteredApplications' 'LinkDesk') -eq 'Software\LinkDesk\Capabilities') "RegisteredApplications → Capabilities"

    # 右键三键：**跟着装前反推表走**（见上）——装前非空的应被改写指向本次目录；
    # 装前没有的应**仍然没有**（＝「静默升级不复活用户取消过的项」）。写死「三键都该写」会在本机假红。
    for ($i = 0; $i -lt $MENUS.Count; $i++) {
        $m = $MENUS[$i]
        $gotT = Reg-Get $m.k ''; $gotI = Reg-Get $m.k 'Icon'; $gotC = Reg-Get "$($m.k)\command" ''
        if ($menuDefBefore[$i]) {
            $okAll = ($gotT -eq 'Open with LinkDesk') -and ($gotI -eq "`"$d1\LinkDesk.exe`"") -and
                     ($gotC -eq "`"$d1\LinkDesk.exe`" $($m.arg)")
            $want = '改写指向本次目录'
        } else {
            $okAll = ($null -eq $gotT) -and ($null -eq $gotI) -and ($null -eq $gotC)
            $want = '仍然没有'
        }
        # 失败时把**实际值**打出来——只说一句 FAIL，下次还得再跑一遍才知道差在哪
        Say $okAll ("{0}（反推{1} ⇒ 应{2}；实际 默认=`"{3}`" Icon=`"{4}`" command=`"{5}`"）" -f `
            $m.k, $(if ($menuDefBefore[$i]) { '勾' } else { '不勾' }), $want, $gotT, $gotI, $gotC)
    }

    # PATH：PathAdded 已在 ⇒ **必须一个字节都没动**（幂等）
    Say ((Reg-Get 'Environment' 'Path') -eq $path0) "PATH 未改动（PathAdded 已在 ⇒ 幂等跳过）"

    # 快捷方式：目标必须是**这次**装的目录（实机桌面被重定向到 D:\360MoveData\… ⇒ 只能走 KnownFolder）
    $ws = New-Object -ComObject WScript.Shell
    foreach ($lnk in @($desktopLnk, $menuLnk)) {
        if (Test-Path -LiteralPath $lnk) {
            $t = $ws.CreateShortcut($lnk).TargetPath
            Say ($t -eq (Join-Path $d1 'LinkDesk.exe')) "快捷方式 $([IO.Path]::GetFileName($lnk)) 指向 $t"
        } else { Say $false "快捷方式缺失：$lnk" }
    }

    # ══ 路 1b：静默 · 反推为勾 ⇒ `*\shell` 的写入侧 ═══════════════════════════
    Write-Host "`n=== 路 1b：预置三个右键键（模拟「当初勾过」）⇒ 静默装必须改写指向本次目录 ==="
    # 预置成「用户勾过、且指向**别的**目录」的样子 ⇒ 既能验反推为勾，也验**覆盖**（不是「有就跳过」）
    $oldExe = Join-Path $Work 'old\LinkDesk.exe'
    foreach ($m in $MENUS) {
        Reg-Set $m.k '' 'Open with LinkDesk'
        Reg-Set $m.k 'Icon' $oldExe
        Reg-Set "$($m.k)\command" '' "$oldExe $($m.arg)"
    }
    $d1b = Join-Path $Work 'l1b'
    $p1b = Start-Process -FilePath $Setup -ArgumentList @('--silent', "--dir=$d1b") -PassThru -Wait
    Say ($p1b.ExitCode -eq 0) "退出码 $($p1b.ExitCode)（期望 0）"
    foreach ($m in $MENUS) {
        $gotT = Reg-Get $m.k ''; $gotI = Reg-Get $m.k 'Icon'; $gotC = Reg-Get "$($m.k)\command" ''
        Say (($gotT -eq 'Open with LinkDesk') -and ($gotI -eq "`"$d1b\LinkDesk.exe`"") -and
             ($gotC -eq "`"$d1b\LinkDesk.exe`" $($m.arg)")) `
            "反推为勾 ⇒ $($m.k)（默认=`"$gotT`" Icon=`"$gotI`" command=`"$gotC`"）"
    }

    # ══ 路 2：界面态 · 勾选真值（含覆盖安装）═══════════════════════════════
    Write-Host "`n=== 路 2：界面态覆盖安装（页面真动作；两个右键框默认不勾）==="
    # 先把三键删掉（含路 1b 预置的）：页面不勾 ⇒ 装完**必须仍然没有**（这才证明勾选真的接线了，
    # 而不是「反正键都在、写没写看不出」）。删前的值已导出，还原照旧。
    foreach ($m in $MENUS) { Reg-DelTree $m.k }
    $uninstBefore = Reg-Get $ARP 'UninstallString'
    $log = Join-Path $Work 'l2.log'
    # ⚠️ `--preview` 的 query 是**同一个参数**（`--preview=<query>`），拆成两个参数时 query 会被丢掉，
    #    症状＝窗口起来了但页面永远停在主屏，日志里一条消息都没有（件 2a 的 install-test.ps1 路 A 同款写法）。
    $p2 = Start-Process -FilePath $Setup -PassThru `
        -ArgumentList @('--preview=autoinstall=1', "--log=$log")
    $deadline = (Get-Date).AddSeconds(150)
    $done = $false
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $log) {
            $txt = Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue
            if ($txt -match 'install-done') { $done = $true; break }
            if ($txt -match 'install-error') { break }
        }
        if ($p2.HasExited) { break }
        Start-Sleep -Milliseconds 200
    }
    Say $done "页面路径跑到 install-done（日志 $log）"
    # 覆盖安装认的目录来自 ARP（本路没给 --dir）⇒ UninstallString 必须**一字不变**
    # （不硬编码某个路径：路 1b 已经把它挪到 l1b 去了，写死 $d1 会假红）
    Say ((Reg-Get $ARP 'UninstallString') -eq $uninstBefore) "覆盖装认的目录来自 ARP（UninstallString 一字未变：$(Reg-Get $ARP 'UninstallString')）"
    foreach ($m in $MENUS) {
        $got = Reg-Get $m.k ''
        Say (($null -eq $got) -and (-not (Reg-Has "$($m.k)\command"))) "右键键**未写**（页面没勾）：$($m.k)"
    }
    # 编辑器注册走的是「本次装的目录」——本路没给 --dir ⇒ 目录来自 ARP，故从 DisplayIcon 反推
    # （`<目录>\LinkDesk.exe,0` 去掉 `,0`）而不是写死某个目录
    $exe2 = (Reg-Get $ARP 'DisplayIcon') -replace ',0$', ''
    Say ((Reg-Get "$progId\shell\open\command" '') -eq "`"$exe2`" `"%1`"") `
        "编辑器注册**照写**（页面默认勾；command=`"$(Reg-Get "$progId\shell\open\command" '')`"）"
    Stop-SetupProcs

    # ══ 路 4：界面态 · **全新目录**（四段进度真读数 ＋ 系统项随新目录改写）════════════
    # 路 2 是**覆盖**装（目录里文件已齐 ⇒ 解压段没有中间读数可报，日志只剩段边界，实测仅 5 条）。
    # 本路装到全新目录，才拿得到完整的解压段读数，从而断言 02 §三/01 §四 那条
    #「四段真实进度、只前进不倒退、收在 100」——覆盖装的那份日志证明不了这件事。
    Write-Host "`n=== 路 4：界面态装到全新目录（进度日志断言）==="
    $d4 = Join-Path $Work 'l4'
    $log4 = Join-Path $Work 'l4.log'
    $p4 = Start-Process -FilePath $Setup -PassThru `
        -ArgumentList @('--preview=autoinstall=1', "--dir=$d4", "--log=$log4")
    $deadline = (Get-Date).AddSeconds(240)
    $done4 = $false
    $t0 = Get-Date; $lastTxt = ''; $lastMove = Get-Date; $nextSay = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $log4) {
            $t4 = Get-Content -LiteralPath $log4 -Raw -ErrorAction SilentlyContinue
            if ($t4 -ne $lastTxt) { $lastTxt = $t4; $lastMove = Get-Date }
            if ($t4 -match 'install-done') { $done4 = $true; break }
            if ($t4 -match 'install-error') { break }
        }
        if ($p4.HasExited) { break }
        # 🔴 卡住时自动吐现场：2026-10-02 那次失败只留「末值 70」，无法判断卡在哪一段。
        #    这里给「日志静止了多少秒 ＋ 末条是什么 ＋ 进程还活不活 ＋ ARP 动没动」——
        #    解压完没解压完、离开解压段没有，一眼可判（见 06 该件实录）。
        if ((Get-Date) -gt $nextSay) {
            $lastMsg = ''
            if ($t4) { $lastMsg = (($t4 -split "`r?`n" | Where-Object { $_ }) | Select-Object -Last 1) }
            $stallSec = [int]((Get-Date) - $lastMove).TotalSeconds
            $arpNow = (Reg-Get $ARP 'UninstallString') -replace '^.*\\', ''
            Write-Host ("     等：{0}s（日志静止 {1}s）末条 {2}｜进程活 {3}｜ARP 尾 {4}" -f `
                [int]((Get-Date) - $t0).TotalSeconds, $stallSec, $lastMsg, (-not $p4.HasExited), $arpNow)
            $nextSay = (Get-Date).AddSeconds(20)
        }
        Start-Sleep -Milliseconds 200
    }
    Say $done4 "全新目录装到 install-done"
    $pcts = @()
    if (Test-Path $log4) {
        $pcts = [regex]::Matches((Get-Content -LiteralPath $log4 -Raw), '"type":"progress","pct":(\d+)') |
                ForEach-Object { [int]$_.Groups[1].Value }
    }
    Say ($pcts.Count -gt 0) "收到 $($pcts.Count) 条进度消息"
    $back = 0
    for ($k = 1; $k -lt $pcts.Count; $k++) { if ($pcts[$k] -lt $pcts[$k-1]) { $back++ } }
    Say ($back -eq 0) "进度只前进不倒退（倒退 $back 处）"
    Say ($pcts.Count -gt 0 -and $pcts[-1] -eq 100) "进度收在 100（末值 $(if ($pcts) { $pcts[-1] } else { '—' })）"
    $segs = @(0, 0, 0, 0)
    foreach ($v in $pcts) {
        if ($v -lt 70) { $segs[0]++ } elseif ($v -lt 80) { $segs[1]++ } elseif ($v -lt 92) { $segs[2]++ } else { $segs[3]++ }
    }
    Write-Host "     段分布（<70 解压 / 70-79 协议 / 80-91 系统项 / 92-100 校验）：$($segs -join ' / ')"
    Say ($segs[0] -gt 0) "解压段有真读数（$($segs[0]) 条）——证明进度不是摆设"
    Say (Test-Path (Join-Path $d4 'LinkDesk.exe')) "新目录落了 LinkDesk.exe"
    Say ((Reg-Get $ARP 'UninstallString') -like "*$d4*") "ARP 随新目录改写"
    Say (((New-Object -ComObject WScript.Shell).CreateShortcut($desktopLnk).TargetPath) -eq (Join-Path $d4 'LinkDesk.exe')) `
        "桌面快捷方式随新目录改写"
    Stop-SetupProcs

    # ══ 路 3：静默 · PATH 真追加 ═══════════════════════════════════════════
    Write-Host "`n=== 路 3：摘掉 PathAdded 后跑一次 ⇒ PATH 真追加 ＋ PathBackup ==="
    Reg-DelValue 'Software\LinkDesk' 'PathAdded'
    Reg-DelValue 'Software\LinkDesk' 'PathBackup'
    $d3 = Join-Path $Work 'l3'
    $p3 = Start-Process -FilePath $Setup -ArgumentList @('--silent', "--dir=$d3") -PassThru -Wait
    Say ($p3.ExitCode -eq 0) "退出码 $($p3.ExitCode)（期望 0）"
    $pathNow = Reg-Get 'Environment' 'Path'
    Say ($pathNow -eq "$path0;$d3") "PATH = 原值 ＋ `";$d3`"（追加而非覆盖）"
    Say ((Reg-Get 'Software\LinkDesk' 'PathBackup') -eq $envVal) "PathBackup = 追加前的原 PATH"
    Say ((Reg-Get 'Software\LinkDesk' 'PathAdded') -eq $d3) "PathAdded = $d3"
    Say ((Reg-Kind 'Environment' 'Path') -eq $envKindNum) "PATH 值类型保持（原 $([Microsoft.Win32.RegistryValueKind]$envKindNum)）"
    $p3b = Start-Process -FilePath $Setup -ArgumentList @('--silent', "--dir=$d3") -PassThru -Wait
    Say ((Reg-Get 'Environment' 'Path') -eq $pathNow) "再装一次 PATH 不重复追加（幂等，退出码 $($p3b.ExitCode)）"

    # ══ 路 3b：静默 · PATH 值类型**不降级**（REG_EXPAND_SZ 进、REG_EXPAND_SZ 出）══════════
    # 本机 PATH 是 REG_SZ（路 3 只证了「REG_SZ 进 REG_SZ 出」），而 AddToPath 里那条
    # 「原值什么类型就写回什么类型」的**分支根本没被走到**。真机上 PATH 常含 `%USERPROFILE%\…`
    # 这类未展开项，一旦被降级成 REG_SZ，那些项就**永远不再展开**——静默、且用户不会发现。
    # 所以这里**故意**把 PATH 改成 REG_EXPAND_SZ（值不变）再装一次，断言出来的类型仍是 EXPAND。
    # 现场由 Restore-All 连值带类型一起还原（上面那条类型断言就是为这一步加的）。
    Write-Host "`n=== 路 3b：把 PATH 改成 REG_EXPAND_SZ（值不变）⇒ 装完类型必须**仍是** REG_EXPAND_SZ ==="
    Reg-DelValue 'Software\LinkDesk' 'PathAdded'
    Reg-DelValue 'Software\LinkDesk' 'PathBackup'
    Reg-Set 'Environment' 'Path' $pathNow 2
    Say ((Reg-Kind 'Environment' 'Path') -eq 2) "预置成功：PATH 现为 REG_EXPAND_SZ"
    $d3b = Join-Path $Work 'l3b'
    $p3c = Start-Process -FilePath $Setup -ArgumentList @('--silent', "--dir=$d3b") -PassThru -Wait
    Say ($p3c.ExitCode -eq 0) "退出码 $($p3c.ExitCode)（期望 0）"
    $k3b = Reg-Kind 'Environment' 'Path'
    Say ($k3b -eq 2) "PATH 类型未被降级（现 $([Microsoft.Win32.RegistryValueKind]$k3b)，应 ExpandString）"
    Say ((Reg-Get 'Environment' 'Path') -eq "$pathNow;$d3b") "EXPAND 路径下同样只追加不覆盖"
    Say ((Reg-Get 'Software\LinkDesk' 'PathBackup') -eq $pathNow) "PathBackup 记的是追加前的原值"
}
finally {
    Stop-SetupProcs
    if ($SkipRestore) { Write-Host "`n-SkipRestore：**现场保留**，注册表未还原（备份在 $stateFile）" }
    else { Restore-All }
}

Write-Host "`n=== 汇总：$($bad) 条失败 ==="
if ($bad -gt 0) { exit 1 }
