"""Bounded, revocable browser sessions; existing bearer clients remain supported."""
import hashlib, hmac, secrets, threading, time
from http.cookies import SimpleCookie, CookieError
from access_control import identities

COOKIE = '__Host-build670_session'
TTL = 3600
MAX_SESSIONS = 1024
_lock = threading.RLock()
_sessions = {}
_failures = {}


def cookie_id(headers):
    try:
        cookie = SimpleCookie(); cookie.load(headers.get('Cookie', ''))
        value = cookie[COOKIE].value if COOKIE in cookie else ''
        return value if 32 <= len(value) <= 128 else ''
    except (CookieError, ValueError):
        return ''


def fingerprint(value):
    return hashlib.sha256(value.encode()).hexdigest()


def _prune(now):
    for key in [key for key, value in _sessions.items() if value['expires'] <= now]:
        del _sessions[key]
    for key in [key for key, value in _failures.items() if value[0] + 60 <= now]:
        del _failures[key]


def lookup(headers):
    key = fingerprint(cookie_id(headers))
    with _lock:
        _prune(time.monotonic())
        session = _sessions.get(key)
        if not session:
            return None
        stored = identities().get(session['user'], '')
        if not hmac.compare_digest(stored, session['credential']):
            _sessions.pop(key, None)
            return None
        return {'user': session['user'], 'binding': key}


def login(token, headers, client_ip):
    """Return (HTTP status, cookie value). Never retain plaintext credentials."""
    now = time.monotonic()
    with _lock:
        _prune(now)
        if _failures.get(client_ip, (now, 0))[1] >= 5:
            return 429, None
        if len(_failures) >= 4096 and client_ip not in _failures:
            return 503, None
        mapping = identities()
        digest = fingerprint(token) if isinstance(token, str) and 32 <= len(token) <= 512 else ''
        user = next((name for name, value in mapping.items() if hmac.compare_digest(value, digest)), None)
        if user is None:
            start, count = _failures.get(client_ip, (now, 0))
            _failures[client_ip] = (start, count + 1)
            return 401, None
        if len(_sessions) >= MAX_SESSIONS:
            return 503, None
        _failures.pop(client_ip, None)
        logout(headers)
        value = secrets.token_urlsafe(32)
        _sessions[fingerprint(value)] = {'user': user, 'credential': digest, 'expires': now + TTL}
        return 200, value


def logout(headers):
    with _lock:
        _sessions.pop(fingerprint(cookie_id(headers)), None)


def set_cookie(value):
    return f'{COOKIE}={value}; Path=/; Max-Age={TTL if value else 0}; HttpOnly; Secure; SameSite=Strict'
