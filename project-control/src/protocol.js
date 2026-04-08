const TASK_ID_REGEX = /\bMIX7-[0-9]{3,}\b/i;
const COMMIT_PROTOCOL_REGEX = /^(MIX7-[0-9]{3,})\s+(start|work|done|blocked):\s+(.+)$/i;
const PROTOCOL_STATES = ['start', 'work', 'done', 'blocked'];

function parseCommitMessage(message) {
  const normalized = String(message || '').trim();
  const match = normalized.match(COMMIT_PROTOCOL_REGEX);

  if (!match) {
    const errors = [];

    if (!TASK_ID_REGEX.test(normalized)) {
      errors.push('нет TASK ID формата MIX7-XXX');
    }

    if (!/\b(start|work|done|blocked):/i.test(normalized)) {
      errors.push('нет lifecycle state `start|work|done|blocked`');
    }

    if (errors.length === 0) {
      errors.push('неверный формат commit message');
    }

    return {
      valid: false,
      taskId: null,
      state: null,
      description: null,
      errors,
    };
  }

  return {
    valid: true,
    taskId: match[1].toUpperCase(),
    state: match[2].toLowerCase(),
    description: match[3].trim(),
    errors: [],
  };
}

module.exports = {
  COMMIT_PROTOCOL_REGEX,
  PROTOCOL_STATES,
  TASK_ID_REGEX,
  parseCommitMessage,
};
