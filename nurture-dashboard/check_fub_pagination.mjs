import { config } from "dotenv";
config({ path: ".env" });

const key = process.env.FUB_API_KEY;
if (!key) { console.log("No FUB_API_KEY in env"); process.exit(1); }

const auth = Buffer.from(key + ":").toString("base64");

// Test what the max page size actually is
async function fubGet(path) {
  const res = await fetch("https://api.followupboss.com/v1" + path, {
    headers: {
      "Authorization": "Basic " + auth,
      "X-System": "Lifestyle Command Center",
      "X-System-Key": key,
    }
  });
  if (!res.ok) throw new Error(`FUB ${path} → ${res.status}`);
  return res.json();
}

// Page through all people sorted by lastActivityAt ascending (oldest first)
// so we catch the 1-20 day stale window
const now = Date.now();
const byAgent = {};
let page = 1;
let totalFetched = 0;
let inWindow = 0;
let oldestInWindow = null;
let newestInWindow = null;

// Try different sort orders and offsets
console.log("Testing FUB pagination...");

// First test: what's the actual max limit?
const test100 = await fubGet("/people?limit=100&sort=lastActivityAt&page=1");
const test200 = await fubGet("/people?limit=200&sort=lastActivityAt&page=1");
console.log("limit=100 returned:", (test100.people || []).length, "| total in FUB:", test100.total || "?");
console.log("limit=200 returned:", (test200.people || []).length, "| total in FUB:", test200.total || "?");

// Now paginate to find all leads in the 1-20 day window
console.log("\nPaginating to find all 1-20 day stale leads...");
let offset = 0;
const pageSize = 100;
let keepGoing = true;
let pages = 0;

while (keepGoing && pages < 30) {
  const data = await fubGet(`/people?limit=${pageSize}&sort=lastActivityAt&offset=${offset}`);
  const people = data.people || [];
  pages++;
  totalFetched += people.length;
  
  if (people.length === 0) break;
  
  let anyInWindow = false;
  for (const p of people) {
    const la = p.lastActivity || p.updated;
    if (!la) continue;
    const days = Math.floor((now - new Date(la).getTime()) / 86400000);
    const name = (p.assignedTo && p.assignedTo.name) ? p.assignedTo.name : (p.assignedUserId ? "user_" + p.assignedUserId : "unassigned");
    if (!byAgent[name]) byAgent[name] = { total: 0, inWindow: 0, pond: 0 };
    byAgent[name].total++;
    if (p.assignedPondId) { byAgent[name].pond++; continue; }
    if (days >= 1 && days <= 20) {
      byAgent[name].inWindow++;
      inWindow++;
      anyInWindow = true;
      if (!oldestInWindow || days > oldestInWindow) oldestInWindow = days;
      if (!newestInWindow || days < newestInWindow) newestInWindow = days;
    }
  }
  
  // Check the last person's lastActivity to decide if we should keep going
  const lastPerson = people[people.length - 1];
  const lastLa = lastPerson && (lastPerson.lastActivity || lastPerson.updated);
  if (lastLa) {
    const lastDays = Math.floor((now - new Date(lastLa).getTime()) / 86400000);
    // Stop if the oldest person on this page is more than 25 days stale
    if (lastDays > 25) {
      console.log(`  Page ${pages}: offset=${offset}, last person is ${lastDays} days stale — stopping`);
      keepGoing = false;
    }
  }
  
  console.log(`  Page ${pages}: offset=${offset}, fetched=${people.length}, total so far=${totalFetched}, window leads so far=${inWindow}`);
  offset += pageSize;
  
  if (people.length < pageSize) break; // Last page
}

console.log(`\nTotal fetched: ${totalFetched} | Total in 1-20d window (non-pond): ${inWindow}`);
console.log(`Window range: ${newestInWindow}d to ${oldestInWindow}d stale`);
console.log();
for (const [name, stats] of Object.entries(byAgent).sort()) {
  if (stats.inWindow > 0) {
    console.log(`  ${name}: ${stats.inWindow} leads in window (${stats.total} total, ${stats.pond} pond)`);
  }
}
console.log("\nAgents with 0 leads in window:");
for (const [name, stats] of Object.entries(byAgent).sort()) {
  if (stats.inWindow === 0 && stats.total > 0) {
    console.log(`  ${name}: 0 in window (${stats.total} total, ${stats.pond} pond)`);
  }
}
