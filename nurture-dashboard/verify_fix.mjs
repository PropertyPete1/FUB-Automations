import { config } from "dotenv";
config({ path: ".env" });

const key = process.env.FUB_API_KEY;
if (!key) { console.log("No FUB_API_KEY"); process.exit(1); }

const auth = Buffer.from(key + ":").toString("base64");

async function fubGet(path) {
  const res = await fetch("https://api.followupboss.com/v1" + path, {
    headers: { "Authorization": "Basic " + auth, "X-System": "Lifestyle Command Center", "X-System-Key": key }
  });
  if (!res.ok) throw new Error(`FUB ${path} → ${res.status}`);
  return res.json();
}

const now = Date.now();

// Replicate exactly what the fixed getPendingQueue does
const usersData = await fubGet("/users?limit=50");
const usersMap = {};
for (const u of (usersData.users || [])) {
  if (u.id) usersMap[Number(u.id)] = { name: u.name || "", firstName: u.firstName || "" };
}

// FIXED: sort=-lastActivityAt (descending = newest first)
const peopleData = await fubGet("/people?limit=500&sort=-lastActivityAt");
const candidates = peopleData.people || [];
console.log(`FUB returned ${candidates.length} people`);

const EXCLUDED_STAGES = new Set(["closed","closed - lost","not interested","do not contact","withdrawn","deleted","spam","duplicate"]);
const EXCLUDED_TAGS = new Set(["do not contact","dnc","spam","duplicate","test","do not email","manual review"]);

const eligible = candidates.filter(person => {
  if (person.assignedPondId) return false;
  const stage = String(person.stage || "").toLowerCase();
  if (EXCLUDED_STAGES.has(stage)) return false;
  const tags = (person.tags || []).map(t => t.toLowerCase());
  if (tags.some(t => EXCLUDED_TAGS.has(t))) return false;
  if (!person.assignedUserId) return false;
  const phones = person.phones || [];
  const phoneVal = phones[0]?.value || phones[0]?.phone || null;
  if (!phoneVal) return false;
  const lastActivityStr = person.lastActivity || person.updated || null;
  if (lastActivityStr) {
    try {
      const lastActivity = new Date(lastActivityStr);
      const daysAgo = Math.floor((now - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo < 1 || daysAgo > 20) return false;
    } catch { /* include */ }
  }
  return true;
});

console.log(`Eligible leads (1-20d, non-pond, has phone): ${eligible.length}`);
console.log();

const byAgent = {};
for (const p of eligible) {
  const uid = Number(p.assignedUserId);
  const user = usersMap[uid] || { name: "Unknown", firstName: "Unknown" };
  const agentFirst = user.firstName || user.name.split(" ")[0] || "Unknown";
  if (!byAgent[agentFirst]) byAgent[agentFirst] = [];
  const la = p.lastActivity || p.updated;
  const days = la ? Math.floor((now - new Date(la).getTime()) / 86400000) : 0;
  byAgent[agentFirst].push({ name: p.name, days, stage: p.stage });
}

for (const [agent, leads] of Object.entries(byAgent).sort()) {
  console.log(`${agent}: ${leads.length} leads`);
  for (const l of leads) {
    console.log(`  "${l.name}" — ${l.days}d stale, stage="${l.stage}"`);
  }
}

if (Object.keys(byAgent).length === 0) {
  console.log("⚠️  No eligible leads found — check FUB data");
} else {
  console.log(`\n✅ Fix confirmed: ${Object.keys(byAgent).length} agents now have leads in queue`);
}
