import { config } from "dotenv";
config({ path: ".env" });

const key = process.env.FUB_API_KEY;
if (!key) { console.log("No FUB_API_KEY"); process.exit(1); }

const auth = Buffer.from(key + ":").toString("base64");

async function fubGet(path) {
  const res = await fetch("https://api.followupboss.com/v1" + path, {
    headers: { "Authorization": "Basic " + auth, "X-System": "Lifestyle Command Center", "X-System-Key": key }
  });
  if (!res.ok) throw new Error(`FUB ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// All 7 agents with their FUB user IDs
const AGENTS = [
  { name: "Laila",    id: 35 },
  { name: "Peter",    id: 2  },
  { name: "Steven",   id: 1  },
  { name: "Tiffany",  id: 20 },
  { name: "Abby",     id: 28 },
  { name: "Irma",     id: 33 },
  { name: "Stefanie", id: 31 },
];

const EXCLUDED_STAGES = new Set(["closed","closed - lost","not interested","do not contact","withdrawn","deleted","spam","duplicate"]);
const EXCLUDED_TAGS = new Set(["do not contact","dnc","spam","duplicate","test","do not email","manual review"]);

const now = Date.now();

// Get the full 100-result descending list
const peopleData = await fubGet("/people?limit=500&sort=-lastActivityAt");
const allPeople = peopleData.people || [];
console.log(`FUB returned ${allPeople.length} people total\n`);

// Group by assignedUserId
const byUserId = {};
for (const p of allPeople) {
  const uid = p.assignedUserId;
  if (!uid) continue;
  if (!byUserId[uid]) byUserId[uid] = [];
  byUserId[uid].push(p);
}

for (const agent of AGENTS) {
  const leads = byUserId[agent.id] || [];
  console.log(`\n=== ${agent.name} (user_id=${agent.id}) — ${leads.length} leads in FUB response ===`);
  
  if (leads.length === 0) {
    console.log(`  ⚠️  NOT IN TOP 100 — their leads are beyond position 100 in the FUB response`);
    // Try a direct per-agent query
    try {
      await new Promise(r => setTimeout(r, 500)); // rate limit buffer
      const agentData = await fubGet(`/people?limit=20&sort=-lastActivityAt&assignedTo=${agent.id}`);
      const agentLeads = agentData.people || [];
      console.log(`  Direct query (assignedTo=${agent.id}): ${agentLeads.length} leads`);
      for (const l of agentLeads.slice(0, 5)) {
        const la = l.lastActivity || l.updated;
        const days = la ? Math.floor((now - new Date(la).getTime()) / 86400000) : 999;
        const phones = (l.phones || []).map(ph => ph.value || ph.phone || "").filter(Boolean);
        const pondId = l.assignedPondId || null;
        const stage = l.stage || "?";
        const tags = (l.tags || []).join(",");
        const inWindow = days >= 1 && days <= 20;
        const flags = [];
        if (pondId) flags.push(`POND=${pondId}`);
        if (!phones.length) flags.push("NO_PHONE");
        if (EXCLUDED_STAGES.has(stage.toLowerCase())) flags.push(`EXCLUDED_STAGE="${stage}"`);
        if ((l.tags||[]).some(t => EXCLUDED_TAGS.has(t.toLowerCase()))) flags.push("EXCLUDED_TAG");
        if (inWindow && !flags.length) flags.push("✅ELIGIBLE");
        else if (inWindow) flags.push("⚠️IN_WINDOW_BUT_FILTERED");
        console.log(`    "${l.name}" days=${days} stage="${stage}" ${flags.join(" ")}`);
      }
    } catch (e) {
      console.log(`  Direct query failed: ${e.message.slice(0, 80)}`);
    }
    continue;
  }
  
  let eligible = 0;
  let filtered = { pond: 0, stage: 0, tag: 0, noPhone: 0, outOfWindow: 0 };
  
  for (const p of leads) {
    const la = p.lastActivity || p.updated;
    const days = la ? Math.floor((now - new Date(la).getTime()) / 86400000) : 999;
    const phones = (p.phones || []).map(ph => ph.value || ph.phone || "").filter(Boolean);
    const stage = String(p.stage || "").toLowerCase();
    const tags = (p.tags || []).map(t => t.toLowerCase());
    
    if (p.assignedPondId) { filtered.pond++; continue; }
    if (EXCLUDED_STAGES.has(stage)) { filtered.stage++; continue; }
    if (tags.some(t => EXCLUDED_TAGS.has(t))) { filtered.tag++; continue; }
    if (!phones.length) { filtered.noPhone++; continue; }
    if (days < 1 || days > 20) { filtered.outOfWindow++; continue; }
    
    eligible++;
    console.log(`  ✅ "${p.name}" — ${days}d stale, stage="${p.stage}"`);
  }
  
  if (eligible === 0) {
    console.log(`  ❌ 0 eligible leads. Filtered: pond=${filtered.pond} stage=${filtered.stage} tag=${filtered.tag} noPhone=${filtered.noPhone} outOfWindow=${filtered.outOfWindow}`);
    // Show the in-window leads that got filtered
    for (const p of leads) {
      const la = p.lastActivity || p.updated;
      const days = la ? Math.floor((now - new Date(la).getTime()) / 86400000) : 999;
      if (days < 1 || days > 20) continue;
      const phones = (p.phones || []).map(ph => ph.value || ph.phone || "").filter(Boolean);
      const stage = String(p.stage || "").toLowerCase();
      const tags = (p.tags || []).map(t => t.toLowerCase());
      const why = p.assignedPondId ? `pond=${p.assignedPondId}` : EXCLUDED_STAGES.has(stage) ? `stage="${p.stage}"` : tags.some(t => EXCLUDED_TAGS.has(t)) ? `tag="${tags.find(t => EXCLUDED_TAGS.has(t))}"` : !phones.length ? "no_phone" : "?";
      console.log(`  ⚠️  "${p.name}" days=${days} FILTERED_BY: ${why}`);
    }
  } else {
    console.log(`  Total: ${eligible} eligible, filtered: pond=${filtered.pond} stage=${filtered.stage} tag=${filtered.tag} noPhone=${filtered.noPhone} outOfWindow=${filtered.outOfWindow}`);
  }
}
