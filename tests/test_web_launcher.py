"""Regression tests for the browser launcher (no network/server needed)."""
import importlib.util
from pathlib import Path
import socket
import unittest
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('BUILD670_RUN_WEB', ROOT / 'RUN_WEB.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class TestBrowserLauncher(unittest.TestCase):
    def test_java_major_all_supported_and_legacy(self):
        self.assertEqual(runner.java_major('openjdk version "21.0.12" 2026-08-18'), 21)
        self.assertEqual(runner.java_major('java version "17.0.11"'), 17)
        self.assertEqual(runner.java_major('java version "1.8.0_301"'), 8)
        self.assertIsNone(runner.java_major('unexpected binary output'))

    @patch.object(runner.subprocess, 'run')
    def test_java_21_accepted(self, run):
        run.return_value = Mock(returncode=0, stderr='openjdk version "21.0.12"', stdout='')
        self.assertTrue(runner.ensure_java())

    @patch.object(runner.subprocess, 'run')
    def test_java_8_rejected(self, run):
        run.return_value = Mock(returncode=0, stderr='java version "1.8.0_301"', stdout='')
        self.assertFalse(runner.ensure_java())

    def test_preferred_port_collision_falls_back(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as blocker:
            blocker.bind(('127.0.0.1', 0))
            blocker.listen(1)
            taken = blocker.getsockname()[1]
            available = runner.choose_local_port(taken)
            self.assertNotEqual(available, taken)
            self.assertGreater(available, 0)

    def test_invalid_port_rejected(self):
        with self.assertRaises(ValueError):
            runner.choose_local_port(65536)


if __name__ == '__main__':
    unittest.main()
