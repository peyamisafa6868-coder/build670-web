"""Storage configuration safety: no Railway or production mutation required."""
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch
from scan_service import ScanService

class StorageDirectoryTests(TestCase):
    def test_explicit_environment_directory(self):
        with TemporaryDirectory() as tmp:
            with patch.dict(os.environ, {'BUILD670_SCAN_DATA_DIR': tmp}):
                service = ScanService(persist=True, universe=None)
            self.assertEqual(service.directory, Path(tmp))
            self.assertEqual(service.jobs, {})

    def test_default_is_unchanged(self):
        with patch.dict(os.environ, {k:v for k,v in os.environ.items() if k != 'BUILD670_SCAN_DATA_DIR'}, clear=True):
            service = ScanService(persist=False, universe=None)
        self.assertEqual(service.directory.name, 'runtime-data')

    def test_relative_directory_is_rejected(self):
        with patch.dict(os.environ, {'BUILD670_SCAN_DATA_DIR': 'relative/path'}):
            with self.assertRaisesRegex(ValueError, 'mutlak yol'):
                ScanService(persist=True, universe=None)
