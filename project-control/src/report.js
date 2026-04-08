const fs = require('fs');
const path = require('path');
const {
  buildPayload,
  buildReportText,
  loadConfig,
  resolveDateSpec,
} = require('./report-core');
const { buildAlertPayload } = require('./alert-core');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const dateArg = args.find((arg) => arg !== '--full');

  if (!dateArg) {
    throw new Error('Usage: ./project-control/report.sh DATE [--full]');
  }

  const repoRoot = path.resolve(__dirname, '..', '..');
  const config = loadConfig(repoRoot);
  const reportDate = resolveDateSpec(dateArg);
  const payload = buildPayload(repoRoot, reportDate, config);
  const alerts = buildAlertPayload(repoRoot, reportDate, config);
  const reportText = buildReportText(reportDate, payload, alerts, full);

  const reportsDir = path.join(repoRoot, 'project-control', 'reports');
  const stateDir = path.join(repoRoot, 'project-control', 'state');
  ensureDir(reportsDir);
  ensureDir(stateDir);

  const suffix = full ? '-full' : '';
  fs.writeFileSync(
    path.join(reportsDir, `${reportDate}${suffix}.txt`),
    reportText,
    'utf8'
  );
  fs.writeFileSync(
    path.join(stateDir, `${reportDate}${suffix}.json`),
    `${JSON.stringify({ ...payload, alerts }, null, 2)}\n`,
    'utf8'
  );

  process.stdout.write(reportText);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
