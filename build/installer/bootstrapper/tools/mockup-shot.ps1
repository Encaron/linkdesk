# mockup-shot.ps1 — 把设计稿拍成设计尺寸 PNG，供与实机逐屏对照
#   默认 = E-混合提案.html（780×570）；卸载屏传 -Mock <E-卸载屏.html> -W 720 -H 540
#
# 为什么不直接截图：mockup 是「画布」版式（.stage 居中 + 供人看的 .cap/.note 注记 + 20px 桌面留白），
# 直接截要裁要算。这里生成一个临时 harness：mockup 原文一字不改，只在 <head> 后插一段定序随机数、
# 在 </body> 前插一段「去掉注记 + 把 .stage 钉到 0,0 尺寸 780×570 + 按 ?screen= 摆状态」的垫片。
# 于是产出的 PNG 与实机窗口同尺寸同构图，可直接并排。
param(
    [Parameter(Mandatory = $true)][string]$Screen,   # home|custom|progress|finish|error|uac（卸载屏：confirm|running|un-progress|un-finish）
    [string]$Mock = "",                              # mockup 路径（默认 E-混合提案.html；卸载屏传 E-卸载屏.html）
    [int]$W = 780,                                   # 画布逻辑宽（安装 780 / 卸载 720）
    [int]$H = 570,                                   # 画布逻辑高（安装 570 / 卸载 540）
    [int]$Pct = -1,                                  # >0 时把进度定格在该百分比（与实机 ?pct= 同口径）
    [string]$Out = "",
    [double]$Scale = 1.0,                            # 设备像素比：实机窗口在高 DPI 下是 780*Scale，模拟侧同倍渲染才可比
    [int]$VirtualTime = 4000                         # 虚拟时间：让入场/对勾/彩粒跑完再拍
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)   # -> bootstrapper/
$mock = if ($Mock) { $Mock } else { Join-Path $root '..\..\..\docs\04-软件更新\待抉择池\安装界面自绘\mockups\E-混合提案.html' }
$tag = if ($Mock) { 'un' } else { 'in' }
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $mock)) { throw "mockup not found: $mock" }
if (-not (Test-Path $edge)) { throw "Edge not found: $edge" }
if (-not $Out) { $Out = Join-Path $root "out\mockup-$Screen.png" }

# 定序随机数：与 app.js 的 ?seed=1 同算法同种子（两侧微尘/彩粒落点可比）
$rng = '<script>(function(){var s=0x9E3779B9;Math.random=function(){s=(s*1664525+1013904223)>>>0;return s/4294967296;};})();</script>'

$shim = @'
<script>
(function(){
  var cap=document.querySelector('.cap'), note=document.querySelector('.note');
  if(cap)cap.style.display='none'; if(note)note.style.display='none';   // 卸载稿的 go() 会写 cap/note，只能藏不能删
  var st=document.querySelector('.stage');
  st.style.cssText+=';position:fixed;left:0;top:0;width:__W__px;height:__H__px;max-width:none;max-height:none';
  document.body.style.padding='0';
  var q=new URLSearchParams(location.search);
  if(q.get('dust')==='0'){var d=document.querySelector('.dust'); if(d)d.remove();}
  var un=!!document.getElementById('s-confirm');   // 卸载稿自家 id 是 s-progress/s-finish（无重名）：把产品侧的 un- 前缀折回
  var sc=q.get('screen')||(un?'confirm':'home');
  if(un){ sc=sc.replace(/^un-/,''); } else if(sc==='custom'){ go('home'); toggleCustom(); }
  if(!un||document.getElementById('s-'+sc)) go(sc);
  if(un&&q.get('keep')==='0'){var k=document.getElementById('keepdata'); if(k){k.checked=false; badge();}}
  if(q.get('pct')!==null){
    var p=+q.get('pct'), s=un?(p<60?1:p<80?2:p<92?3:4):(p<70?1:p<80?2:p<92?3:4);
    var PH=un?['','STEP 1 / 4 · 正在移除程序文件','STEP 2 / 4 · 清理系统项','STEP 3 / 4 · 恢复 PATH','STEP 4 / 4 · 收尾校验']
             :['','STEP 1 / 4 · 正在解压文件','STEP 2 / 4 · 注册文件关联','STEP 3 / 4 · 写系统项','STEP 4 / 4 · 收尾校验'];
    document.getElementById('pn').textContent=Math.floor(p);
    document.getElementById('fill').style.width=p+'%';
    for(var i=1;i<=4;i++){var li=document.getElementById('p'+i); li.className=i<s?'done':i===s?'run':'';}
    document.getElementById('ph').textContent=PH[s];
  }
})();
</script>
'@

# ⚠️ 占位替换必须在拼进 html 之前：否则 width:__W__px 是非法值，整条声明被丢，
#    .stage 就退回 CSS 的 min(高, 100vh-120px)，mockup 侧比实机矮 120px（并排对照就假了）
$shim = $shim.Replace('__W__', "$W").Replace('__H__', "$H")
$html = [System.IO.File]::ReadAllText($mock, [System.Text.Encoding]::UTF8)
$html = $html -replace '<head>', ("<head>`r`n" + $rng)
$html = $html -replace '</body>', ($shim + "`r`n</body>")

$harness = Join-Path $env:TEMP "lk-mockup-$tag-$Screen.html"
[System.IO.File]::WriteAllText($harness, $html, (New-Object System.Text.UTF8Encoding($false)))

$q = "screen=$Screen&dust=0"
if ($Pct -ge 0) { $q += "&pct=$Pct" }
$url = "file:///" + ($harness -replace '\\', '/') + "?" + $q

if (Test-Path $Out) { Remove-Item $Out -Force }
$profileDir = Join-Path $env:TEMP "lk-edge-shot"
# Edge 往 stderr 写启动噪音（如 QQBrowser 导入器扫不到路径）；PS 5.1 在 Stop 偏好下会把原生 stderr 当异常抛。
# 这里临时降级偏好并吞掉 stderr，只看产出文件是否落地。
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $edge --headless=new --hide-scrollbars --force-device-scale-factor=$Scale `
        --no-first-run --no-default-browser-check --user-data-dir="$profileDir" `
        --virtual-time-budget=$VirtualTime --window-size=$W,$H --screenshot="$Out" $url 2>&1 | Out-Null
$ErrorActionPreference = $prev

if (-not (Test-Path $Out)) { throw "screenshot not produced (headless flags?)" }
# 尺寸自检：必须正好 W*Scale × H*Scale，否则并排对照无意义
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($Out)
$w = $img.Width; $h = $img.Height; $img.Dispose()
$ew = [int][Math]::Round($W * $Scale); $eh = [int][Math]::Round($H * $Scale)
if ($w -ne $ew -or $h -ne $eh) { throw "unexpected size ${w}x${h} (want ${ew}x${eh})" }
"mockup $Screen -> $Out (${w}x${h})"
