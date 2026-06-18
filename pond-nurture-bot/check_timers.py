import sqlite3

db_path = '/home/ubuntu/fub_automation/data/fub_automation.sqlite3'
con = sqlite3.connect(db_path)
con.row_factory = sqlite3.Row

print('=== new_lead_timers (last 20) ===')
rows = con.execute('SELECT * FROM new_lead_timers ORDER BY created_at DESC LIMIT 20').fetchall()
for r in rows:
    d = {k: r[k] for k in r.keys()}
    print(d)

print()
print('=== audit_log (new_lead/reassign/warning, last 30) ===')
rows2 = con.execute(
    "SELECT * FROM audit_log WHERE action LIKE '%new_lead%' OR action LIKE '%reassign%' OR action LIKE '%warning%' OR action LIKE '%speed%' OR action LIKE '%timer%' ORDER BY created_at DESC LIMIT 30"
).fetchall()
for r in rows2:
    d = {k: r[k] for k in r.keys()}
    print(d)

print()
print('=== All audit_log actions (distinct) ===')
rows3 = con.execute("SELECT DISTINCT action FROM audit_log ORDER BY action").fetchall()
for r in rows3:
    print(r[0])

con.close()
