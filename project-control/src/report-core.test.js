const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPayload,
  finalizeTask,
  isExcluded,
  parseCommitLog,
  resolveDateSpec,
} = require('./report-core');
const { parseCommitMessage } = require('./protocol');

const config = {
  taskKeyPattern: '\\bMIX7-[0-9]{3,}\\b',
  protocol: {
    taskIdPattern: '^MIX7-[0-9]{3,}$',
    states: ['start', 'work', 'done', 'blocked'],
    staleInProgressDays: 3,
  },
  excludePrefixes: ['frontend/.next/', 'dist/'],
  excludeExact: ['frontend/.env.local'],
  areaRules: [
    {
      label: 'payments / checkout',
      prefixes: ['checkout_', 'payment_'],
    },
    {
      label: 'frontend / web',
      prefixes: ['frontend/'],
    },
  ],
};

test('resolveDateSpec keeps explicit yyyy-mm-dd values', () => {
  assert.equal(resolveDateSpec('2026-04-06'), '2026-04-06');
});

test('parseCommitMessage accepts good protocol commit', () => {
  assert.deepEqual(parseCommitMessage('MIX7-031 work: session bootstrap'), {
    valid: true,
    taskId: 'MIX7-031',
    state: 'work',
    description: 'session bootstrap',
    errors: [],
  });
});

test('parseCommitMessage rejects commit without task id and state', () => {
  const parsed = parseCommitMessage('fix session');
  assert.equal(parsed.valid, false);
  assert.match(parsed.errors.join(' '), /нет TASK ID/);
  assert.match(parsed.errors.join(' '), /нет lifecycle state/);
});

test('isExcluded filters build artifacts and local env files', () => {
  assert.equal(isExcluded('frontend/.next/cache/file', config), true);
  assert.equal(isExcluded('frontend/.env.local', config), true);
  assert.equal(isExcluded('frontend/app/page.tsx', config), false);
});

test('finalizeTask computes deterministic score and effort', () => {
  const task = finalizeTask({
    key: 'checkout',
    state: 'done',
    title: 'checkout',
    latestDate: '2026-04-06',
    latestHash: 'abc',
    latestSubject: 'MIX7-031 done: checkout',
    events: [{ hash: 'abc', date: '2026-04-06', state: 'done', subject: 'MIX7-031 done: checkout' }],
    files: new Map([
      ['checkout_order_route.ts', { path: 'checkout_order_route.ts' }],
      ['checkout_order_route.test.ts', { path: 'checkout_order_route.test.ts' }],
    ]),
    areas: new Set(['payments / checkout']),
    linesChanged: 140,
    testFiles: 1,
    docFiles: 0,
    sourceFiles: 1,
    structuredCommits: 1,
  });

  assert.equal(task.qualityScore, 10);
  assert.equal(task.effortBand, '~2–4ч');
});

test('parseCommitLog attaches protocol metadata to commits', () => {
  const commits = parseCommitLog([
    '__COMMIT__\tabc123\t2026-04-06\tMIX7-031 done: session bootstrap',
    '10\t2\tcheckout_order_route.ts',
  ].join('\n'), config);

  assert.equal(commits[0].protocol.valid, true);
  assert.equal(commits[0].protocol.taskId, 'MIX7-031');
  assert.equal(commits[0].protocol.state, 'done');
});

test('buildPayload derives protocol task states and violations deterministically', () => {
  const payload = buildPayload(process.cwd(), '2026-03-28', require('../config.json'));
  assert.ok(Array.isArray(payload.completedTasks));
  assert.ok(Array.isArray(payload.inProgressTasks));
  assert.ok(Array.isArray(payload.blockedTasks));
  assert.ok(Array.isArray(payload.protocolViolations));
});
