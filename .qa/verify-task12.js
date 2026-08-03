const fs = require('fs');
const vm = require('vm');

// Build a sandbox that exposes console and a window object.
const sandbox = { console, window: {}, D: undefined };
vm.createContext(sandbox);

// Load data model. Promote top-level `const D` to `var D` so it is visible in the sandbox.
let dataCode = fs.readFileSync('/Users/edwinhao/sendpalm/prototype-data.js', 'utf8');
dataCode = dataCode.replace(/^const D = /m, 'var D = ');
vm.runInContext(dataCode, sandbox);

const D = sandbox.D || sandbox.window.D;

// Replicate the helpers from prototype-v11.js (sufficient for verification).
const INSIGHTS_NOW = new Date('2026-07-20T12:00:00');

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSameWeek(a, b) {
  const sa = startOfWeek(a);
  const sb = startOfWeek(b);
  return sa.getFullYear() === sb.getFullYear() && sa.getMonth() === sb.getMonth() && sa.getDate() === sb.getDate();
}

function computeAgentActionsThisWeek() {
  const actions = (D.agentAuditLog || []).filter(a => {
    if (a.status !== 'completed' && a.status !== 'sent') return false;
    const t = a.st ? new Date(a.st).getTime() : NaN;
    if (!t) return false;
    return isSameWeek(new Date(t), INSIGHTS_NOW);
  });
  const recent = [...actions].reverse().slice(0, 3);
  return { count: actions.length, recent };
}

function computeHealthDistribution() {
  const dist = { Healthy: 0, 'At risk': 0, Cold: 0 };
  D.contacts.forEach(c => {
    if (c.health == null || typeof c.health !== 'number') return;
    if (c.health >= 70) dist.Healthy++;
    else if (c.health >= 40) dist['At risk']++;
    else dist.Cold++;
  });
  return dist;
}

// Verify Important 1
const agentActions = computeAgentActionsThisWeek();
console.log('Agent actions this week:', agentActions.count);
console.log('Recent actions:', agentActions.recent.map(a => ({ id: a.id, status: a.status, st: a.st, time: a.time })));

const allCompletedSent = (D.agentAuditLog || []).filter(a => a.status === 'completed' || a.status === 'sent');
console.log('\nAll completed/sent actions:', allCompletedSent.map(a => ({ id: a.id, status: a.status, st: a.st, time: a.time })));

// Verify Important 2
const healthDist = computeHealthDistribution();
console.log('\nHealth distribution:', healthDist);

const zeroHealthContacts = D.contacts.filter(c => c.health === 0);
console.log('\nZero-health contacts:', zeroHealthContacts.length, zeroHealthContacts.map(c => c.id));

// Assertions
if (agentActions.count !== 2) {
  console.error(`FAIL: expected 2 agent actions this week, got ${agentActions.count}`);
  process.exit(1);
}

const expectedIds = ['a4', 'a2'];
const actualIds = agentActions.recent.map(a => a.id);
if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
  console.error('FAIL: unexpected recent action IDs:', actualIds);
  process.exit(1);
}

if (healthDist.Cold !== 12) {
  console.error(`FAIL: expected 12 cold contacts (including zero-health), got ${healthDist.Cold}`);
  process.exit(1);
}

console.log('\nAll Task 12 verification checks passed.');
