import importlib.util
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('backup', Path(__file__).with_name('journal-backup.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTests(unittest.TestCase):
    def test_restore_preserves_rows_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            source, copy, restored = [Path(folder) / name for name in ('source.sqlite', 'backup.sqlite', 'restored.sqlite')]
            with closing(sqlite3.connect(source)) as db:
                db.execute('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)')
                db.execute("INSERT INTO notes VALUES (1, 'Retain this note')")
                db.commit()
            backup.backup(source, copy)
            backup.restore(copy, restored)
            with closing(sqlite3.connect(restored)) as db:
                self.assertEqual(db.execute('SELECT * FROM notes').fetchall(), [(1, 'Retain this note')])
            with self.assertRaises(ValueError): backup.restore(copy, source)

    def test_checksum_mismatch_rejects_restore(self):
        with tempfile.TemporaryDirectory() as folder:
            source, copy = Path(folder) / 'source.sqlite', Path(folder) / 'backup.sqlite'
            with closing(sqlite3.connect(source)) as db: db.execute('CREATE TABLE notes (id INTEGER)')
            backup.backup(source, copy)
            with copy.open('ab') as file: file.write(b'changed')
            with self.assertRaises(ValueError): backup.restore(copy, Path(folder) / 'restored.sqlite')


if __name__ == '__main__': unittest.main()
