@echo off
if exist "%~dp0python\python.exe" goto abrir
echo.
echo Python is not installed yet: run "Install (Instalar).bat" first.
echo Falta Python: ejecuta antes "Install (Instalar).bat".
echo.
pause
exit /b 1
:abrir
start "Witcher 3 Second Screen" /min "%~dp0python\python.exe" "%~dp0app\servidor.py"
