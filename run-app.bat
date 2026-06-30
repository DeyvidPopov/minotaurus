@echo off
REM ===========================================================================
REM  Minotaurus - run the whole app (backend + frontend)
REM  Place this file in the repo root (d:\dev\minotaurus) and double-click it,
REM  or run it from a terminal. It opens two windows:
REM    - Backend   : tsx watch  -> http://localhost:4000
REM    - Frontend  : next dev (webpack, not Turbopack) -> http://localhost:3000
REM  Webpack is used on purpose: Turbopack stalls on Windows (Defender locks
REM  the manifest). Close either window (or Ctrl+C in it) to stop that server.
REM ===========================================================================

setlocal
set "ROOT=%~dp0"

echo.
echo  Starting Minotaurus...
echo    Backend  : http://localhost:4000
echo    Frontend : http://localhost:3000
echo    Login    : deyvid@minotaurus.dev / minotaurus
echo.

REM Launch each dev server in its own titled window (/D sets its working dir).
start "Minotaurus Backend"  /D "%ROOT%backend"          cmd /k "npm run dev"
start "Minotaurus Frontend" /D "%ROOT%frontend\nextjs"  cmd /k "npm run dev:webpack"

REM Give the frontend a moment to boot, then open the browser.
REM (First compile can take longer than this; just refresh if the page is blank.)
timeout /t 12 /nobreak >nul
start "" http://localhost:3000

echo.
echo  Two server windows opened. This launcher window can be closed.
endlocal
