const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const {
  PROTOCOL_STATES,
  parseCommitMessage,
} = require('./protocol');

function runGit(repoRoot, args) {
  const result = cp.spawnSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }

  return result.stdout;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadConfig(repoRoot) {
  const configPath = path.join(repoRoot, 'project-control', 'config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveDateSpec(dateSpec) {
  if (!dateSpec) {
    throw new Error('DATE is required');
  }

  const now = new Date();
  const localNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (dateSpec === 'today') {
    return formatLocalDate(localNow);
  }

  if (dateSpec === 'yesterday') {
    const yesterday = new Date(localNow);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatLocalDate(yesterday);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateSpec)) {
    return dateSpec;
  }

  throw new Error(`Unsupported DATE value: ${dateSpec}`);
}

function isExcluded(filePath, config) {
  if (!filePath) {
    return true;
  }

  if (config.excludeExact.includes(filePath)) {
    return true;
  }

  return config.excludePrefixes.some((prefix) => filePath.startsWith(prefix));
}

function deriveArea(filePath, config) {
  const rule = config.areaRules.find((candidate) =>
    candidate.prefixes.some((prefix) => filePath.startsWith(prefix))
  );

  return rule ? rule.label : 'misc / uncategorized';
}

function parseCommitLog(raw, config) {
  const commits = [];
  let current = null;

  for (const line of raw.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    if (line.startsWith('__COMMIT__\t')) {
      const [, hash, date, subject] = line.split('\t');
      current = {
        hash,
        date,
        subject,
        files: [],
        protocol: parseCommitMessage(subject),
      };
      commits.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    const parts = line.split('\t');
    if (parts.length !== 3) {
      continue;
    }

    const filePath = parts[2];
    if (isExcluded(filePath, config)) {
      continue;
    }

    current.files.push({
      added: parts[0] === '-' ? 0 : Number(parts[0]),
      deleted: parts[1] === '-' ? 0 : Number(parts[1]),
      path: filePath,
      area: deriveArea(filePath, config),
    });
  }

  return commits;
}

function parseStatus(raw, config) {
  const items = [];

  for (const line of raw.split('\n')) {
    if (!line.trim() || line.startsWith('## ')) {
      continue;
    }

    const statusCode = line.slice(0, 2).trim();
    let filePath = line.slice(3).trim();

    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ')[1];
    }

    if (isExcluded(filePath, config)) {
      continue;
    }

    items.push({
      statusCode: statusCode || '??',
      path: filePath,
      tracked: statusCode !== '??',
      area: deriveArea(filePath, config),
    });
  }

  return items;
}

function estimateEffort(task) {
  const files = task.fileCount;
  const lines = task.linesChanged;

  if (lines > 0) {
    if (lines <= 40) return '~0.5–1ч';
    if (lines <= 120) return '~1–2ч';
    if (lines <= 320) return '~2–4ч';
    return '~4–8ч';
  }

  if (files <= 2) return '~0.5–1ч';
  if (files <= 5) return '~1–2ч';
  if (files <= 12) return '~2–4ч';
  return '~4–8ч';
}

function scoreTask(task) {
  const baseByState = {
    done: 7,
    blocked: 4,
    start: 5,
    work: 6,
  };

  let score = baseByState[task.state] ?? 5;

  if (task.testFiles > 0) score += 2;
  if (task.docFiles > 0) score += 1;
  if (task.testFiles > 0 && task.sourceFiles > 0) score += 1;
  if (task.fileCount > 12) score -= 1;
  if (task.areaCount > 2) score -= 1;
  if (task.eventCount > 3) score += 1;

  return clamp(score, 0, 10);
}

function finalizeTask(task) {
  const files = Array.from(task.files.values()).sort((a, b) =>
    a.path.localeCompare(b.path, 'ru')
  );

  const areaNames = Array.from(task.areas).sort((a, b) =>
    a.localeCompare(b, 'ru')
  );

  const eventCount = task.events.length;

  return {
    ...task,
    files,
    fileCount: files.length,
    areaCount: areaNames.length,
    areaNames,
    eventCount,
    qualityScore: scoreTask({
      ...task,
      fileCount: files.length,
      areaCount: areaNames.length,
      eventCount,
    }),
    effortBand: estimateEffort({
      ...task,
      fileCount: files.length,
    }),
  };
}

function buildSignals(repoRoot, reportDate, config) {
  const historyRaw = runGit(repoRoot, [
    'log',
    '--reverse',
    '--date=short',
    `--until=${reportDate} 23:59:59`,
    '--pretty=format:__COMMIT__\t%H\t%ad\t%s',
    '--numstat',
    '--no-renames',
  ]);
  const dayRaw = runGit(repoRoot, [
    'log',
    '--date=short',
    `--since=${reportDate} 00:00:00`,
    `--until=${reportDate} 23:59:59`,
    '--pretty=format:__COMMIT__\t%H\t%ad\t%s',
    '--numstat',
    '--no-renames',
  ]);
  const statusRaw = runGit(repoRoot, ['status', '--short', '--branch', '-uall']);
  const untrackedRaw = runGit(repoRoot, ['ls-files', '--others', '--exclude-standard']);
  const branch = runGit(repoRoot, ['branch', '--show-current']).trim();

  return {
    historyCommits: parseCommitLog(historyRaw, config),
    dayCommits: parseCommitLog(dayRaw, config),
    statusItems: parseStatus(statusRaw, config),
    branchStatus: statusRaw.split('\n')[0] || '',
    branch,
    rawUntrackedCount: untrackedRaw
      .split('\n')
      .filter((line) => line.trim())
      .length,
  };
}

function buildProtocolTasks(historyCommits, reportDate) {
  const tasks = new Map();

  for (const commit of historyCommits) {
    if (!commit.protocol.valid || !PROTOCOL_STATES.includes(commit.protocol.state)) {
      continue;
    }

    const taskId = commit.protocol.taskId;
    const existing = tasks.get(taskId) || {
      key: taskId,
      title: commit.protocol.description,
      state: commit.protocol.state,
      latestDate: commit.date,
      latestHash: commit.hash,
      latestSubject: commit.subject,
      events: [],
      files: new Map(),
      areas: new Set(),
      linesChanged: 0,
      testFiles: 0,
      docFiles: 0,
      sourceFiles: 0,
    };

    existing.title = commit.protocol.description;
    existing.state = commit.protocol.state;
    existing.latestDate = commit.date;
    existing.latestHash = commit.hash;
    existing.latestSubject = commit.subject;
    existing.events.push({
      hash: commit.hash,
      date: commit.date,
      state: commit.protocol.state,
      subject: commit.subject,
    });

    for (const file of commit.files) {
      existing.files.set(file.path, file);
      existing.areas.add(file.area);
      existing.linesChanged += file.added + file.deleted;

      if (file.path.includes('.test.')) {
        existing.testFiles += 1;
      } else if (file.area === 'docs / process') {
        existing.docFiles += 1;
      } else {
        existing.sourceFiles += 1;
      }
    }

    tasks.set(taskId, existing);
  }

  const allTasks = Array.from(tasks.values()).map((task) => finalizeTask(task));

  return {
    completedTasks: allTasks
      .filter((task) => task.state === 'done' && task.latestDate === reportDate)
      .sort((a, b) => a.key.localeCompare(b.key, 'ru')),
    inProgressTasks: allTasks
      .filter((task) => task.state === 'start' || task.state === 'work')
      .sort((a, b) => a.key.localeCompare(b.key, 'ru')),
    blockedTasks: allTasks
      .filter((task) => task.state === 'blocked')
      .sort((a, b) => a.key.localeCompare(b.key, 'ru')),
    allTasks,
  };
}

function buildProtocolViolations(dayCommits, statusItems, config) {
  const violations = [];

  for (const commit of dayCommits) {
    if (!commit.protocol.valid) {
      violations.push({
        type: 'commit',
        message: `commit ${commit.hash.slice(0, 7)} нарушает протокол: ${commit.protocol.errors.join('; ')}`,
      });
    }
  }

  const dirtyWithoutProtocol = statusItems.length > 0;
  if (dirtyWithoutProtocol) {
    violations.push({
      type: 'working_tree',
      message: 'Есть незакоммиченные изменения; до commit с MIX7-XXX система не может отнести их к реальной задаче.',
    });
  }

  const rawUntrackedProtocolRelevant = config.excludeExact.includes('frontend/.env.local')
    ? 'enabled'
    : 'disabled';

  if (!rawUntrackedProtocolRelevant) {
    violations.push({
      type: 'config',
      message: 'Фильтр локальных env-файлов не настроен; возможны ложные protocol violations.',
    });
  }

  return violations;
}

function buildLongInProgressTasks(tasks, reportDate, config) {
  const reportTime = new Date(`${reportDate}T00:00:00Z`).getTime();
  const thresholdDays = config.protocol?.staleInProgressDays ?? 3;

  return tasks
    .filter((task) => task.state === 'start' || task.state === 'work')
    .filter((task) => {
      const latest = new Date(`${task.latestDate}T00:00:00Z`).getTime();
      const diffDays = Math.floor((reportTime - latest) / 86400000);
      return diffDays >= thresholdDays;
    })
    .map((task) => {
      const latest = new Date(`${task.latestDate}T00:00:00Z`).getTime();
      const diffDays = Math.floor((reportTime - latest) / 86400000);
      return {
        taskId: task.key,
        days: diffDays,
      };
    });
}

function buildOwnerDecisionZones(signals, protocolTasks, protocolViolations, longInProgress) {
  const decisions = [];

  if (protocolViolations.some((item) => item.type === 'commit')) {
    decisions.push(
      'Нужно ли останавливать release flow до полной зачистки commit history от новых нарушений протокола.'
    );
  }

  if (protocolTasks.allTasks.length === 0) {
    decisions.push(
      'Нужно ли считать текущую историю legacy и начинать protocol truth только с момента включения enforcement слоя.'
    );
  }

  if (longInProgress.length > 0) {
    decisions.push(
      'Нужно ли owner-level правило для обязательного `blocked:` или `done:` после нескольких дней без движения по задаче.'
    );
  }

  if (/\[behind\s+\d+\]/.test(signals.branchStatus)) {
    decisions.push(
      'Нужно ли запретить owner-level отчёты по локальному checkout, который отстаёт от origin/main.'
    );
  }

  return decisions;
}

function buildRisks(signals, protocolViolations, longInProgress) {
  const risks = [];

  if (/\[behind\s+\d+\]/.test(signals.branchStatus)) {
    risks.push('Локальный `main` отстаёт от `origin/main`; текущий отчёт может расходиться с remote truth.');
  }

  if (protocolViolations.some((item) => item.type === 'commit')) {
    risks.push('Новые commits без MIX7-XXX или без lifecycle state разрушают автоматическое восстановление task state.');
  }

  if (protocolViolations.some((item) => item.type === 'working_tree')) {
    risks.push('Есть незакоммиченная работа вне протокола; пока нет commit с MIX7-XXX, система не видит её как задачу.');
  }

  if (longInProgress.length > 0) {
    risks.push('Есть долгие in-progress задачи без перехода в `done` или `blocked`.');
  }

  return risks;
}

function buildForensicsSummary(signals, protocolTasks, protocolViolations) {
  return {
    availableSignals: [
      'git log subject/date/hash',
      'git numstat по commit',
      'protocol parsing: MIX7-XXX + lifecycle state',
      'git status porcelain для незакоммиченной работы',
    ],
    missingSignals: [
      'ретроактивные MIX7-XXX для legacy history',
      'доказуемый blocked marker в старых commit messages',
      'remote CI status внутри локального отчёта',
    ],
    falseInferenceZones: [
      'legacy commits без MIX7-XXX нельзя считать задачами',
      'dirty tree без commit не даёт task identity',
      'done/blocking status нельзя реконструировать без явного lifecycle события',
    ],
    totalProtocolTasks: protocolTasks.allTasks.length,
    dayCommitCount: signals.dayCommits.length,
    protocolViolationCount: protocolViolations.length,
    rawUntrackedCount: signals.rawUntrackedCount,
    filteredStatusCount: signals.statusItems.length,
  };
}

function formatTaskLine(task) {
  return `- ${task.key} ${task.state}: ${task.title} | качество: ${task.qualityScore}/10 | трудоёмкость: ${task.effortBand} | файлов: ${task.fileCount}`;
}

function formatTaskDetails(task) {
  const lines = [];
  lines.push(formatTaskLine(task));
  lines.push(`  latest: ${task.latestDate} ${task.latestHash.slice(0, 7)}`);
  lines.push(`  события: ${task.events.map((event) => `${event.date}:${event.state}`).join(', ')}`);
  lines.push(`  зоны: ${task.areaNames.join(', ')}`);
  lines.push(`  файлы: ${task.files.map((file) => file.path).join(', ')}`);
  return lines.join('\n');
}

function buildReportText(reportDate, payload, alerts, full) {
  const lines = [];
  lines.push(`Отчёт AIOps за ${reportDate}`);
  lines.push('');
  lines.push('Классификация');
  lines.push('- source validity: commit history — primary truth; task state строится только из protocol commits.');
  lines.push('- contract: обязателен формат `MIX7-XXX <start|work|done|blocked>: <description>`.');
  lines.push('- platform: enforcement через local hook + CI script + reporting integration.');
  lines.push('- node implementation: enforcement layer внутри `project-control/`.');
  lines.push('- review: вторично; без protocol signal задача для системы не существует.');
  lines.push('');
  lines.push('Архитектура');
  lines.push('- источник правды: protocol-compliant commits.');
  lines.push('- completed: только задачи, у которых latest state = `done` и `done` за выбранную дату.');
  lines.push('- in progress: latest state = `start` или `work`.');
  lines.push('- blocked: latest state = `blocked`.');
  lines.push('- protocol violations: commits без MIX7-XXX/state и незакоммиченная работа вне protocol truth.');
  lines.push('');
  lines.push('Завершённые задачи');
  if (payload.completedTasks.length === 0) {
    lines.push('- Нет доказанных задач, перешедших в `done` за эту дату.');
  } else {
    for (const task of payload.completedTasks) {
      lines.push(full ? formatTaskDetails(task) : formatTaskLine(task));
    }
  }
  lines.push('');
  lines.push('Задачи в работе');
  if (payload.inProgressTasks.length === 0) {
    lines.push('- Нет доказанных задач со state `start`/`work`.');
  } else {
    for (const task of payload.inProgressTasks) {
      lines.push(full ? formatTaskDetails(task) : formatTaskLine(task));
    }
  }
  lines.push('');
  lines.push('Заблокированные задачи');
  if (payload.blockedTasks.length === 0) {
    lines.push('- Нет доказанных задач со state `blocked`.');
  } else {
    for (const task of payload.blockedTasks) {
      lines.push(full ? formatTaskDetails(task) : formatTaskLine(task));
    }
  }
  lines.push('');
  lines.push('Нарушения протокола');
  if (payload.protocolViolations.length === 0) {
    lines.push('- Нарушений протокола по доступным сигналам не найдено.');
  } else {
    for (const violation of payload.protocolViolations) {
      lines.push(`- ${violation.message}`);
    }
  }
  lines.push('');
  lines.push('АЛЕРТЫ');
  const alertCount = alerts.alerts.length;
  if (alertCount === 0) {
    lines.push('- Нет доказанных alert-class сигналов.');
  } else {
    lines.push(`- Всего сигналов: ${alertCount}`);
    if (alerts.grouped.critical.length > 0) {
      lines.push(`- Критические: ${alerts.grouped.critical.length}`);
    }
    if (alerts.grouped.high.length > 0) {
      lines.push(`- Важные: ${alerts.grouped.high.length}`);
    }
    if (alerts.grouped.warning.length > 0) {
      lines.push(`- Предупреждения: ${alerts.grouped.warning.length}`);
    }
    const topAlerts = alerts.alerts.slice(0, full ? alerts.alerts.length : 5);
    for (const alert of topAlerts) {
      lines.push(`- [${alert.code}] ${alert.subject}`);
    }
  }
  lines.push('');
  lines.push('Риски');
  if (payload.risks.length === 0) {
    lines.push('- Существенные риски по protocol truth не доказаны.');
  } else {
    for (const risk of payload.risks) {
      lines.push(`- ${risk}`);
    }
  }
  lines.push('');
  lines.push('Блокеры');
  if (payload.longInProgress.length === 0) {
    lines.push('- Нет доказанных долгих in-progress задач выше порога.');
  } else {
    for (const task of payload.longInProgress) {
      lines.push(`- ${task.taskId} остаётся in-progress уже ${task.days} дн.; нужен ` + '`done:`' + ' или ' + '`blocked:`' + '.');
    }
  }
  lines.push('');
  lines.push('Нужен owner decision');
  if (payload.ownerDecisions.length === 0) {
    lines.push('- Явных owner decisions по доступным сигналам не требуется.');
  } else {
    for (const decision of payload.ownerDecisions) {
      lines.push(`- ${decision}`);
    }
  }

  if (full) {
    lines.push('');
    lines.push('Forensics');
    lines.push(`- branch: ${payload.branch}`);
    lines.push(`- branch status: ${payload.branchStatus || 'n/a'}`);
    lines.push(`- available signals: ${payload.forensics.availableSignals.join('; ')}`);
    lines.push(`- missing signals: ${payload.forensics.missingSignals.join('; ')}`);
    lines.push(`- false inference zones: ${payload.forensics.falseInferenceZones.join('; ')}`);
    lines.push(`- total protocol tasks: ${payload.forensics.totalProtocolTasks}`);
    lines.push(`- day commit count: ${payload.forensics.dayCommitCount}`);
    lines.push(`- protocol violation count: ${payload.forensics.protocolViolationCount}`);
    lines.push(`- raw untracked count: ${payload.forensics.rawUntrackedCount}`);
    lines.push(`- filtered status count: ${payload.forensics.filteredStatusCount}`);
  }

  return `${lines.join('\n')}\n`;
}

function buildPayload(repoRoot, reportDate, config) {
  const signals = buildSignals(repoRoot, reportDate, config);
  const protocolTasks = buildProtocolTasks(signals.historyCommits, reportDate);
  const protocolViolations = buildProtocolViolations(signals.dayCommits, signals.statusItems, config);
  const longInProgress = buildLongInProgressTasks(protocolTasks.allTasks, reportDate, config);
  const risks = buildRisks(signals, protocolViolations, longInProgress);
  const ownerDecisions = buildOwnerDecisionZones(signals, protocolTasks, protocolViolations, longInProgress);
  const forensics = buildForensicsSummary(signals, protocolTasks, protocolViolations);

  return {
    reportDate,
    branch: signals.branch,
    branchStatus: signals.branchStatus,
    completedTasks: protocolTasks.completedTasks,
    inProgressTasks: protocolTasks.inProgressTasks,
    blockedTasks: protocolTasks.blockedTasks,
    protocolViolations,
    longInProgress,
    risks,
    ownerDecisions,
    forensics,
  };
}

module.exports = {
  buildPayload,
  buildReportText,
  deriveArea,
  extractTaskKey: (subject, config) => {
    const parsed = parseCommitMessage(subject);
    if (parsed.valid) {
      return parsed.taskId;
    }

    const explicit = subject.match(new RegExp(config.taskKeyPattern, 'i'));
    return explicit ? explicit[0].toUpperCase() : 'unclassified task';
  },
  finalizeTask,
  isExcluded,
  loadConfig,
  parseCommitLog,
  resolveDateSpec,
};
