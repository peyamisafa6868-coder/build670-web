#!/bin/sh
set -eu
cd "$(dirname "$0")"
PYTHON="$(command -v python3 || true)"
if [ -z "$PYTHON" ]; then
  echo "Python 3.12+ bulunamadı" >&2
  exit 2
fi
if ! "$PYTHON" -c 'import tzdata' 2>/dev/null; then
  "$PYTHON" -m pip install -r requirements.txt
fi
exec "$PYTHON" RUN_WEB.py
