@echo off
title HAVEX - локальный сервер
cd /d "%~dp0"
echo.
echo   ============================================
echo    HAVEX - запуск сайта для предпросмотра
echo   ============================================
echo.
echo   Сайт откроется в браузере автоматически.
echo   Чтобы остановить сервер - закройте это окно
echo   или нажмите Ctrl+C.
echo.
start "" http://localhost:3000
node server.js
pause
