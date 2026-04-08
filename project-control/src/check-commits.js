const cp = require('child_process');
const { parseCommitMessage } = require('./protocol');

function runGit(args) {
  const result = cp.spawnSync('git', args, { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }

  return result.stdout;
}

function resolveRange(argv) {
  const explicit = argv.find((item) => !item.startsWith('--'));
  if (explicit) {
    return explicit;
  }

  const base = process.env.GITHUB_BASE_SHA || process.env.GITHUB_EVENT_BEFORE;
  const head = process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA;

  if (base && head) {
    return `${base}..${head}`;
  }

  return null;
}

function main() {
  const range = resolveRange(process.argv.slice(2));

  if (!range) {
    throw new Error('Usage: node project-control/src/check-commits.js <git-range>');
  }

  const raw = runGit(['log', '--format=%H%x09%s', range]);
  const rows = raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [hash, subject] = line.split('\t');
      return { hash, subject };
    });

  const violations = rows
    .map((row) => ({
      ...row,
      parsed: parseCommitMessage(row.subject),
    }))
    .filter((row) => !row.parsed.valid);

  if (violations.length > 0) {
    process.stderr.write('MIX7 task protocol violations detected.\n');
    for (const violation of violations) {
      process.stderr.write(`- ${violation.hash.slice(0, 7)} ${violation.subject}\n`);
      process.stderr.write(`  ${violation.parsed.errors.join('; ')}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`Protocol OK for ${rows.length} commit(s) in ${range}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
