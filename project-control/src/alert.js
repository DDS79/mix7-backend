const path = require('path');
const { loadConfig, resolveDateSpec } = require('./report-core');
const { buildAlertPayload, buildAlertText, persistAlertArtifacts } = require('./alert-core');

function main() {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const dateArg = args.find((arg) => arg !== '--full');

  if (!dateArg) {
    throw new Error('Usage: ./project-control/alert.sh DATE [--full]');
  }

  const repoRoot = path.resolve(__dirname, '..', '..');
  const config = loadConfig(repoRoot);
  const reportDate = resolveDateSpec(dateArg);
  const payload = buildAlertPayload(repoRoot, reportDate, config);
  const text = buildAlertText(payload, full);

  persistAlertArtifacts(repoRoot, payload, text, full);
  process.stdout.write(text);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
