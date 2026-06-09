import sqlite3, datetime

DB = r'E:\LA\cons\avgexpert\data\database.sqlite'
conn = sqlite3.connect(DB)
cur = conn.cursor()

def row_effect(alloc, inp, out, reason):
    if reason == 'admin_adjustment':
        return {'delta': alloc, 'consumed': 0, 'received': max(0, alloc)}
    if reason == 'chat_usage':
        return {'delta': -(inp + out), 'consumed': inp + out, 'received': 0}
    if reason == 'tokens_exhausted':
        return {'delta': -max(0, alloc - inp - out), 'consumed': 0, 'received': 0}
    if alloc > 0 and inp == 0 and out == 0:
        return {'delta': alloc, 'consumed': 0, 'received': alloc}
    if inp > 0 or out > 0:
        return {'delta': -(inp + out), 'consumed': inp + out, 'received': 0}
    return {'delta': 0, 'consumed': 0, 'received': 0}

def to_cr(t):
    return round(t / 1000)

cur.execute('SELECT tokens_allocated, tokens_input_used, tokens_output_used FROM users WHERE username=?', ('admin',))
a, inp, out = cur.fetchone()
current = a - inp - out

cur.execute('SELECT tokens_allocated, tokens_input, tokens_output, recorded_at, reason FROM token_usage_history WHERE username=? ORDER BY recorded_at ASC, id ASC', ('admin',))
rows = cur.fetchall()
effects = [{**row_effect(r[0], r[1], r[2], r[4]), 'date': r[3]} for r in rows]
known = sum(e['delta'] for e in effects)
running = current - known

day_map = {}
for e in effects:
    d = datetime.datetime.fromtimestamp(e['date']/1000)
    key = f'{d.year}-{d.month}-{d.day}'
    if key not in day_map:
        day_map[key] = {'date': e['date'], 'start': running, 'consumed': 0, 'received': 0}
    running += e['delta']
    day_map[key]['date'] = e['date']
    day_map[key]['consumed'] += e['consumed']
    day_map[key]['received'] += e['received']

print(f'Current balance credits: {to_cr(current)}')
print(f'Initial before history: {to_cr(current - known)}')
print()

days = sorted(day_map.values(), key=lambda x: x['date'])
prev_end_cr = to_cr(current - known)
for entry in days:
    open_cr = to_cr(entry['start'])
    recv = to_cr(entry['received'])
    spent = to_cr(entry['consumed'])
    balance = max(0, open_cr + recv - spent)
    dt = datetime.datetime.fromtimestamp(entry['date']/1000)
    print(f'{dt:%d.%m.%Y}  open={open_cr:5d}  recv={recv:5d}  spent={spent:5d}  balance={balance:5d}  check={open_cr}+{recv}-{spent}={balance}  prev_end={prev_end_cr}')
    prev_end_cr = balance

conn.close()
