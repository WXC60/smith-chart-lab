@echo off
rem 启动史密斯圆图分析台：优先用 Edge 的“应用模式”打开本地页面
setlocal
set "APP=%~dp0index.html"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="file:///%APP:\=/%"
  exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="file:///%APP:\=/%"
  exit /b 0
)
start "" "%APP%"
