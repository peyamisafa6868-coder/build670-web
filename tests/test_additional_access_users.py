"""Staging supplementary SHA-256 users must never replace existing identities."""
import hashlib
import json
import unittest
from unittest.mock import patch

from access_control import AccessConfigurationError, authenticate, identities
from browser_sessions import login, logout, lookup, _sessions, _failures, set_cookie


def digest(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


class AdditiveIdentityTests(unittest.TestCase):
    def setUp(self):
        self.first = 'EXPLICIT_TEST_ORIGINAL_' + 'a' * 40
        self.second = 'EXPLICIT_TEST_ADDITIONAL_' + 'b' * 40
        self.env = patch.dict('os.environ', {
            'BUILD670_AUTH_REQUIRED': '1',
            'BUILD670_USER_TOKEN_HASHES': json.dumps({'original': digest(self.first)}),
            'BUILD670_ADDITIONAL_USER_TOKEN_HASHES': json.dumps({'staging_user': digest(self.second)}),
        })
        self.env.start()
        _sessions.clear()
        _failures.clear()

    def tearDown(self):
        self.env.stop()
        _sessions.clear()
        _failures.clear()

    def test_preserves_original_and_adds_new(self):
        self.assertEqual(identities(), {'original': digest(self.first), 'staging_user': digest(self.second)})
        self.assertEqual(authenticate({'Authorization': 'Bearer ' + self.first}, '198.51.100.10'), 'original')
        self.assertEqual(authenticate({'Authorization': 'Bearer ' + self.second}, '198.51.100.10'), 'staging_user')

    def test_browser_sessions_work_for_both(self):
        for user, token in [('original', self.first), ('staging_user', self.second)]:
            status, value = login(token, {}, '198.51.100.10')
            self.assertEqual(status, 200)
            self.assertEqual(lookup({'Cookie': set_cookie(value)} )['user'], user)

    def test_no_extra_variable_is_backward_compatible(self):
        with patch.dict('os.environ', {'BUILD670_ADDITIONAL_USER_TOKEN_HASHES': '{}'}):
            self.assertEqual(identities(), {'original': digest(self.first)})

    def test_duplicate_user_is_rejected_without_shadowing(self):
        with patch.dict('os.environ', {'BUILD670_ADDITIONAL_USER_TOKEN_HASHES': json.dumps({'original': digest(self.second)})}):
            with self.assertRaises(AccessConfigurationError):
                identities()

    def test_bad_extra_json_fails_closed(self):
        with patch.dict('os.environ', {'BUILD670_ADDITIONAL_USER_TOKEN_HASHES': '{broken'}):
            with self.assertRaises(AccessConfigurationError):
                identities()

    def test_corrupt_legacy_map_remains_fatal_without_explicit_recovery(self):
        with patch.dict('os.environ', {
            'BUILD670_USER_TOKEN_HASHES': '{broken',
            'RAILWAY_ENVIRONMENT_NAME': 'staging',
            'BUILD670_STAGING_AUTH_RECOVERY': '0',
        }):
            with self.assertRaises(AccessConfigurationError):
                identities()

    def test_staging_recovery_allows_valid_supplemental_only(self):
        with patch.dict('os.environ', {
            'BUILD670_USER_TOKEN_HASHES': '{broken',
            'RAILWAY_ENVIRONMENT_NAME': 'staging',
            'BUILD670_STAGING_AUTH_RECOVERY': '1',
        }):
            self.assertEqual(identities(), {'staging_user': digest(self.second)})
            self.assertEqual(authenticate({'Authorization': 'Bearer ' + self.second}, '198.51.100.10'), 'staging_user')
            self.assertIsNone(authenticate({'Authorization': 'Bearer ' + self.first}, '198.51.100.10'))
            self.assertIsNone(authenticate({'Authorization': 'Bearer ' + 'invalid'*6}, '198.51.100.10'))

    def test_recovery_never_activates_in_production(self):
        with patch.dict('os.environ', {
            'BUILD670_USER_TOKEN_HASHES': '{broken',
            'RAILWAY_ENVIRONMENT_NAME': 'production',
            'BUILD670_STAGING_AUTH_RECOVERY': '1',
        }):
            with self.assertRaises(AccessConfigurationError):
                identities()

    def test_recovery_requires_valid_supplemental_identities(self):
        with patch.dict('os.environ', {
            'BUILD670_USER_TOKEN_HASHES': '{broken',
            'RAILWAY_ENVIRONMENT_NAME': 'staging',
            'BUILD670_STAGING_AUTH_RECOVERY': '1',
            'BUILD670_ADDITIONAL_USER_TOKEN_HASHES': '{}',
        }):
            with self.assertRaises(AccessConfigurationError):
                identities()
        with patch.dict('os.environ', {
            'BUILD670_USER_TOKEN_HASHES': '{broken',
            'RAILWAY_ENVIRONMENT_NAME': 'staging',
            'BUILD670_STAGING_AUTH_RECOVERY': '1',
            'BUILD670_ADDITIONAL_USER_TOKEN_HASHES': '{broken',
        }):
            with self.assertRaises(AccessConfigurationError):
                identities()

    def test_valid_legacy_map_preserved_even_with_recovery_flag(self):
        with patch.dict('os.environ', {
            'RAILWAY_ENVIRONMENT_NAME': 'staging',
            'BUILD670_STAGING_AUTH_RECOVERY': '1',
        }):
            self.assertEqual(identities(), {'original': digest(self.first), 'staging_user': digest(self.second)})


if __name__ == '__main__':
    unittest.main()
