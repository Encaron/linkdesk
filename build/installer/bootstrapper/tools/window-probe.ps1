# window-probe.ps1 — 验收辅助：列出 WebView2 / 引导器 顶层窗口（尺寸＋类名＋标题）
# 抓图请用 capture.ps1（PrintWindow 对 WebView2 内容无效，见该脚本注释）
param([string]$TitleLike = "")
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WP {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  public struct R { public int L, T, Ri, B; }
}
"@
[WP]::SetProcessDPIAware() | Out-Null
$rows = @()
$cb = [WP+EnumProc]{
  param($h, $p)
  $procId = 0
  [WP]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
  $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
  if ($name -eq 'msedgewebview2' -or $name -eq 'bootstrapper') {
    $t = New-Object System.Text.StringBuilder 300; [WP]::GetWindowTextW($h, $t, 300) | Out-Null
    if ($t.Length -gt 0) {
      $c = New-Object System.Text.StringBuilder 300; [WP]::GetClassNameW($h, $c, 300) | Out-Null
      $r = New-Object WP+R; [WP]::GetWindowRect($h, [ref]$r) | Out-Null
      $script:rows += ('[{0}] cls={1} {2}x{3} title="{4}"' -f $name, $c.ToString(), ($r.Ri - $r.L), ($r.B - $r.T), $t.ToString())
    }
  }
  return $true
}
[WP]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
$rows | Select-Object -First 20
