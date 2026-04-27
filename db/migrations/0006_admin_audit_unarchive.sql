ALTER TABLE admin_audit_log
DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE admin_audit_log
ADD CONSTRAINT admin_audit_log_action_check
CHECK (
  action IN (
    'EVENT_CREATED',
    'EVENT_UPDATED',
    'EVENT_SALES_OPENED',
    'EVENT_SALES_CLOSED',
    'EVENT_ARCHIVED',
    'EVENT_UNARCHIVED'
  )
);
