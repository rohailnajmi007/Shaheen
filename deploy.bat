@echo off
rem Build the web version and publish it to Vercel (see docs/DEPLOYMENT.md).
rem Publishes publicly: only when the owner asks.
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run build
if errorlevel 1 (
  echo Build failed. See the errors above.
  pause
  exit /b 1
)
rem dist\ is emptied by every build, so copy the saved Vercel project link in.
if not exist .vercel\project.json (
  echo No Vercel link. Run "vercel link --project shaheen" once in this folder. See docs/DEPLOYMENT.md
  pause
  exit /b 1
)
xcopy /e /i /y /q .vercel dist\.vercel >nul
rem Never upload Vercel's local token file.
if exist dist\.env.local del /q dist\.env.local
vercel deploy dist --prod --yes
pause
