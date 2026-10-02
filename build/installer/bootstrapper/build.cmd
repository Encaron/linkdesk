@echo off
rem LinkDesk bootstrapper shell build (spec: 05-实现交接.md SS4.2, target <= 5MB single-file exe)
rem Keep this file ASCII-only: cmd.exe parses it in the OEM codepage.
setlocal
set VSWHERE="C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
for /f "usebackq delims=" %%i in (`%VSWHERE% -latest -property installationPath`) do set VS=%%i
if not defined VS (echo VS not found & exit /b 1)
rem vcvars prints a stray "file not found" line on this machine; rc/cl below are the real gate
call "%VS%\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1

cd /d "%~dp0"
if not exist out mkdir out

rem 7zr.exe is embedded as RCDATA (icon.rc id 2) -- fetch it once if the cache is empty.
if not exist "tools\.cache\7zr.exe" (
  echo fetching 7zr.exe ...
  powershell -NoProfile -ExecutionPolicy Bypass -File "tools\fetch-7z.ps1" || exit /b 1
)

rem WebView2 SDK (headers + static loader) is not committed (see .gitignore) -- fetch it once if
rem missing. There is no manual setup step in CI: the first tag run that compiles this shell died
rem at cl because .sdk had never been fetched (2026-10-02), so this must be self-sufficient here.
if not exist ".sdk\webview2\include" (
  echo fetching WebView2 SDK ...
  powershell -NoProfile -ExecutionPolicy Bypass -File "tools\fetch-sdk.ps1" || exit /b 1
)

rc /fo icon.res icon.rc
if errorlevel 1 (echo rc failed & exit /b 1)

rem app.html + app.css + app.js ship next to the exe (VirtualHostMapping root = exe dir)
rem NOTE: cmd's copy takes one source per call (multiple bare sources silently no-op)
copy /y app.html out\ >nul
copy /y app.css  out\ >nul
copy /y app.js   out\ >nul

rem i18n: source lives in build/installer/i18n (spec 01 SS5); runtime copy sits next to the exe
rem because the host enumerates <exedir>\i18n\*.json to build the language list
if not exist "..\i18n" (echo FAIL: ..\i18n missing & exit /b 1)
if not exist out\i18n mkdir out\i18n
for %%F in (..\i18n\*.json) do copy /y "%%F" out\i18n\ >nul
if not exist out\i18n\zh-CN.json (echo FAIL: out\i18n\zh-CN.json missing & exit /b 1)

rem Fat-face assets (3b): Newsreader latin subset. app.css references fonts\... relative to the page,
rem so dev mode (out\app.html) needs out\fonts\ too. OFL.txt is embedded only (no runtime reader).
rem Geist (latin + mono latin) was added per 台账 §五 B -- it had never actually loaded before.
if not exist "fonts" (echo FAIL: fonts missing & exit /b 1)
if not exist out\fonts mkdir out\fonts
for %%F in (fonts\*.woff2) do copy /y "%%F" out\fonts\ >nul
if not exist out\fonts\newsreader-latin-400.woff2 (echo FAIL: latin subset missing & exit /b 1)
if not exist out\fonts\newsreader-latin-400-italic.woff2 (echo FAIL: latin italic subset missing & exit /b 1)
if not exist out\fonts\geist-latin-400.woff2 (echo FAIL: geist latin missing & exit /b 1)
if not exist out\fonts\geist-mono-latin-400.woff2 (echo FAIL: geist mono latin missing & exit /b 1)

rem Single-file product form: the page MUST travel inside the exe (there is no app.html next to a
rem concatenated setup.exe). Generate the embedded-UI manifest + resource script, then compile it.
rem Dev keeps using out\app.* -- see ResolveUiRoot() in main.cpp.
node tools\gen-ui-rc.mjs || exit /b 1
rc /fo ui.res out\ui.gen.rc
if errorlevel 1 (echo rc ui failed & exit /b 1)

cl /nologo /W3 /O2 /MT /EHsc /std:c++17 /utf-8 /DUNICODE /D_UNICODE ^
   /I ".sdk\webview2\include" ^
   main.cpp syswrite.cpp procguard.cpp icon.res ui.res ^
   /Fo"out\\" /Fe"out\bootstrapper.exe" ^
   /link ".sdk\webview2\x64\WebView2LoaderStatic.lib" shlwapi.lib
if errorlevel 1 exit /b 1

rem size budget gate: single-file exe must stay under 5MB
for %%F in (out\bootstrapper.exe) do set SZ=%%~zF
echo bootstrapper.exe %SZ% bytes
powershell -NoProfile -Command "if (%SZ% -gt 5MB) { exit 1 }"
if errorlevel 1 (echo FAIL: over 5MB budget & exit /b 1) else echo OK: within budget
exit /b 0
