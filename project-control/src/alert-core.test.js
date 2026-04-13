const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAlertsFromPayload, buildAlertText } = require('./alert-core');

const config = {
  alerts: {
    taskStuckDays: 3,
    zombieTaskDays: 7,
    enable: {
      PROTOCOL_VIOLATION: true,
      TASK_STUCK: true,
      ZOMBIE_TASK: true,
      SILENT_WORK: false,
    },
  },
};

test('protocol violations become critical alerts', () => {
  const alerts = buildAlertsFromPayload({
    reportDate: '2026-04-06',
    protocolViolations: [{ message: 'commit abc123 нарушает протокол' }],
    inProgressTasks: [],
  }, config);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].code, 'PROTOCOL_VIOLATION');
  assert.equal(alerts[0].severity, 'critical');
});

test('untracked-only protocol violation is warning, not critical', () => {
  const alerts = buildAlertsFromPayload({
    reportDate: '2026-04-06',
    protocolViolations: [{
      type: 'working_tree_untracked',
      severity: 'warning',
      message: 'Есть untracked-файлы (2); это сигнал к разбору, но не critical без tracked-изменений.',
    }],
    inProgressTasks: [],
  }, config);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].code, 'PROTOCOL_VIOLATION');
  assert.equal(alerts[0].severity, 'warning');
});

test('stuck task triggers without false positive on recent work', () => {
  const alerts = buildAlertsFromPayload({
    reportDate: '2026-04-06',
    protocolViolations: [],
    inProgressTasks: [
      { key: 'MIX7-041', latestDate: '2026-04-02', latestHash: 'aaaaaaa', state: 'work' },
      { key: 'MIX7-042', latestDate: '2026-04-05', latestHash: 'bbbbbbb', state: 'work' },
    ],
  }, config);

  assert.equal(alerts.some((item) => item.code === 'TASK_STUCK' && item.taskId === 'MIX7-041'), true);
  assert.equal(alerts.some((item) => item.code === 'TASK_STUCK' && item.taskId === 'MIX7-042'), false);
});

test('zombie task triggers only after longer threshold', () => {
  const alerts = buildAlertsFromPayload({
    reportDate: '2026-04-10',
    protocolViolations: [],
    inProgressTasks: [
      { key: 'MIX7-050', latestDate: '2026-04-01', latestHash: 'ccccccc', state: 'start' },
    ],
  }, config);

  assert.equal(alerts.some((item) => item.code === 'ZOMBIE_TASK' && item.taskId === 'MIX7-050'), true);
});

test('alert text is deterministic and russian owner-readable', () => {
  const text = buildAlertText({
    reportDate: '2026-04-06',
    grouped: {
      critical: [{ subject: 'commit abc нарушает протокол' }],
      high: [],
      warning: [],
    },
    deferred: [{ code: 'SILENT_WORK', reason: 'deferred' }],
  }, false);

  assert.match(text, /АЛЕРТЫ — 2026-04-06/);
  assert.match(text, /Критические:/);
  assert.match(text, /Отложено:/);
});
