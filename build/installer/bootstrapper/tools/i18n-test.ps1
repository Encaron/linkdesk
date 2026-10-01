# i18n-test.ps1 — 件 1c 验收：词条装载器（清单 / 回落链 / 即时切换 / 标记口径）＋ 宿主侧（扫目录、带出上次语言）
#
# 为什么不走 --dump-dom：app.html 的词条是异步 fetch，dump 在「导航完成 / 虚拟时间耗尽」上的触发时机
# 不确定（实测拍到过 90 字节的空文档）。这里换一条确定性通道——探针页在 iframe 里等词条到位，把断言
# 结果串成 JSON，用 1px 图片请求打到本地 http 服务器，再从 http.server 的访问日志原样取回：
# 全程不依赖截图、不依赖 OCR、不依赖时序运气。
#
# 两类证据：
#   A. 机械层（本脚本断言）——C1..C5 走页面真实加载路径（同 app.html / 同词条目录 / 同 ?langs=?lang= 口径）
#   B. 宿主层（截图，肉眼复核）——C6 用 exe 实跑：注册表上次语言是否带出、宿主是否真在扫 i18n/ 目录
param([int]$Port = 8731, [int]$TimeoutSec = 40)
$ErrorActionPreference = 'Stop'

$root   = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)   # -> bootstrapper/
$outDir = Join-Path $root 'out'
$edge   = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$exe    = Join-Path $outDir 'bootstrapper.exe'
$regKey = 'HKCU\Software\LinkDesk\Installer'
if (-not (Test-Path $edge)) { throw "Edge not found: $edge" }
if (-not (Test-Path $exe))  { throw "exe not found: $exe (run build.cmd first)" }

# ── 准入：out/ 必须是新构建（exe 只从自己所在目录读页面与词条，改了源码不重建＝验的是旧货）──
$stale = @()
foreach ($f in 'app.html', 'app.css', 'app.js') {
    $dst = Join-Path $outDir $f
    if (-not (Test-Path $dst)) { $stale += "$f(缺)" }
    elseif ((Get-Item (Join-Path $root $f)).LastWriteTime -gt (Get-Item $dst).LastWriteTime) { $stale += $f }
}
foreach ($f in 'zh-CN.json', 'en.json') {
    if (-not (Test-Path (Join-Path $outDir "i18n\$f"))) { $stale += "i18n/$f(缺)" }
}
if ($stale.Count) { throw ("out\ 里的 {0} 比源码旧——先跑 build.cmd 再验" -f ($stale -join ', ')) }

$script:fails = @()
$script:pass  = 0
function Check([string]$name, $got, $want) {
    $g = if ($null -eq $got) { '<null>' } else { [string]$got }
    $w = if ($null -eq $want) { '<null>' } else { [string]$want }
    if ($g -ceq $w) { $script:pass++; "  PASS  $name = $g" }
    else { $script:fails += "$name`: got [$g] want [$w]"; "  FAIL  $name = [$g] (want [$w])" }
}
function CheckMatch([string]$name, [string]$got, [string]$pat) {
    if ($got -match $pat) { $script:pass++; "  PASS  $name ~ /$pat/" }
    else { $script:fails += "$name`: [$got] !~ /$pat/"; "  FAIL  $name = [$got] (!~ /$pat/)" }
}

# ── 舞台：out/_stage*/ ＝ app 三件套 + 该用例的词条变体；探针页放服务器根 ──────────────
$probe = Join-Path $outDir '_probe.html'
$stages = @('_stage', '_stage3', '_stage4', '_stage5')
function New-Stage([string]$name) {
    $dir = Join-Path $outDir $name
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
    New-Item -ItemType Directory -Path (Join-Path $dir 'i18n') -Force | Out-Null
    foreach ($f in 'app.html', 'app.css', 'app.js') { Copy-Item (Join-Path $outDir $f) $dir }
    $dir
}
function Norm-Stage([string]$dir) {   # 主舞台与 C3 共用：zh-CN + en 原样
    Copy-Item (Join-Path $outDir 'i18n\zh-CN.json') (Join-Path $dir 'i18n') -Force
    Copy-Item (Join-Path $outDir 'i18n\en.json')    (Join-Path $dir 'i18n') -Force
}

New-Stage '_stage'  | ForEach-Object { Norm-Stage $_ }
New-Stage '_stage3' | ForEach-Object { Norm-Stage $_ }
New-Stage '_stage4' | ForEach-Object { Norm-Stage $_ }
New-Stage '_stage5' | Out-Null                       # app 三件套照拷，但词条目录整个拿掉
Remove-Item (Join-Path $outDir '_stage5\i18n') -Recurse -Force

# C3：加语言 = 加文件（零代码）。ja 只翻三条键，其余键考回落链；_ 前缀文件不进词条面。
$ja = @'
{
  "_meta": { "code": "ja", "label": "日本語" },
  "installer.chrome.close": "ウィンドウを閉じる",
  "installer.brand.slogan": "すべての働き方を、ひとつの器に。",
  "installer.home.install": "今すぐインストール<span class=\"cir\">→</span>"
}
'@
[System.IO.File]::WriteAllText((Join-Path $outDir '_stage3\i18n\ja.json'), $ja, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $outDir '_stage3\i18n\_template.json'), '{"_meta":{"label":"TEMPLATE"}}', (New-Object System.Text.UTF8Encoding($false)))

# C4：en 少一个键 → 该键必须回落到 zh-CN，其余仍是英文
$enTxt = [System.IO.File]::ReadAllText((Join-Path $outDir 'i18n\en.json'), [System.Text.Encoding]::UTF8)
$enCut = $enTxt -replace '(?m)^\s*"installer\.home\.install".*\r?\n', ''
if ($enCut -eq $enTxt) { throw 'C4 造样例失败：en.json 里没找到 installer.home.install' }
[System.IO.File]::WriteAllText((Join-Path $outDir '_stage4\i18n\en.json'), $enCut, (New-Object System.Text.UTF8Encoding($false)))

# 探针页：等词条到位 → 采一屏断言 → 有 switch 参数就切一次语言再采一遍 → 图片请求回报
$probeHtml = @'
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>probe</title></head><body>
<iframe id="f" width="780" height="570" style="border:0"></iframe>
<script>
var p = new URLSearchParams(location.search);
function txt(d, sel) { var e = d.querySelector(sel); return e ? e.textContent : null; }
function attr(d, sel, a) { var e = d.querySelector(sel); return e ? e.getAttribute(a) : 'NO_NODE'; }
/* 诊断（用例挂了要能看见页面到底加载成什么样：URL / DOM 规模 / id 花名册 / 宿主桥） */
function diag(d, w, f) {
  var o = {};
  try { o.href = w.location.href; } catch (e) { o.href = 'ERR'; }
  try { o.src = f.getAttribute('src'); } catch (e) { o.src = 'ERR'; }
  try { o.title = d.title; o.htmlLen = d.documentElement.outerHTML.length; } catch (e) { o.title = 'ERR'; }
  try { o.ids = Array.prototype.map.call(d.querySelectorAll('[id]'), function (n) { return n.id; }).join('|').slice(0, 160); } catch (e) { o.ids = 'ERR'; }
  try { o.lk = typeof w.__lk; } catch (e) { o.lk = 'ERR'; }
  return o;
}
function snap(d, w) {
  return {
    ok: true,
    state: w.__lk.i18n(),
    attrLang: d.documentElement.lang,
    attrData: d.documentElement.dataset.lang,
    welcome: txt(d, '#s-home .brand .sl'),
    title: txt(d, '#s-home h1'),
    install: txt(d, '#s-home .actions .btn'),
    foot: d.querySelector('#s-home .foot') ? d.querySelector('#s-home .foot').innerHTML : null,
    xbtn: attr(d, '#xbtn', 'aria-label'),
    opt0: txt(d, '#s-home .opts .opt'),
    head: txt(d, '#ph'),
    finish: txt(d, '#s-finish h1'),
    err: txt(d, '#s-error h1'),
    ddCur: txt(d, '#lkdd-cur'),
    ddItems: Array.prototype.map.call(d.querySelectorAll('#lkdd-pop .it'), function (i) { return i.dataset.code; }),
    custom: txt(d, '#custtoggle')
  };
}
var f = document.getElementById('f');
f.addEventListener('load', function () {
  setTimeout(function () {
    var d = null, w = null, res;
    try {
      d = f.contentDocument; w = f.contentWindow;
      res = snap(d, w);
      if (p.get('switch')) {
        w.__lk.setLang(p.get('switch'));
        res.afterSwitch = snap(d, w);
        d.querySelector('#custtoggle').click();
        res.afterCustom = txt(d, '#custtoggle');
      }
    } catch (e) { res = { ok: false, err: String(e) }; }
    try { res.diag = diag(d, w, f); } catch (e2) { res.diag = 'ERR'; }
    new Image().src = '/__probe?case=' + encodeURIComponent(p.get('case') || '?') +
                      '&d=' + encodeURIComponent(JSON.stringify(res));
  }, 500);
});
f.src = p.get('app') || 'app.html';
</script></body></html>
'@
[System.IO.File]::WriteAllText($probe, $probeHtml, (New-Object System.Text.UTF8Encoding($false)))

# ── 本地服务器（探针与 app 同源；词条 fetch 与 exe 里一样走 http）───────────────────
$log = Join-Path $env:TEMP 'lk-i18n-server.log'
$outLog = Join-Path $env:TEMP 'lk-i18n-server.out'
if (Test-Path $log) { Remove-Item $log -Force }
$srv = Start-Process -FilePath 'python' -PassThru -WindowStyle Hidden `
    -ArgumentList @('-m', 'http.server', "$Port", '--bind', '127.0.0.1', '--directory', $outDir) `
    -RedirectStandardError $log -RedirectStandardOutput $outLog
Start-Sleep -Milliseconds 1200

$prevEA = $ErrorActionPreference
$ErrorActionPreference = 'Continue'   # Edge 往 stderr 写启动噪音，别当异常抛
function Run-Case([string]$case, [string]$appQuery, [string]$switchTo = '') {
    $prof = Join-Path $env:TEMP "lk-i18n-$case"
    if (Test-Path $prof) { Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue }
    $url = "http://127.0.0.1:$Port/_probe.html?case=$case&app=" + [System.Uri]::EscapeDataString($appQuery)
    if ($switchTo) { $url += "&switch=$switchTo" }
    $pr = Start-Process -FilePath $edge -PassThru -WindowStyle Hidden -ArgumentList @(
        '--headless=new', '--no-first-run', '--no-default-browser-check',
        "--user-data-dir=$prof", '--virtual-time-budget=8000', '--window-size=780,570', $url)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $line = $null
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 400
        if (Test-Path $log) {
            $hit = Select-String -Path $log -Pattern ('/__probe\?case=' + [regex]::Escape($case) + '&d=(\S+)') -ErrorAction SilentlyContinue
            if ($hit) { $line = $hit[-1].Matches[0].Groups[1].Value; break }
        }
    }
    if (-not $pr.HasExited) { $pr.Kill() }
    if (-not $line) { throw "C$case`: 探针无回报（${TimeoutSec}s 超时）——见 $log" }
    $obj = ([System.Uri]::UnescapeDataString($line) | ConvertFrom-Json)
    if ($obj.ok -ne $true) {
        "  DIAG  $case :: " + ($obj.diag | ConvertTo-Json -Compress -Depth 4)
        "        err  :: " + $obj.err
    }
    $obj
}

try {
    "── A. 装载器（探针页实测 DOM）──────────────────────────────"
    $r = Run-Case 'C1' '_stage/app.html?langs=zh-CN,en&dust=0' 'en'
    Check 'C1 状态'        $r.state.state 'ready'
    Check 'C1 清单'        ($r.state.langs -join ',') 'zh-CN,en'
    Check 'C1 语言(默认)'  $r.state.lang 'zh-CN'
    Check 'C1 标记语言'    $r.attrLang 'zh-CN'
    Check 'C1 主标题'      $r.title '安装就一步，然后交给它。'
    Check 'C1 主按钮'      $r.install '立即安装→'
    Check 'C1 段头(状态相关)' $r.head 'STEP 1 / 4 · 正在解压文件'
    Check 'C1 关闭按钮 aria' $r.xbtn '关闭窗口'
    Check 'C1 下拉当前项'  $r.ddCur '中文'
    Check 'C1 下拉项'      ($r.ddItems -join ',') 'zh-CN,en'
    CheckMatch 'C1 页脚保留动作挂点' $r.foot 'data-action="license"'
    # 即时切换（与下拉点击同一条路径：静态词条 + 状态相关文案 + 展开区按钮 一起翻）
    Check 'C1 切换后语言'  $r.afterSwitch.state.lang 'en'
    Check 'C1 切换后标记'  $r.afterSwitch.attrData 'en'
    Check 'C1 切换后主按钮' $r.afterSwitch.install 'Install Now→'
    Check 'C1 切换后段头'  $r.afterSwitch.head 'STEP 1 / 4 · Extracting files'
    Check 'C1 切换后下拉'  $r.afterSwitch.ddCur 'English'
    Check 'C1 切换后展开区' $r.afterCustom 'Collapse'

    $r = Run-Case 'C2' '_stage/app.html?langs=zh-CN,en&lang=en&dust=0'
    Check 'C2 首帧语言'    $r.state.lang 'en'
    Check 'C2 首帧主按钮'  $r.install 'Install Now→'
    Check 'C2 首帧段头'    $r.head 'STEP 1 / 4 · Extracting files'
    Check 'C2 首帧完成屏'  $r.finish 'All set.'
    # 双引号是必须的：PS 词法把 U+2019（’）也当单引号定界符，写在单引号串里会把整份脚本撕成乱码
    Check 'C2 首帧错误屏'  $r.err "Installation didn’t finish."
    Check 'C2 首帧选项'    $r.opt0 'Add “Open with LinkDesk” to the file context menu'
    Check 'C2 页脚英文'    ($r.foot -match 'License') 'True'

    $r = Run-Case 'C3' '_stage3/app.html?langs=zh-CN,en,ja&dust=0' 'ja'
    Check 'C3 清单(加文件即加语言)' ($r.state.langs -join ',') 'zh-CN,en,ja'
    Check 'C3 下拉三项'    ($r.ddItems -join ',') 'zh-CN,en,ja'
    Check 'C3 切到 ja 主按钮' $r.afterSwitch.install '今すぐインストール→'
    Check 'C3 切到 ja 关闭按钮' $r.afterSwitch.xbtn 'ウィンドウを閉じる'
    Check 'C3 ja 缺键回落 zh-CN' $r.afterSwitch.title '安装就一步，然后交给它。'
    Check 'C3 切换后状态'  $r.afterSwitch.state.lang 'ja'

    $r = Run-Case 'C4' '_stage4/app.html?langs=zh-CN,en&lang=en&dust=0'
    Check 'C4 缺键回落主按钮' $r.install '立即安装→'
    Check 'C4 其余仍英文'  $r.finish 'All set.'
    Check 'C4 缺键不影响清单' ($r.state.langs -join ',') 'zh-CN,en'

    $r = Run-Case 'C5' '_stage5/app.html?langs=zh-CN,en&dust=0'
    Check 'C5 词条缺失=非 ready' $r.state.state 'failed'
    Check 'C5 标记原文兜底' $r.install '立即安装→'
    Check 'C5 段头仍中文'  $r.head 'STEP 1 / 4 · 正在解压文件'

    "── B. 宿主层（exe 实跑截图，看图复核）──────────────────────"
    $hadKey = $false
    $prevLang = ''
    $q = & reg query $regKey /v Language 2>$null
    if ($LASTEXITCODE -eq 0) { $hadKey = $true; $prevLang = ($q | Select-String 'Language' | ForEach-Object { $_.Line -split '\s{2,}' })[-1] }
    function Shot([string]$lang, [string]$png) {
        & reg add $regKey /v Language /t REG_SZ /d $lang /f | Out-Null
        $target = Join-Path $outDir $png
        if (Test-Path $target) { Remove-Item $target -Force }
        & $exe "--capture=$target" | Out-Null
        if (-not (Test-Path $target)) { $script:fails += "$png 未产出"; "  FAIL  $png 未产出"; return }
        $kb = [int]((Get-Item $target).Length / 1024)
        if ($kb -lt 20) { $script:fails += "$png 只有 ${kb}KB（疑似空帧）"; "  FAIL  $png 只有 ${kb}KB" }
        else { $script:pass++; "  PASS  $png 落图 ${kb}KB（宿主扫目录 + 带出注册表语言：看图复核）" }
    }
    Shot 'en' 'i18n-en.png'
    Shot 'zz' 'i18n-zz.png'          # 非法值 = 清单认不得 → 必须回落 zh-CN
    Copy-Item (Join-Path $outDir '_stage3\i18n\ja.json') (Join-Path $outDir 'i18n\ja.json') -Force
    Shot 'ja' 'i18n-ja.png'          # 目录多一个文件就当多一门语言（宿主扫目录，页面零改动）
    Remove-Item (Join-Path $outDir 'i18n\ja.json') -Force
    # 注册表复原：本机原本没这个键就删干净，原本有就写回原值
    if ($hadKey) { & reg add $regKey /v Language /t REG_SZ /d $prevLang /f | Out-Null }
    else { & reg delete $regKey /f 2>$null | Out-Null }
    "  (注册表复原：hadKey=$hadKey prev='$prevLang')"
}
finally {
    $ErrorActionPreference = $prevEA
    if ($srv -and -not $srv.HasExited) { $srv.Kill() }
    foreach ($s in $stages) { $d = Join-Path $outDir $s; if (Test-Path $d) { Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue } }
    if (Test-Path $probe) { Remove-Item $probe -Force }
    foreach ($c in 'C1', 'C2', 'C3', 'C4', 'C5') {
        $p = Join-Path $env:TEMP "lk-i18n-$c"
        if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

""
"PASS $script:pass · FAIL $($script:fails.Count)"
if ($script:fails.Count) { $script:fails | ForEach-Object { "  - $_" }; exit 1 }
exit 0
