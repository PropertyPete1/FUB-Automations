import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '/home/ubuntu/fub_nurture_dashboard/.env' });

const conn = await createConnection(process.env.DATABASE_URL);

// All observations from last 28 hours
const [obs] = await conn.execute(`
  SELECT source, category, severity, LEFT(message,160) as msg, DATE_FORMAT(created_at,'%m-%d %H:%i') as ts
  FROM bot_observations
  WHERE created_at >= DATE_SUB(NOW(), INTERVAL 28 HOUR)
  ORDER BY created_at DESC
  LIMIT 40
`);

console.log('\n=== BOT OBSERVATIONS (last 28h) ===');
for (const r of obs) {
  console.log(`[${r.ts}] ${r.severity.toUpperCase().padEnd(7)} | ${r.source.padEnd(20)} | ${r.category.padEnd(15)} | ${r.msg}`);
}

// Count by severity
const [counts] = await conn.execute(`
  SELECT severity, COUNT(*) as cnt
  FROM bot_observations
  WHERE created_at >= DATE_SUB(NOW(), INTERVAL 28 HOUR)
  GROUP BY severity
`);
console.log('\n=== SEVERITY COUNTS ===');
for (const r of counts) console.log(`  ${r.severity}: ${r.cnt}`);

// Check if nightly healer ran (look for healer source or nightly_healer category)
const [healer] = await conn.execute(`
  SELECT source, category, severity, LEFT(message,160) as msg, DATE_FORMAT(created_at,'%m-%d %H:%i') as ts
  FROM bot_observations
  WHERE (source LIKE '%healer%' OR source LIKE '%nightly%' OR category LIKE '%healer%')
    AND created_at >= DATE_SUB(NOW(), INTERVAL 28 HOUR)
  ORDER BY created_at DESC
  LIMIT 10
`);
console.log('\n=== NIGHTLY HEALER OBSERVATIONS ===');
if (healer.length === 0) console.log('  (none found — healer writes to Python audit_log, not MySQL)');
else for (const r of healer) console.log(`[${r.ts}] ${r.severity} | ${r.source} | ${r.msg}`);

// Check bot_monitor_runs if table exists
try {
  const [runs] = await conn.execute(`
    SELECT DATE_FORMAT(run_at,'%m-%d %H:%i') as ts, checks_passed, checks_warned, checks_failed, LEFT(summary,120) as summary
    FROM bot_monitor_runs
    WHERE run_at >= DATE_SUB(NOW(), INTERVAL 28 HOUR)
    ORDER BY run_at DESC
    LIMIT 10
  `);
  console.log('\n=== BOT MONITOR RUNS (last 28h) ===');
  for (const r of runs) console.log(`[${r.ts}] passed=${r.checks_passed} warned=${r.checks_warned} failed=${r.checks_failed} | ${r.summary}`);
} catch (e) {
  console.log('\n=== BOT MONITOR RUNS === (table not found or empty)');
}

await conn.end();
