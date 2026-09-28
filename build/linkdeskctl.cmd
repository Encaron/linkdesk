@echo off
rem M4 AI#40：linkdeskctl 命令垫片——用随包 Electron 以 node 模式跑 CLI 脚本（零依赖，免装 node）。
rem PATH 项（installer.nsh「添加到 PATH」默认勾）加的是 $INSTDIR ⇒ 本垫片必须住在安装根。
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0LinkDesk.exe" "%~dp0resources\linkdeskctl\linkdeskctl.mjs" %*
