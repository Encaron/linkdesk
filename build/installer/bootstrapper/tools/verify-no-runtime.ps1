# verify-no-runtime.ps1 — 验证 WebView2 运行时缺失兜底：模拟缺失 → 系统对话框 → 取消 → 退出码 3
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NR {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr h, uint msg, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  public struct R { public int L, T, Ri, B; }
}
"@
[NR]::SetProcessDPIAware() | Out-Null

$exe = (Join-Path $PSScriptRoot '..\out\bootstrapper.exe' | Resolve-Path).Path
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exe
$psi.UseShellExecute = $false
$psi.EnvironmentVariables['LK_FORCE_NO_RUNTIME'] = '1'
$p = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Seconds 2

$script:targetPid = $p.Id
$script:dlg = [IntPtr]::Zero
$cb = [NR+EnumProc]{
  param($h, $x)
  $procId = 0
  [NR]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
  if ($procId -eq $script:targetPid) {
    $t = New-Object System.Text.StringBuilder 300
    [NR]::GetWindowTextW($h, $t, 300) | Out-Null
    if ($t.ToString() -like '*WebView2*') { $script:dlg = $h; Write-Output ("dialog: [{0}]" -f $t.ToString()) }
  }
  return $true
}
[NR]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null

if ($script:dlg -ne [IntPtr]::Zero) {
  Add-Type -AssemblyName System.Drawing
  $r = New-Object NR+R; [NR]::GetWindowRect($script:dlg, [ref]$r) | Out-Null
  $w = $r.Ri - $r.L; $h2 = $r.B - $r.T
  $bmp = New-Object System.Drawing.Bitmap($w, $h2)
  $g = [System.Drawing.Graphics]::FromImage($bmp); $dc = $g.GetHdc()
  [NR]::PrintWindow($script:dlg, $dc, 0) | Out-Null
  $g.ReleaseHdc($dc)
  $shot = Join-Path $PSScriptRoot '..\out\shot-no-runtime.png'
  $bmp.Save($shot, [System.Drawing.Imaging.ImageFormat]::Png)
  "shot saved: $shot (${w}x${h2})"
  [NR]::PostMessageW($script:dlg, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null   # WM_CLOSE = 取消
  if ($p.WaitForExit(6000)) { "exit code = $($p.ExitCode)  (expect 3)" }
  else { "process did not exit"; $p.Kill() }
} else {
  "no dialog found; killing"; $p.Kill(); exit 1
}
