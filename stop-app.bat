@echo off
REM ===========================================================================
REM  Minotaurus - stop the app (backend :4000 + frontend :3000)
REM  1) Kills the windows opened by run-app.bat (by title, whole child tree).
REM  2) Safety net: kills whatever still listens on the dev ports, in case the
REM     servers were started some other way (e.g. plain `npm run dev`).
REM ===========================================================================
setlocal enabledelayedexpansion

echo.
echo  Stopping Minotaurus...

REM 1) Kill the titled windows from run-app.bat (and their child node trees).
taskkill /FI "WINDOWTITLE eq Minotaurus Backend*"  /T /F >nul 2>&1 && echo    Stopped backend window.
taskkill /FI "WINDOWTITLE eq Minotaurus Frontend*" /T /F >nul 2>&1 && echo    Stopped frontend window.

REM 2) Safety net: kill whatever still listens on the dev ports.
for %%P in (4000 3000) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING" 2^>nul') do (
    taskkill /PID %%I /T /F >nul 2>&1 && echo    Killed PID %%I on port %%P.
  )
)

echo  Done.
endlocal
