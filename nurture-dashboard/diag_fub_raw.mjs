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

// First: dump the users endpoint to see what IDs map to which agents
console.log("=== FUB USERS ===");
const usersData = await fubGet("/users?limit=50");
for (const u of (usersData.users || [])) {
  console.log(`  id=${u.id} name="${u.name}" firstName="${u.firstName}" email="${u.email}"`);
}

// Second: dump all 100 people with their raw assignedTo/assignedUserId/assignedPondId
console.log("\n=== FUB PEOPLE (limit=100, sort=lastActivityAt) ===");
const peopleData = await fubGet("/people?limit=100&sort=lastActivityAt");
const people = peopleData.people || [];
console.log(`Total returned: ${people.length}`);

// Group by assignedUserId
const byUser = {};
for (const p of people) {
  const la = p.lastActivity || p.updated;
  const days = la ? Math.floor((now - new Date(la).getTime()) / 86400000) : 999;
  const uid = p.assignedUserId || "none";
  const assignedToName = p.assignedTo?.name || p.assignedTo?.firstName || "?";
  const pondId = p.assignedPondId || null;
  const stage = p.stage || "?";
  const tags = (p.tags || []).join(",");
  const phones = (p.phones || []).map(ph => ph.value || ph.phone || "?").join(",");

  if (!byUser[uid]) byUser[uid] = [];
  byUser[uid].push({ name: p.name, days, pondId, stage, tags, phones: phones.slice(0,20), assignedToName });
}

for (const [uid, leads] of Object.entries(byUser).sort()) {
  const sample = leads[0];
  console.log(`\nUser ID ${uid} (name from assignedTo: "${sample.assignedToName}") — ${leads.length} leads:`);
  for (const l of leads.slice(0, 8)) {
    const flags = [];
    if (l.pondId) flags.push(`pond=${l.pondId}`);
    if (!l.phones) flags.push("NO_PHONE");
    if (l.days >= 1 && l.days <= 20 && !l.pondId) flags.push("✅IN_WINDOW");
    else if (l.days >= 1 && l.days <= 20) flags.push("⚠️IN_WINDOW_BUT_POND");
    console.log(`    "${l.name}" days=${l.days} stage="${l.stage}" ${flags.join(" ")}`);
  }
  if (leads.length > 8) console.log(`    ... and ${leads.length - 8} more`);
}

// Summary: which users have leads in 1-20 day window with phone and no pond
console.log("\n=== ELIGIBLE LEADS SUMMARY (1-20d, non-pond, has phone) ===");
for (const [uid, leads] of Object.entries(byUser).sort()) {
  const eligible = leads.filter(l => l.days >= 1 && l.days <= 20 && !l.pondId && l.phones);
  if (eligible.length > 0) {
    console.log(`  User ${uid} (${leads[0].assignedToName}): ${eligible.length} eligible leads`);
    for (const l of eligible) {
      console.log(`    "${l.name}" — ${l.days} days stale, stage="${l.stage}"`);
    }
  }
}
console.log("\nUsers with 0 eligible leads in window:");
for (const [uid, leads] of Object.entries(byUser).sort()) {
  const eligible = leads.filter(l => l.days >= 1 && l.days <= 20 && !l.pondId && l.phones);
  if (eligible.length === 0) {
    const inWindow = leads.filter(l => l.days >= 1 && l.days <= 20);
    console.log(`  User ${uid} (${leads[0].assignedToName}): 0 eligible (${leads.length} total, ${inWindow.length} in window but filtered out)`);
    for (const l of inWindow) {
      const why = l.pondId ? "pond" : !l.phones ? "no_phone" : "stage_excluded?";
      console.log(`    "${l.name}" days=${l.days} filtered_by=${why} stage="${l.stage}" tags="${l.tags}"`);
    }
  }
}
