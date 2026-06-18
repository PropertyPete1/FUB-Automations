import { getDashboardStats, getPendingQueue } from './server/dashboardData.ts';

const apiKey = process.env.FUB_API_KEY || 'fka_0fGK8UiS2dgAo38OVSFUlMW7247Rm5HFax';

console.log('Testing getDashboardStats...');
const stats = await getDashboardStats(apiKey);
console.log('generated_at:', stats.generated_at);
console.log('counts sample:', JSON.stringify(stats.counts.slice(0, 3)));
console.log('timeline rows:', stats.timeline.length);
console.log('suppressions:', stats.suppressions.length);
console.log('cities:', stats.cities.length);
console.log('recent_activity:', stats.recent_activity.length);
console.log('agent_clicks:', JSON.stringify(stats.agent_clicks));
console.log('conversions:', JSON.stringify(stats.conversions));

console.log('\nTesting getPendingQueue...');
const queue = await getPendingQueue(apiKey);
console.log('Queue length:', queue.length);
if (queue[0]) {
  const sample = { ...queue[0], phone: '***', sms_link: queue[0].sms_link.slice(0, 80) + '...' };
  console.log('Queue[0]:', JSON.stringify(sample, null, 2));
}
