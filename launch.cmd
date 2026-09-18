@echo off
setlocal
cd /d "%~dp0"

rem Prefer the portable Node installation used by this workspace.
if exist "%~dp0.tools\node-v22.22.0-win-x64\node.exe" set "PATH=%~dp0.tools\node-v22.22.0-win-x64;%PATH%"
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)" >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.12 or newer is required. Install Node.js and try again.
  goto :failed
)

if not exist "node_modules\.bin\wrangler.cmd" (
  echo Installing project dependencies...
  call npm.cmd ci
  if errorlevel 1 goto :failed
)

echo Preparing the local website...
call npm.cmd run build
if errorlevel 1 goto :failed
call npm.cmd run setup
if errorlevel 1 goto :failed

echo Starting http://127.0.0.1:5173
echo Keep this window open. Press Ctrl+C to stop the website.
set "OPEN_BROWSER=1"
call npm.cmd run dev
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo The website could not start. Review the error above.
pause
exit /b 1
