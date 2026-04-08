const fs = require('fs');
const { parseCommitMessage } = require('./protocol');

function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error('Usage: node project-control/src/validate-commit-msg.js <commit-message-file>');
  }

  const message = fs.readFileSync(filePath, 'utf8').trim();
  const parsed = parseCommitMessage(message);

  if (!parsed.valid) {
    process.stderr.write('Commit message rejected by MIX7 task protocol.\n');
    process.stderr.write('Required format: MIX7-XXX <start|work|done|blocked>: <description>\n');
    process.stderr.write(`Received: ${message || '<empty>'}\n`);
    process.stderr.write(`Errors: ${parsed.errors.join('; ')}\n`);
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
