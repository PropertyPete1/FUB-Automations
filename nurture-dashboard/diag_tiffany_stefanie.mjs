import { config } from "dotenv";
config({ path: ".env" });

const key = process.env.FUB_API_KEY;
const auth = Buffer.from(key + ":").toString("base64");

async function fubGet(path) {
  await new Promise(r => setTimeout(r, 300));
  const res = await fetch("https://api.followupboss.com/v1" + path, {
    headers: { "Authorization": "Basic " + auth, "X-System": "Lifestyle Command Center", "X-System-Key": key }
  });
  if (!res.ok) throw new Error(`FUB ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

const now = Date.now();

// Check Tiffany (20) and Stefanie (31) directly — no sort filter so we get ALL their leads
for (const [name, id] of [["Tiffany", 20], ["Stefanie", 31], ["Abby", 28], ["Irma", 33]]) {
  console.log(`\n=== ${name} (user_id=${id}) ===`);
  try {
    // Use assignedUserId filter to get ALL their leads regardless of activity date
    const data = await fubGet(`/people?limit=50&assignedUserId=${id}`);
    const leads = data.people || [];
    console.log(`Total leads assigned: ${leads.length}`);
    for (const l of leads) {
      const la = l.lastActivity || l.updated || null;
      const days = la ? Math.floor((now - new Date(la).getTime()) / 86400000) : 999;
      const phones = (l.phones || []).map(ph => ph.value || ph.phone || "").filter(Boolean);
      const pondId = l.assignedPondId || null;
      const stage = l.stage || "?";
      const inWindow = days >= 1 && days <= 20;
      const flag = pondId ? `POND` : !phones.length ? `NO_PHONE` : inWindow ? `✅ IN_WINDOW` : days < 1 ? `TOO_FRESH(${days}d)` : `TOO_OLD(${days}d)`;
      console.log(`  "${l.name}" — ${days}d stale, stage="${stage}" ${flag}`);
    }
  } catch(e) {
    console.log(`  Error: ${e.message.slice(0,100)}`);
  }
}
