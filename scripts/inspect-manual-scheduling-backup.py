"""Read-only inspection of owner-provided exports. No row contents are printed."""
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

csv.field_size_limit(2**31 - 1)
source = Path(sys.argv[1]).resolve(strict=True)
output = Path('outputs/deployment/scheduling-backup-readiness/manual-export-inspection').resolve()
if source == output or source in output.parents:
    raise RuntimeError('Inspection output must be outside source backup')
output.mkdir(parents=True, exist_ok=True)

def inventory():
    return {str(p.relative_to(source)): {'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
            'bytes': p.stat().st_size, 'mtime_ns': p.stat().st_mtime_ns}
            for p in source.rglob('*') if p.is_file()}

before = inventory()
definitions = []
references = set()
custom_types = set()
commands = {}
for file in sorted((source / 'Schema').glob('*')):
    if not file.is_file():
        continue
    text = file.read_text(encoding='utf-8-sig')
    match = re.search(r'create\s+(?:or\s+replace\s+)?(table|view)\s+(?:"?([a-z_][a-z0-9_]*)"?\.)?"?([a-z_][a-z0-9_]*)"?', text, re.I)
    if match:
        definitions.append({'file': file.name, 'kind': match[1].lower(),
                            'schema': match[2] or 'public', 'name': match[3]})
    references.update('.'.join(m) for m in re.findall(r'\breferences\s+(?:"?([a-z_][a-z0-9_]*)"?\.)"?([a-z_][a-z0-9_]*)"?', text, re.I))
    custom_types.update(re.findall(r'^\s*"?[a-z_][a-z0-9_]*"?\s+(public\.[a-z_][a-z0-9_]*)\b', text, re.M | re.I))
    for label, pattern in {'types': r'\bcreate\s+type\b', 'functions': r'\bcreate\s+(?:or\s+replace\s+)?function\b',
                           'policies': r'\bcreate\s+policy\b', 'rls': r'\benable\s+row\s+level\s+security\b',
                           'grants': r'\bgrant\b', 'triggers': r'\bcreate\s+(?:or\s+replace\s+)?trigger\b'}.items():
        commands[label] = commands.get(label, 0) + len(re.findall(pattern, text, re.I))
tables = {d['schema'] + '.' + d['name']: d for d in definitions if d['kind'] == 'table'}
data = []
for file in sorted((source / 'Data').glob('*.csv')):
    with file.open(encoding='utf-8-sig', newline='') as stream:
        rows = csv.reader(stream)
        headers = next(rows, [])
        count = 0
        bad_width = 0
        for row in rows:
            count += 1
            bad_width += len(row) != len(headers)
    name = file.stem.removesuffix('_rows')
    data.append({'file': file.name, 'table': 'public.' + name, 'columns': headers,
                 'rows': count, 'invalid_width_rows': bad_width})
data_names = {d['table'] for d in data}
report = {'source': str(source), 'files': before, 'definitions': definitions, 'data': data,
          'ddl_features': commands, 'custom_type_dependencies_without_definitions': sorted(custom_types) if not commands.get('types') else [],
          'referenced_tables_without_schema_export': sorted(references - tables.keys()),
          'tables_without_csv': sorted(tables.keys() - data_names),
          'csv_without_table_schema': sorted(data_names - tables.keys()),
          'source_files_unchanged_after_inspection': before == inventory()}
(output / 'inspection-private.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
summary = {'schema_tables': len(tables), 'schema_views': sum(d['kind'] == 'view' for d in definitions),
           'csv_files': len(data), 'csv_rows': sum(d['rows'] for d in data),
           'invalid_width_rows': sum(d['invalid_width_rows'] for d in data),
           'ddl_features': commands, 'missing_type_definitions': report['custom_type_dependencies_without_definitions'],
           'missing_referenced_schemas': report['referenced_tables_without_schema_export'],
           'tables_without_csv': report['tables_without_csv'],
           'csv_without_table_schema': report['csv_without_table_schema'],
           'source_files_unchanged': report['source_files_unchanged_after_inspection']}
(output / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
