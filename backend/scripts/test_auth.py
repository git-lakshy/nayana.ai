"""Smoke test for P9 auth layer."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from backend.app.db import init_db
from backend.app import auth_db, auth

# Init both schemas
init_db()
auth_db.init_auth_db()
print('DB init OK')

# Password
hash_ = auth.hash_password('testpassword123')
assert auth.verify_password('testpassword123', hash_), 'pw verify failed'
assert not auth.verify_password('wrongpass', hash_), 'pw should reject'
print('bcrypt OK')

# JWT
token = auth.create_access_token(1, 1, 'owner', 'free')
payload = auth.decode_access_token(token)
assert payload['uid'] == 1
assert payload['plan'] == 'free'
print('JWT OK')

# Guest session
guest_tok, sid = auth.create_guest_token('127.0.0.1', 'test-ua')
assert len(guest_tok) == 64
gs = auth_db.get_guest_session(guest_tok)
assert gs and gs['id'] == sid
print('Guest session OK')

# Guest limit enforcement
identity = auth.Identity(
    kind='guest',
    guest_session_id=sid,
    guest_scans_used=5,
    guest_scan_limit=5,
    plan='guest',
    role='guest',
)
try:
    auth.check_guest_scan_limit(identity)
    print('FAIL - should have raised 402')
except Exception as e:
    detail = e.detail if hasattr(e, 'detail') else str(e)
    code = detail.get('code') if isinstance(detail, dict) else detail
    assert code == 'guest_limit_reached', f'unexpected code: {code}'
    print(f'Guest limit enforced OK (code={code})')

# Feature gating
free_id = auth.Identity(kind='user', user_id=1, org_id=1, role='owner', plan='free')
assert free_id.has_feature('crawl')
assert free_id.has_feature('fix_generate')
assert not free_id.has_feature('sov'), 'free should not have sov'

guest_id = auth.Identity(kind='guest', guest_session_id=1, plan='guest', role='guest')
assert guest_id.has_feature('llm_test')
assert not guest_id.has_feature('fix_generate'), 'guest should not have fix_generate'

pro_id = auth.Identity(kind='user', user_id=1, org_id=1, role='owner', plan='pro')
assert pro_id.has_feature('sov')
assert pro_id.has_feature('api_access')
print('Feature gating OK')

# API key generation
full_key, prefix, key_hash = auth.generate_api_key()
assert full_key.startswith('nai_'), f'bad prefix: {full_key[:10]}'
assert prefix == full_key[:12]
assert len(key_hash) == 64
print('API key gen OK')

# User + org creation round-trip
import time
uniq = str(int(time.time()))
user = auth_db.create_user(f'test{uniq}@example.com', 'Test User', hash_)
assert user and user['email'] == f'test{uniq}@example.com'
org = auth_db.create_org(f'Test Org {uniq}', f'test-org-{uniq}')
assert org and org['slug'] == f'test-org-{uniq}'
mem = auth_db.create_membership(user['id'], org['id'], 'owner')
assert mem['role'] == 'owner'
primary = auth_db.get_primary_org(user['id'])
assert primary and primary['id'] == org['id']
print('User/org/membership OK')

print()
print('ALL AUTH SMOKE TESTS PASSED')
