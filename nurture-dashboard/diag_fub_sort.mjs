import { config } from "dotenv";
config({ path: ".env" });

const key = process.env.FUB_API_KEY;
if (!key) { console.log("No FUB_API_KEY"); process.exit(1); }

const auth = Buffer.from(key + ":").toString("base64");

async function fubGet(path) {
  const res = await fetch("https://api.followupboss.com/v1" + path, {
    headers: {
      "Authorization": "Basic " + auth,
      "X-System": "Lifestyle Command Center",
      "X-System-Key": key,
    }
  });
  if (!res.ok) throw new Error(`FUB ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

const now = Date.now();

// Test 1: sort descending (newest first)
console.log("=== TEST 1: sort=-lastActivityAt (descending / newest first) ===");
const desc = await fubGet("/people?limit=100&sort=-lastActivityAt");
const descPeople = desc.people || [];
console.log(`Returned: ${descPeople.length}`);
if (descPeople.length > 0) {
  const first = descPeople[0];
  const last = descPeople[descPeople.length - 1];
  const firstDays = Math.floor((now - new Date(first.lastActivity || first.updated).getTime()) / 86400000);
  const lastDays = Math.floor((now - new Date(last.lastActivity || last.updated).getTime()) / 86400000);
  console.log(`First: "${first.name}" — ${firstDays} days stale`);
  console.log(`Last:  "${last.name}" — ${lastDays} days stale`);
  
  // Count by user
  const byUser = {};
  for (const p of descPeople) {
    const la = p.lastActivity || p.updated;
    const days = la ? Math.floor((now - new Date(la).getTime()) / 86400000) : 999;
    const uid = p.assignedUserId || "none";
    if (!byUser[uid]) byUser[uid] = { total: 0, inWindow: 0, pond: 0 };
    byUser[uid].total++;
    if (p.assignedPondId) { byUser[uid].pond++; continue; }
    if (days >= 1 && days <= 20) byUser[uid].inWindow++;
  }
  console.log("\nBy user (inWindow = 1-20d non-pond):");
  for (const [uid, stats] of Object.entries(byUser).sort()) {
    console.log(`  User ${uid}: total=${stats.total} pond=${stats.pond} inWindow=${stats.inWindow}`);
  }
}

// Test 2: date range filter — lastActivityAfter and lastActivityBefore
const cutoff1d = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
const cutoff20d = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
console.log(`\n=== TEST 2: lastActivityAfter=${cutoff20d}&lastActivityBefore=${cutoff1d} ===`);
try {
  const rangeData = await fubGet(`/people?limit=100&sort=-lastActivityAt&lastActivityAfter=${cutoff20d}&lastActivityBefore=${cutoff1d}`);
  const rangePeople = rangeData.people || [];
  console.log(`Returned: ${rangePeople.length}`);
  const byUser2 = {};
  for (const p of rangePeople) {
    const uid = p.assignedUserId || "none";
    if (!byUser2[uid]) byUser2[uid] = { total: 0, pond: 0, eligible: 0 };
    byUser2[uid].total++;
    if (p.assignedPondId) { byUser2[uid].pond++; continue; }
    const phones = (p.phones || []).map(ph => ph.value || ph.phone || "").filter(Boolean);
    if (phones.length > 0) byUser2[uid].eligible++;
  }
  console.log("By user:");
  for (const [uid, stats] of Object.entries(byUser2).sort()) {
    console.log(`  User ${uid}: total=${stats.total} pond=${stats.pond} eligible=${stats.eligible}`);
  }
} catch (e) {
  console.log("Date range filter failed:", e.message);
}

// Test 3: per-agent filter using assignedTo parameter
console.log("\n=== TEST 3: Per-agent filter (assignedTo=1 = Steven) ===");
try {
  const stevenData = await fubGet(`/people?limit=100&sort=-lastActivityAt&assignedTo=1`);
  const stevenPeople = stevenData.people || [];
  console.log(`Steven (id=1) total leads: ${stevenPeople.length}`);
  const inWindow = stevenPeople.filter(p => {
    const la = p.lastActivity || p.updated;
    if (!la) return false;
    const days = Math.floor((now - new Date(la).getTime()) / 86400000);
    return days >= 1 && days <= 20 && !p.assignedPondId;
  });
  console.log(`Steven leads in 1-20d window: ${inWindow.length}`);
  for (const l of inWindow) {
    const la = l.lastActivity || l.updated;
    const days = Math.floor((now - new Date(la).getTime()) / 86400000);
    const phones = (l.phones || []).map(ph => ph.value || ph.phone || "").filter(Boolean);
    console.log(`  "${l.name}" days=${days} stage="${l.stage}" phone=${phones[0] || "none"}`);
  }
} catch (e) {
  console.log("Per-agent filter failed:", e.message);
}
