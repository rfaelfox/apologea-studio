#!/bin/sh
# Baut den Windows-Installer unter Linux (braucht wine64 + wine32).
set -e
cd "$(dirname "$0")"
export WINEDEBUG=-all
# Windows-FFmpeg holen
if [ ! -f node_modules/ffmpeg-static/ffmpeg.exe ]; then
  (cd node_modules/ffmpeg-static && npm_config_platform=win32 npm_config_arch=x64 node install.js)
fi
rm -rf dist
npx electron-builder --win --x64 --dir --publish never
RCEDIT=$(ls ~/.cache/electron-builder/winCodeSign/*/rcedit-x64.exe | head -1)
wine "$RCEDIT" "dist/win-unpacked/Apologea Studio.exe" --set-version-string FileDescription "Apologea Studio" \
  --set-version-string ProductName "Apologea Studio" --set-version-string CompanyName Apologea \
  --set-file-version "$(node -p 'require("./package.json").version')" --set-icon assets/icon.ico
npx electron-builder --win --x64 --prepackaged dist/win-unpacked --publish never
