"""固定 Go 成功/错误样例的明确防御变异；不是服务端输出或测试步骤 DSL。"""
import copy
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])

def load(owner, name):
    return json.loads((root / owner / f'{name}.json').read_text())

def save(owner, name, value):
    (root / owner / f'{name}.json').write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

valid = load('TC-PAYSDK-CONTRACT-014', 'valid')
for name, field, value in [
    ('wrong-trade', 'tradeNo', 'trade-fixture-other'),
    ('empty-payment', 'paymentNo', ''),
    ('wrong-channel', 'channel', 'CHANNEL_WECHAT_NATIVE'),
    ('unsafe-time', 'expireTime', '9007199254740992'),
    ('missing-oneof', 'payParams', None),
    ('legacy-string', 'payParams', '{"mode":"short_series_goods"}'),
    ('wrong-oneof', 'payParams', {'wechatJsapi': {}}),
    ('multiple-oneof', 'payParams', {**valid['body']['payParams'], 'wechatJsapi': {}}),
]:
    case = copy.deepcopy(valid)
    case['body'][field] = value
    save('TC-PAYSDK-CONTRACT-014', name, case)
for field in ['mode', 'signData', 'paySig', 'signature']:
    case = copy.deepcopy(valid)
    del case['body']['payParams']['wechatVirtual'][field]
    save('TC-PAYSDK-CONTRACT-014', 'missing-' + field, case)
for name, base in [
    ('null-base', None), ('missing-status', {'success': True}),
    ('null-status', {'statusCode': None}), ('boolean-status', {'statusCode': False}),
    ('unsafe-status', {'statusCode': 9007199254740992}),
    ('unknown-status', {'statusCode': '9876543210', 'success': False}),
    ('success-conflict', {'statusCode': '0', 'success': False}),
]:
    case = copy.deepcopy(valid)
    case['body']['baseResp'] = base
    save('TC-PAYSDK-CONTRACT-017', name, case)
for status in [401, 403, 500]:
    case = copy.deepcopy(valid)
    case['status'] = status
    save('TC-PAYSDK-CONTRACT-017', 'http-' + str(status), case)
save('TC-PAYSDK-CONTRACT-017', 'non-json', {'status': 200, 'body': 'fixture non-json'})
unknown = load('TC-PAYSDK-CONTRACT-003', 'TRADE_STATUS_PAYING')
unknown['body']['trade']['status'] = 'TRADE_STATUS_FUTURE'
save('TC-PAYSDK-CONTRACT-003', 'unknown-status', unknown)
print('Saved explicit defensive mutations of independent Go fixtures')
