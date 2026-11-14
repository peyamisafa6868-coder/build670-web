"""Server-only provider configuration boundary.

No provider is connected by defining these variables alone. Never forward secrets to
browser responses, logs, URL query strings, or any reference/Yahoo request.
"""
import hmac
import ipaddress
import os
import re
from urllib.parse import urlsplit

_SECRET="BIST_MARKET_PROVIDER_TOKEN"
_ENDPOINT="BIST_MARKET_PROVIDER_URL"
_KEY_ID="BIST_MARKET_PROVIDER_KEY_ID"
_ALLOWED_HOSTS="BIST_MARKET_PROVIDER_ALLOWED_HOSTS"

def _hostname_allowed(host,allowed):
    # Do not resolve DNS or allow IP literal / loopback / local or ambiguous hosts.
    if not host or len(host)>253 or host.endswith(".") or host.lower() in {"localhost","localhost.localdomain"}:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    if any(not re.fullmatch(r"[a-z0-9-]{1,63}",part) or part.startswith("-") or part.endswith("-")
           for part in host.lower().split(".")):
        return False
    if "." not in host:
        return False
    return host.lower() in allowed

def provider_state(environ=None):
    """Return *public* metadata only; never read back token or key IDs."""
    env=os.environ if environ is None else environ
    url=env.get(_ENDPOINT,"").strip()
    token=env.get(_SECRET,"")
    key_id=env.get(_KEY_ID,"")
    allowed_raw=env.get(_ALLOWED_HOSTS,"")
    configured=bool(url or token or key_id or allowed_raw)
    if not configured:
        return {"configured":False,"configurationValid":False,
                "connected":False,"authenticated":False,"reason":"NOT_CONFIGURED"}
    allowed={x.strip().lower() for x in allowed_raw.split(",") if x.strip()}
    try:
        parts=urlsplit(url)
        valid=(parts.scheme=="https" and bool(parts.hostname)
               and parts.port in (None,443) and not parts.username and not parts.password
               and not parts.query and not parts.fragment and not parts.path.endswith("//")
               and _hostname_allowed(parts.hostname,allowed))
    except ValueError:
        valid=False
    if not valid:
        reason="INVALID_ENDPOINT_OR_ALLOWLIST"
    elif not (len(token)>=20 and len(token)<=4096 and token.strip()==token
              and not re.search(r"[\r\n\x00-\x1f\x7f]",token)
              and re.fullmatch(r"[A-Za-z0-9_-]{1,64}",key_id or "")):
        reason="INVALID_CREDENTIAL_CONFIGURATION"
    else:
        reason="UNVERIFIED_PROVIDER_CONNECTIVITY"
    return {"configured":True,"configurationValid":reason=="UNVERIFIED_PROVIDER_CONNECTIVITY",
            "connected":False,"authenticated":False,"reason":reason}

def authorize_header_for_internal_probe(environ=None):
    """Intended only for future server-side connection probes; no HTTP call performed."""
    env=os.environ if environ is None else environ
    if not provider_state(env)["configurationValid"]:
        raise ValueError("Provider configuration is not valid.")
    token=env[_SECRET]
    return {"Authorization":"Bearer "+token, "X-Provider-Key-Id":env[_KEY_ID]}

def constant_time_token_match(candidate,environ=None):
    """Do not use for market user authentication; only a future provider response probe."""
    env=os.environ if environ is None else environ
    value=env.get(_SECRET,"")
    return isinstance(candidate,str) and bool(value) and hmac.compare_digest(candidate,value)
