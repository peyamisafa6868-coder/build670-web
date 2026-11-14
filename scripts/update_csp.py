"""Regenerate inline-script SHA-256 allowlist without weakening CSP."""
import base64
import hashlib
import re
from pathlib import Path

path=Path(__file__).resolve().parents[1]/'index.html'
html=path.read_text(encoding='utf-8')
scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S)
hashes=' '.join("'sha256-"+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()+"'" for s in scripts)
updated,count=re.subn(r'script-src [^;]+;', 'script-src '+hashes+';',html,count=1)
if count!=1 or not scripts:raise SystemExit('CSP or inline scripts missing')
path.write_text(updated,encoding='utf-8')
print(f'Updated {len(scripts)} inline-script hashes')
