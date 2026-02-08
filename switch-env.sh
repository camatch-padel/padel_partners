#!/bin/bash
# Script pour changer d'environnement facilement

if [ -z "$1" ]; then
  echo "Usage: ./switch-env.sh [dev|prod]"
  echo ""
  echo "Examples:"
  echo "  ./switch-env.sh dev   - Switch to development/staging"
  echo "  ./switch-env.sh prod  - Switch to production"
  exit 1
fi

if [ "$1" == "dev" ] || [ "$1" == "development" ]; then
  echo "Switching to DEVELOPMENT/STAGING environment..."
  cp .env.development .env
  echo "✅ Environment set to DEVELOPMENT"
  echo ""
  echo "Starting Expo..."
  npm start
elif [ "$1" == "prod" ] || [ "$1" == "production" ]; then
  echo "Switching to PRODUCTION environment..."
  cp .env.production .env
  echo "✅ Environment set to PRODUCTION"
  echo ""
  echo "⚠️  WARNING: You are now using PRODUCTION database!"
  echo ""
  echo "Starting Expo..."
  npm start
else
  echo "Invalid option: $1"
  echo "Use: ./switch-env.sh [dev|prod]"
  exit 1
fi
