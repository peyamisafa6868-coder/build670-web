"""Opt-in local / mandatory remote API token authentication (SHA-256 tokens only)."""
import hashlib,hmac,json,logging,os,re
from ipaddress import ip_address

class AccessConfigurationError(RuntimeError):pass

_recovery_warning_emitted=False

def required():
    return os.getenv('BUILD670_AUTH_REQUIRED')=='1' or os.getenv('RAILWAY_ENVIRONMENT') is not None or os.getenv('BUILD670_PUBLIC_SERVER')=='1'

def identities():
    """Merge validated user hashes. Strict by default; explicit staging recovery keeps supplemental access."""
    global _recovery_warning_emitted
    result={}
    legacy_invalid=False
    for env_name in ('BUILD670_USER_TOKEN_HASHES','BUILD670_ADDITIONAL_USER_TOKEN_HASHES'):
        raw=os.getenv(env_name,'{}')
        try: mapping=json.loads(raw)
        except (TypeError,ValueError) as error:
            if (env_name=='BUILD670_USER_TOKEN_HASHES'
                    and os.getenv('RAILWAY_ENVIRONMENT_NAME')=='staging'
                    and os.getenv('BUILD670_STAGING_AUTH_RECOVERY')=='1'):
                # Do not rewrite, disclose, or guess the malformed legacy value.
                # Only valid supplemental hashes can authenticate during recovery.
                legacy_invalid=True
                continue
            raise AccessConfigurationError('Geçersiz kullanıcı yapılandırması.') from error
        if not isinstance(mapping,dict):raise AccessConfigurationError('Kullanıcı haritası JSON nesnesi olmalı.')
        for user,digest in mapping.items():
            if not isinstance(user,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,50}',user) or not isinstance(digest,str) or not re.fullmatch(r'[0-9a-f]{64}',digest):
                raise AccessConfigurationError('Kullanıcı adı veya SHA256 özeti geçersiz.')
            if user in result:
                raise AccessConfigurationError('Yinelenen kullanıcı adı: iki harita birleştirilemedi.')
            result[user]=digest
    if legacy_invalid:
        if not result:
            raise AccessConfigurationError('Staging kurtarma için doğrulanmış ek kullanıcı gerekli.')
        if not _recovery_warning_emitted:
            logging.warning('BUILD670 staging auth recovery active: invalid legacy JSON kept unchanged; only supplemental identities accepted')
            _recovery_warning_emitted=True
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
