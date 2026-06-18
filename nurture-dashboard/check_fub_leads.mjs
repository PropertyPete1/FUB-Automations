import { config } from "dotenv";
config({ path: ".env" });

const key = process.env.FUB_API_KEY;
if (!key) { console.log("No FUB_API_KEY in env"); process.exit(1); }

const auth = Buffer.from(key + ":").toString("base64");
const res = await fetch("https://api.followupboss.com/v1/people?limit=500&sort=lastActivityAt", {
  headers: {
    "Authorization": "Basic " + auth,
    "X-System": "Lifestyle Command Center",
    "X-System-Key": key,
  }
});
const data = await res.json();
const people = data.people || [];
const now = Date.now();
const byAgent = {};
let inWindow = 0;

for (const p of people) {
  const la = p.lastActivity || p.updated;
  if (!la) continue;
  const days = Math.floor((now - new Date(la).getTime()) / 86400000);
  const name = (p.assignedTo && p.assignedTo.name) ? p.assignedTo.name : (p.assignedUserId ? "user_" + p.assignedUserId : "unassigned");
  if (!byAgent[name]) byAgent[name] = { total: 0, inWindow: 0, pond: 0, buckets: {} };
  byAgent[name].total++;
  if (p.assignedPondId) { byAgent[name].pond++; continue; }
  const bucket = days <= 0 ? "0d" : days <= 5 ? "1-5d" : days <= 10 ? "6-10d" : days <= 15 ? "11-15d" : days <= 20 ? "16-20d" : "20+d";
  byAgent[name].buckets[bucket] = (byAgent[name].buckets[bucket] || 0) + 1;
  if (days >= 1 && days <= 20) { byAgent[name].inWindow++; inWindow++; }
}

console.log("Total people fetched:", people.length, "| In 1-20d window (non-pond):", inWindow);
console.log();
for (const [name, stats] of Object.entries(byAgent).sort()) {
  if (stats.total > 0) {
    console.log(`${name}: total=${stats.total} pond=${stats.pond} inWindow=${stats.inWindow} buckets=${JSON.stringify(stats.buckets)}`);
  }
}
