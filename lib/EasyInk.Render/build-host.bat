@echo off
setlocal EnableDelayedExpansion

set SCRIPT_DIR=%~dp0
set REPO_ROOT=%SCRIPT_DIR%..\..
set ARG1=%~1
set ARG2=%~2
set ARG3=%~3
set VERSION=
set PLATFORMS=win-x64,win-x86
set URL_BASE=
set OUT_DIR=lib/EasyInk.Render/releases

if defined ARG1 (
    echo %ARG1% | findstr /i /r "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul
    if not errorlevel 1 (
        set VERSION=%ARG1%
        if defined ARG2 set PLATFORMS=%ARG2%
        if defined ARG3 set URL_BASE=%ARG3%
    ) else (
        set PLATFORMS=%ARG1%
        if defined ARG2 set URL_BASE=%ARG2%
    )
)

where docker >nul 2>&1
if errorlevel 1 (
    echo Docker not found. Install Docker Desktop and make sure docker is on PATH.
    exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo pnpm not found. Install dependencies before building Render packages.
    exit /b 1
)

pushd "%REPO_ROOT%" >nul

if not exist "internal-packages\viewer-runtime\node_modules\@easyink\viewer" (
    echo Missing workspace dependency link for @easyink/viewer in internal-packages\viewer-runtime.
    echo Run "pnpm install" from the repository root to refresh workspace node_modules, then rerun this script.
    popd >nul
    exit /b 1
)

set RENDER_ARGS=build-host-matrix --platforms "%PLATFORMS%" --outDir "%OUT_DIR%" --docker true
if defined VERSION set RENDER_ARGS=!RENDER_ARGS! --version "%VERSION%"
if defined URL_BASE set RENDER_ARGS=!RENDER_ARGS! --urlBase "%URL_BASE%"

echo Building EasyInk.Render host packages with Docker...
echo Platforms: !PLATFORMS!
if defined VERSION echo Version: !VERSION!

pnpm render:runtime
if errorlevel 1 (
    echo Render viewer runtime build failed
    popd >nul
    exit /b 1
)

pnpm render:manifest
if errorlevel 1 (
    echo Render manifest validation failed
    popd >nul
    exit /b 1
)

pnpm exec node "lib/EasyInk.Render/tools/render-release.mjs" !RENDER_ARGS!
set BUILD_EXIT=%ERRORLEVEL%

popd >nul

if not "%BUILD_EXIT%"=="0" (
    echo Render host package build failed
    exit /b %BUILD_EXIT%
)

echo.
echo Done: %OUT_DIR%\host
exit /b 0
