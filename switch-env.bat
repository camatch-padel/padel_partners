@echo off
REM Script pour changer d'environnement facilement

if "%1"=="" goto help
if "%1"=="dev" goto dev
if "%1"=="development" goto dev
if "%1"=="prod" goto prod
if "%1"=="production" goto prod
goto help

:dev
echo Switching to DEVELOPMENT/STAGING environment...
copy /Y .env.development .env
echo ✅ Environment set to DEVELOPMENT
echo.
echo Starting Expo...
npm start
goto end

:prod
echo Switching to PRODUCTION environment...
copy /Y .env.production .env
echo ✅ Environment set to PRODUCTION
echo.
echo ⚠️  WARNING: You are now using PRODUCTION database!
echo.
echo Starting Expo...
npm start
goto end

:help
echo Usage: switch-env [dev^|prod]
echo.
echo Examples:
echo   switch-env dev   - Switch to development/staging
echo   switch-env prod  - Switch to production
echo.
goto end

:end
