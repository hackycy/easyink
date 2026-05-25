@echo off
setlocal EnableDelayedExpansion

set PROJECT_DIR=%~dp0src
set ISS_FILE=%~dp0installer.iss
set RENDER_ROOT=%~dp0..\..\EasyInk.Render
set VERSION=%~1
set DOTNET_VERSION_ARGS=
set ISCC_VERSION_ARG=

if defined VERSION (
    call :prepare_version_args "%VERSION%"
    if errorlevel 1 exit /b 1
)

echo [1/4] Preparing bundled SumatraPDF...
call :ensure_sumatra
if errorlevel 1 exit /b 1

echo [2/4] Building bundled Render CLI...
call :ensure_render
if errorlevel 1 exit /b 1

echo [3/4] Publishing...
dotnet publish "%PROJECT_DIR%\EasyInk.Printer.csproj" -c Release --nologo %DOTNET_VERSION_ARGS%
if errorlevel 1 (
    echo Publish failed
    exit /b 1
)

call :verify_sqlite_interop "%PROJECT_DIR%\bin\Release\net48\publish"
if errorlevel 1 exit /b 1

echo [4/4] Building installer...
set "ISCC="
where iscc >nul 2>&1 && set "ISCC=iscc"
if not defined ISCC if exist "E:\Program Files (x86)\Inno Setup 6\iscc.exe" set "ISCC=E:\Program Files (x86)\Inno Setup 6\iscc.exe"
if not defined ISCC if exist "C:\Program Files (x86)\Inno Setup 6\iscc.exe" set "ISCC=C:\Program Files (x86)\Inno Setup 6\iscc.exe"
if not defined ISCC if exist "C:\Program Files\Inno Setup 6\iscc.exe" set "ISCC=C:\Program Files\Inno Setup 6\iscc.exe"
if not defined ISCC (
    echo Inno Setup not found. Install Inno Setup 6 first.
    echo Download: https://jrsoftware.org/isinfo.php
    exit /b 1
)

"%ISCC%" %ISCC_VERSION_ARG% "%ISS_FILE%"
if errorlevel 1 (
    echo Build failed
    exit /b 1
)

echo.
echo Done: output\EasyInkPrinter-Setup.exe
exit /b 0

:ensure_sumatra
if exist "%PROJECT_DIR%\bin\SumatraPDF\SumatraPDF.exe" exit /b 0
powershell -ExecutionPolicy Bypass -File "%~dp0tools\download-sumatra.ps1"
if errorlevel 1 (
    echo Failed to prepare bundled SumatraPDF
    exit /b 1
)
exit /b 0

:ensure_render
if not exist "%RENDER_ROOT%\build-host.bat" (
    echo Missing Render build script: %RENDER_ROOT%\build-host.bat
    exit /b 1
)
call "%RENDER_ROOT%\build-host.bat" win-x64
if errorlevel 1 (
    echo Failed to build bundled Render CLI
    exit /b 1
)

for /f "usebackq delims=" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content '%RENDER_ROOT%\manifests\runtime-manifest.sample.json' -Raw | ConvertFrom-Json).host.version"`) do set RENDER_VERSION=%%V
if not defined RENDER_VERSION (
    echo Failed to resolve Render host version
    exit /b 1
)

set RENDER_RELEASE_DIR=%RENDER_ROOT%\releases\host\%RENDER_VERSION%\win-x64
set RENDER_ARCHIVE=%RENDER_RELEASE_DIR%\easyink-render-%RENDER_VERSION%-win-x64.zip
set RENDER_MANIFEST=%RENDER_RELEASE_DIR%\runtime-manifest.win-x64.json
if not exist "%RENDER_ARCHIVE%" (
    echo Missing Render archive: %RENDER_ARCHIVE%
    exit /b 1
)
if not exist "%RENDER_MANIFEST%" (
    echo Missing Render manifest: %RENDER_MANIFEST%
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$archive = '%RENDER_ARCHIVE%'; $manifest = '%RENDER_MANIFEST%'; $destHost = '%PROJECT_DIR%\bin\render\host'; $destRender = '%PROJECT_DIR%\bin\render'; New-Item -ItemType Directory -Force -Path $destHost,$destRender | Out-Null; $temp = Join-Path ([IO.Path]::GetTempPath()) ('easyink-render-' + [guid]::NewGuid()); New-Item -ItemType Directory -Force -Path $temp | Out-Null; try { Expand-Archive -Path $archive -DestinationPath $temp -Force; Copy-Item (Join-Path $temp 'easyink-render.exe') (Join-Path $destHost 'easyink-render.exe') -Force; Copy-Item $manifest (Join-Path $destRender 'runtime-manifest.json') -Force } finally { Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue }"
if errorlevel 1 (
    echo Failed to stage bundled Render CLI
    exit /b 1
)
exit /b 0

:verify_sqlite_interop
set PUBLISH_DIR=%~1
if not exist "%PUBLISH_DIR%\x64\SQLite.Interop.dll" (
    echo Missing SQLite native dependency: %PUBLISH_DIR%\x64\SQLite.Interop.dll
    exit /b 1
)
if not exist "%PUBLISH_DIR%\x86\SQLite.Interop.dll" (
    echo Missing SQLite native dependency: %PUBLISH_DIR%\x86\SQLite.Interop.dll
    exit /b 1
)
if not exist "%PUBLISH_DIR%\x64\pdfium.dll" (
    echo Missing pdfium native dependency: %PUBLISH_DIR%\x64\pdfium.dll
    exit /b 1
)
if not exist "%PUBLISH_DIR%\x86\pdfium.dll" (
    echo Missing pdfium native dependency: %PUBLISH_DIR%\x86\pdfium.dll
    exit /b 1
)
if not exist "%PUBLISH_DIR%\SumatraPDF\SumatraPDF.exe" (
    echo Missing bundled SumatraPDF: %PUBLISH_DIR%\SumatraPDF\SumatraPDF.exe
    echo Place SumatraPDF.exe under %PROJECT_DIR%\bin\SumatraPDF before packaging.
    exit /b 1
)
if not exist "%PUBLISH_DIR%\render\host\easyink-render.exe" (
    echo Missing bundled Render CLI: %PUBLISH_DIR%\render\host\easyink-render.exe
    exit /b 1
)
if not exist "%PUBLISH_DIR%\render\runtime-manifest.json" (
    echo Missing bundled Render manifest: %PUBLISH_DIR%\render\runtime-manifest.json
    exit /b 1
)
exit /b 0

:prepare_version_args
set INPUT_VERSION=%~1
for /f "tokens=1 delims=-+" %%A in ("%INPUT_VERSION%") do set BASE_VERSION=%%A
for /f "tokens=1-4 delims=." %%A in ("%BASE_VERSION%") do (
    set V1=%%A
    set V2=%%B
    set V3=%%C
    set V4=%%D
)

if not defined V1 goto :invalid_version
if not defined V2 goto :invalid_version
if not defined V3 goto :invalid_version
if not defined V4 set V4=0

set ASSEMBLY_VERSION=%V1%.%V2%.%V3%.%V4%
set DOTNET_VERSION_ARGS=/p:Version=%INPUT_VERSION% /p:AssemblyVersion=%ASSEMBLY_VERSION% /p:FileVersion=%ASSEMBLY_VERSION% /p:InformationalVersion=%INPUT_VERSION%
set ISCC_VERSION_ARG=/DAppVersion=%INPUT_VERSION%
echo Using version %INPUT_VERSION% ^(assembly/file %ASSEMBLY_VERSION%^)
exit /b 0

:invalid_version
echo Invalid version: %INPUT_VERSION%
echo Expected format: major.minor.patch or major.minor.patch.suffix
exit /b 1
