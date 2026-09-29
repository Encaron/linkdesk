@echo off
rem M4 AI#40: linkdeskctl shim -- runs the CLI with the bundled Electron in node mode.
rem Zero deps: no separate node install needed.
rem The PATH entry added by installer.nsh is $INSTDIR, so this file must live in the install root.
rem ASCII-only comments on purpose -- cmd.exe reads this file in the OEM codepage and mis-parses
rem non-ASCII comment text. Measured 2026-09-29 on codepage 936: with non-ASCII comments plus LF
rem endings the set line below was skipped and this shim launched the full app instead of the CLI.
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0LinkDesk.exe" "%~dp0resources\linkdeskctl\linkdeskctl.mjs" %*
