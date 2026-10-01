"""仅在固定 Go 取数成功后刷新本批样例摘要；不生成生产目录或场景绑定。"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

root = Path(sys.argv[1])
archive = Path(sys.argv[2])
repo = Path(__file__).resolve().parents[5]
source = root / 'SCN-PROTOCOL-CONTRACT-003'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

for file in root.glob('*/manifest.json'):
    manifest = json.loads(file.read_text())
    sources = manifest['sources']
    for name, expected in sources['idlFiles'].items():
        if digest(archive / name) != expected:
            raise ValueError('fixed IDL source mismatch: ' + name)
    # generated 来源与固定 Go 事实分开验收。兼容闭包由生成的 current lock 校验，
    # 本工具只维护固定来源样例，绝不从当前 lock 生成或覆盖 generatedCompatibility。
    sources.pop('idlLockSha256', None)
    sources['spec']['sha256'] = digest(repo / sources['spec']['path'])
    sources['extraction']['programSha256'] = digest(source / 'extract.go')
    sources['extraction']['inputFilesSha256'] = {name: digest(source / name) for name in ['extract.go', 'reproduce.sh', 'refresh-manifests.py']}
    sources['extraction']['goVersion'] = subprocess.check_output(['go', 'version'], text=True).strip().removeprefix('go version ')
    files = sorted(p.name for p in file.parent.glob('*.json') if p.name != 'manifest.json')
    declared = {name: key for key, name in manifest.get('cases', {}).items()}
    manifest['cases'] = {declared.get(name, Path(name).stem): name for name in files}
    manifest['sha256'] = {name: digest(file.parent / name) for name in files}
    manifest['defensiveMutations'] = {name: 'Explicit mutation of fixed Go fixture; client defense only, not a captured server response' for name, declaredFile in manifest['cases'].items() if declaredFile != 'idl-errors.json'}
    file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print('Verified fixed source hashes and refreshed fixture manifests')
