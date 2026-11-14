@echo off
setlocal
cd /d "%~dp0"
set "PY_LAUNCH="
where py >nul 2>&1
if not errorlevel 1 (
  py -3.12 -c "import sys" >nul 2>&1
  if not errorlevel 1 set "PY_LAUNCH=py -3.12"
  if not defined PY_LAUNCH (
    py -3 -c "import sys" >nul 2>&1
    if not errorlevel 1 set "PY_LAUNCH=py -3"
  )
)
if not defined PY_LAUNCH (
  where python >nul 2>&1
  if errorlevel 1 goto :no_python
  set "PY_LAUNCH=python"
)
%PY_LAUNCH% -c "import tzdata" >nul 2>&1
if errorlevel 1 (
  echo Gerekli saat dilimi paketi kuruluyor...
  %PY_LAUNCH% -m pip install -r requirements.txt || goto :error
)
%PY_LAUNCH% RUN_WEB.py
if errorlevel 1 goto :error
exit /b 0
:no_python
echo HATA: Python 3.12+ gerekli.
goto :error
:error
echo.
echo Kurulum veya baslatma basarisiz. Python 3.12+ ve Java 17+ gereklidir.
pause
exit /b 1
