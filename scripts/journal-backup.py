"""Consistent SQLite backup and restore to a NEW path; never overwrite a journal."""
import argparse
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3


def verify(path):
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('SQLite integrity check failed')
        return {name: db.execute('SELECT COUNT(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0]
                for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")}


def backup(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if source == output or output.exists():
        raise ValueError('Output must be a new, separate file')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents a typo or concurrent backup from replacing data.
    with output.open('xb'):
        pass
    try:
        with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as current, closing(sqlite3.connect(output)) as target:
            current.backup(target)
        tables = verify(output)
        manifest = {'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'tables': tables}
        Path(str(output) + '.manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf8')
        return manifest
    except Exception:
        output.unlink(missing_ok=True)
        raise


def restore(source, output):
    source = Path(source)
    manifest = json.loads(Path(str(source) + '.manifest.json').read_text(encoding='utf8'))
    if hashlib.sha256(source.read_bytes()).hexdigest() != manifest['sha256']:
        raise ValueError('Backup checksum mismatch')
    result = backup(source, output)
    if result['tables'] != manifest['tables']:
        raise ValueError('Restored table counts differ')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['backup', 'restore', 'verify'])
    parser.add_argument('--source', required=True)
    parser.add_argument('--output')
    args = parser.parse_args()
    if args.action == 'verify':
        result = verify(args.source)
    else:
        if not args.output: parser.error('--output is required')
        result = (backup if args.action == 'backup' else restore)(args.source, args.output)
    print(json.dumps({'verified': True, 'tableCount': len(result.get('tables', result))}))
