#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ -x /usr/local/bin/python3 ]; then PYTHON=/usr/local/bin/python3
elif [ -x /opt/homebrew/bin/python3 ]; then PYTHON=/opt/homebrew/bin/python3
else PYTHON=$(command -v python3 || true)
fi
if [ -z "$PYTHON" ]; then
  echo 'Install Python 3.13 universal2 from python.org, then run this launcher again.'
  read -r -p 'Press Return to close.'
  exit 1
fi
"$PYTHON" -c 'import sys,tkinter; assert sys.version_info >= (3,11), "Python 3.11 or newer is required"'
if [ "$(uname -m)" = arm64 ]; then
  "$PYTHON" -c 'import platform; assert platform.machine() == "arm64", "Install native Apple Silicon/universal2 Python; this interpreter runs under Rosetta"'
fi
if [ ! -x .venv-macos/bin/python ]; then "$PYTHON" -m venv .venv-macos; fi
.venv-macos/bin/python -m pip install -r requirements.txt
.venv-macos/bin/python setup_offline_descriptions.py
exec .venv-macos/bin/python photo_studio.py
