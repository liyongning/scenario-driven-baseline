"""仅在固定 Go 取数成功后刷新本批样例摘要；不生成生产目录或场景绑定。"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

root = Path(sys.argv[1])
archive = Path(sys.argv[2])
repo = Path(__file__).resolve().parents[5]
source = root / 'TC-PAYSDK-CONTRACT-024'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

for file in root.glob('*/manifest.json'):
    manifest = json.loads(file.read_text())
    sources = manifest['sources']
    for name, expected in sources['idlFiles'].items():
        if digest(archive / name) != expected:
            raise ValueError('fixed IDL source mismatch: ' + name)
    # generated 来源与固定 Go 事实分开验收。兼容闭包由 CONTRACT-024 校验，
    # 本工具只维护固定来源样例，绝不从当前 lock 生成或覆盖 generatedCompatibility。
    sources.pop('idlLockSha256', None)
    sources['spec']['sha256'] = digest(repo / sources['spec']['path'])
    sources['extraction']['programSha256'] = digest(source / 'extract.go')
    sources['extraction']['inputFilesSha256'] = {name: digest(source / name) for name in ['extract.go', 'reproduce.sh', 'defensive-fixtures.py', 'refresh-manifests.py']}
    sources['extraction']['goVersion'] = subprocess.check_output(['go', 'version'], text=True).strip().removeprefix('go version ')
    manifest['cases'] = {p.stem: p.name for p in sorted(file.parent.glob('*.json')) if p.name != 'manifest.json'}
    manifest['sha256'] = {p.name: digest(p) for p in sorted(file.parent.glob('*.json')) if p.name != 'manifest.json'}
    manifest['defensiveMutations'] = {name: 'Explicit mutation of fixed Go fixture; client defense only, not a captured server response' for name in manifest['cases'] if name not in ['valid', 'same-payment', 'different-payment', 'omitted', 'sandbox', 'prod', 'query-no-env', 'descriptor', 'idl-errors'] and not name.startswith(('Err', 'TRADE_STATUS_'))}
    file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print('Verified fixed source hashes and refreshed fixture manifests')
