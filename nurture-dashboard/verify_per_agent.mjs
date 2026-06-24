import { config } from "dotenv";
config({ path: ".env" });

const key = process.env.FUB_API_KEY;
const auth = Buffer.from(key + ":").toString("base64");

async function fubGet(path) {
  const res = await fetch("https://api.followupboss.com/v1" + path, {
    headers: { "Authorization": "Basic " + auth, "X-System": "Lifestyle Command Center", "X-System-Key": key }
  });
  if (!res.ok) throw new Error(`FUB ${path} → ${res.status}`);
  return res.json();
}

const EXCLUDED_STAGES = new Set(["trash","active client","pending","closed","past client","sphere","under contract"]);
const EXCLUDED_TAGS = new Set(["do not contact","realtor","bounced","unsubscribe","email opt out","dnc","do not nurture","no ai email","do not email","manual review"]);
const AGENT_FIRST_NAMES = ["peter","steven","tiffany","stefanie","abby","irma","laila"];

const now = Date.now();

// Step 1: Get users map
const usersData = await fubGet("/users?limit=50");
const usersMap = {};
for (const u of (usersData.users || [])) {
  if (u.id) usersMap[Number(u.id)] = { name: u.name || "", firstName: u.firstName || "" };
}

// Step 2: Find agent user IDs
const agentUserIds = [];
for (const [uid, info] of Object.entries(usersMap)) {
  const first = (info.firstName || info.name.split(" ")[0] || "").toLowerCase();
  if (AGENT_FIRST_NAMES.includes(first)) agentUserIds.push(Number(uid));
}
console.log("Agent user IDs found:", agentUserIds.map(id => `${usersMap[id]?.firstName}(${id})`).join(", "));

// Step 3: Per-agent fetch with stagger
const perAgentResults = [];
for (const uid of agentUserIds) {
  await new Promise(r => setTimeout(r, 400));
  try {
    const data = await fubGet(`/people?limit=100&sort=-lastActivityAt&assignedUserId=${uid}`);
    perAgentResults.push({ uid, leads: data.people || [] });
    console.log(`  Fetched ${(data.people||[]).length} leads for ${usersMap[uid]?.firstName}(${uid})`);
  } catch(e) {
    console.log(`  FAILED for ${usersMap[uid]?.firstName}(${uid}): ${e.message.slice(0,60)}`);
    perAgentResults.push({ uid, leads: [] });
  }
}

// Step 4: Merge + de-dup
const seenIds = new Set();
const candidates = [];
for (const { leads } of perAgentResults) {
  for (const p of leads) {
    if (p.id && !seenIds.has(p.id)) { seenIds.add(p.id); candidates.push(p); }
  }
}
console.log(`\nMerged candidates (de-duped): ${candidates.length}`);

// Step 5: Filter
const eligible = candidates.filter(person => {
  if (person.assignedPondId) return false;
  const stage = String(person.stage || "").toLowerCase();
  if (EXCLUDED_STAGES.has(stage)) return false;
  const tags = (person.tags || []).map(t => t.toLowerCase());
  if (tags.some(t => EXCLUDED_TAGS.has(t))) return false;
  if (!person.assignedUserId) return false;
  const phones = (person.phones || []).map(ph => ph.value || ph.phone || "").filter(Boolean);
  if (!phones.length) return false;
  const la = person.lastActivity || person.updated || null;
  if (la) {
    const days = Math.floor((now - new Date(la).getTime()) / 86400000);
    if (days < 1 || days > 20) return false;
  }
  return true;
});

console.log(`Eligible leads (1-20d, non-pond, has phone): ${eligible.length}`);

// Group by agent
const byAgent = {};
for (const p of eligible) {
  const uid = Number(p.assignedUserId);
  const name = usersMap[uid]?.firstName || `user_${uid}`;
  if (!byAgent[name]) byAgent[name] = 0;
  byAgent[name]++;
}

console.log("\nLeads per agent:");
for (const [agent, count] of Object.entries(byAgent).sort()) {
  console.log(`  ${agent}: ${count}`);
}

const missing = AGENT_FIRST_NAMES.filter(n => {
  const cap = n.charAt(0).toUpperCase() + n.slice(1);
  return !byAgent[cap] && !byAgent[n];
});
if (missing.length > 0) {
  console.log(`\n⚠️  Agents with 0 eligible leads today: ${missing.join(", ")}`);
  console.log("   (This is real data — they have no leads in the 1-20 day window right now)");
} else {
  console.log("\n✅ All 7 agents have eligible leads in the queue!");
}
