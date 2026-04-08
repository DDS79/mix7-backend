const fs = require('fs');
const path = require('path');
const { buildPayload, loadConfig, resolveDateSpec } = require('./report-core');

const ALERT_DEFINITIONS = {
  PROTOCOL_VIOLATION: {
    code: 'PROTOCOL_VIOLATION',
    label: 'Нарушение протокола',
    severity: 'critical',
    deterministic: true,
  },
  TASK_STUCK: {
    code: 'TASK_STUCK',
    label: 'Задача зависла',
    severity: 'high',
    deterministic: true,
  },
  ZOMBIE_TASK: {
    code: 'ZOMBIE_TASK',
    label: 'Зомби-задача',
    severity: 'warning',
    deterministic: 'bounded-heuristic',
  },
  SILENT_WORK: {
    code: 'SILENT_WORK',
    label: 'Тихая работа',
    severity: 'deferred',
    deterministic: false,
  },
};

function buildAlert(alert) {
  return {
    ...ALERT_DEFINITIONS[alert.code],
    ...alert,
  };
}

function groupBySeverity(alerts) {
  const buckets = {
    critical: [],
    high: [],
    warning: [],
  };

  for (const alert of alerts) {
    if (buckets[alert.severity]) {
      buckets[alert.severity].push(alert);
    }
  }

  return buckets;
}

function buildAlertsFromPayload(payload, config) {
  const alerts = [];
  const stuckDays = config.alerts?.taskStuckDays ?? config.protocol?.staleInProgressDays ?? 3;
  const zombieDays = config.alerts?.zombieTaskDays ?? 7;

  if (config.alerts?.enable?.PROTOCOL_VIOLATION !== false) {
    for (const violation of payload.protocolViolations) {
      alerts.push(buildAlert({
        code: 'PROTOCOL_VIOLATION',
        subject: violation.message,
        evidence: violation.message,
      }));
    }
  }

  if (config.alerts?.enable?.TASK_STUCK !== false) {
    for (const task of payload.inProgressTasks) {
      const lastTime = new Date(`${task.latestDate}T00:00:00Z`).getTime();
      const reportTime = new Date(`${payload.reportDate}T00:00:00Z`).getTime();
      const ageDays = Math.floor((reportTime - lastTime) / 86400000);

      if (ageDays >= stuckDays) {
        alerts.push(buildAlert({
          code: 'TASK_STUCK',
          taskId: task.key,
          subject: `${task.key} — нет нового протокольного commit ${ageDays} дн., последнее состояние ${task.state}`,
          evidence: `Последний lifecycle commit: ${task.latestDate} ${task.latestHash.slice(0, 7)} (${task.state})`,
          ageDays,
          state: task.state,
        }));
      }
    }
  }

  if (config.alerts?.enable?.ZOMBIE_TASK !== false) {
    for (const task of payload.inProgressTasks) {
      const lastTime = new Date(`${task.latestDate}T00:00:00Z`).getTime();
      const reportTime = new Date(`${payload.reportDate}T00:00:00Z`).getTime();
      const ageDays = Math.floor((reportTime - lastTime) / 86400000);

      if (ageDays >= zombieDays) {
        alerts.push(buildAlert({
          code: 'ZOMBIE_TASK',
          taskId: task.key,
          subject: `${task.key} — нет ` + '`done`' + ' / ' + '`blocked`' + ` и нет прогресса ${ageDays} дн.`,
          evidence: `Последний lifecycle commit: ${task.latestDate} ${task.latestHash.slice(0, 7)} (${task.state}); после этого нет новых protocol events`,
          ageDays,
          state: task.state,
        }));
      }
    }
  }

  return alerts;
}

function buildAlertPayload(repoRoot, reportDate, config = loadConfig(repoRoot)) {
  const normalizedDate = resolveDateSpec(reportDate);
  const reportPayload = buildPayload(repoRoot, normalizedDate, config);
  const alerts = buildAlertsFromPayload(reportPayload, config);

  return {
    reportDate: normalizedDate,
    timezone: config.alerts?.timezone || 'UTC',
    alerts,
    grouped: groupBySeverity(alerts),
    deferred: [
      {
        code: 'SILENT_WORK',
        reason: 'Не реализовано сейчас: из git нельзя честно доказать ожидаемое рабочее окно без внешнего календарного контракта.',
      },
    ],
    source: {
      branch: reportPayload.branch,
      branchStatus: reportPayload.branchStatus,
      protocolTaskCount: reportPayload.completedTasks.length + reportPayload.inProgressTasks.length + reportPayload.blockedTasks.length,
      protocolViolationCount: reportPayload.protocolViolations.length,
    },
  };
}

function formatAlert(alert) {
  const header = alert.taskId
    ? `- ${alert.taskId} — ${alert.label}`
    : `- ${alert.label}`;
  const lines = [header];
  lines.push(`  Причина: ${alert.subject}`);
  if (alert.state) {
    lines.push(`  Состояние: ${alert.state}`);
  }
  if (typeof alert.ageDays === 'number') {
    lines.push(`  Признак: нет нового протокольного commit > ${alert.ageDays} дн.`);
  }
  lines.push(`  Доказательство: ${alert.evidence}`);
  return lines.join('\n');
}

function buildAlertText(payload, full = false) {
  const lines = [];
  lines.push(`АЛЕРТЫ — ${payload.reportDate}`);
  lines.push('');
  lines.push('Критические:');
  if (payload.grouped.critical.length === 0) {
    lines.push('- Нет');
  } else {
    for (const alert of payload.grouped.critical) {
      lines.push(full ? formatAlert(alert) : `- ${alert.subject}`);
    }
  }
  lines.push('');
  lines.push('Важные:');
  if (payload.grouped.high.length === 0) {
    lines.push('- Нет');
  } else {
    for (const alert of payload.grouped.high) {
      lines.push(full ? formatAlert(alert) : `- ${alert.subject}`);
    }
  }
  lines.push('');
  lines.push('Предупреждения:');
  if (payload.grouped.warning.length === 0) {
    lines.push('- Нет');
  } else {
    for (const alert of payload.grouped.warning) {
      lines.push(full ? formatAlert(alert) : `- ${alert.subject}`);
    }
  }
  lines.push('');
  lines.push('Отложено:');
  for (const item of payload.deferred) {
    lines.push(`- ${item.code}: ${item.reason}`);
  }

  return `${lines.join('\n')}\n`;
}

function persistAlertArtifacts(repoRoot, payload, text, full) {
  const alertsDir = path.join(repoRoot, 'project-control', 'alerts');
  fs.mkdirSync(alertsDir, { recursive: true });
  const suffix = full ? '-full' : '';

  fs.writeFileSync(
    path.join(alertsDir, `${payload.reportDate}${suffix}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(alertsDir, `${payload.reportDate}${suffix}.txt`),
    text,
    'utf8'
  );
}

module.exports = {
  ALERT_DEFINITIONS,
  buildAlertPayload,
  buildAlertText,
  buildAlertsFromPayload,
  groupBySeverity,
  persistAlertArtifacts,
};
