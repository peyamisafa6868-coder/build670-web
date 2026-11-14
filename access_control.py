"""Opt-in local / mandatory remote API token authentication (SHA-256 tokens only)."""
import hashlib,hmac,json,os,re
from ipaddress import ip_address

class AccessConfigurationError(RuntimeError):pass

def required():
    return os.getenv('BUILD670_AUTH_REQUIRED')=='1' or os.getenv('RAILWAY_ENVIRONMENT') is not None or os.getenv('BUILD670_PUBLIC_SERVER')=='1'

def identities():
    raw=os.getenv('BUILD670_USER_TOKEN_HASHES','{}')
    try: mapping=json.loads(raw)
    except (TypeError,ValueError) as error:raise AccessConfigurationError('Geçersiz kullanıcı yapılandırması.') from error
    if not isinstance(mapping,dict):raise AccessConfigurationError('Kullanıcı haritası JSON nesnesi olmalı.')
    result={}
    for user,digest in mapping.items():
        if not isinstance(user,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,50}',user) or not isinstance(digest,str) or not re.fullmatch(r'[0-9a-f]{64}',digest):
            raise AccessConfigurationError('Kullanıcı adı veya SHA256 özeti geçersiz.')
        result[user]=digest
    return result

def authenticate(headers, client_ip):
    if not required():
        try:
            if ip_address(client_ip).is_loopback:return 'local'
        except ValueError:pass
    mapping=identities()
    if not mapping:return None
    auth=headers.get('Authorization','')
    if not auth.startswith('Bearer '):return None
    token=auth[7:]
    if len(token)<32 or len(token)>512:return None
    digest=hashlib.sha256(token.encode('utf-8')).hexdigest()
    for user,stored in mapping.items():
        if hmac.compare_digest(digest,stored):return user
    return None
