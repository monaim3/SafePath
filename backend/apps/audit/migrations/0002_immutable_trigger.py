"""On PostgreSQL, block UPDATE/DELETE on the audit table at the database level too."""

from django.db import migrations

CREATE = """
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit log entries are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_change ON audit_auditlog;
CREATE TRIGGER audit_log_no_change
  BEFORE UPDATE OR DELETE ON audit_auditlog
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
"""

DROP = """
DROP TRIGGER IF EXISTS audit_log_no_change ON audit_auditlog;
DROP FUNCTION IF EXISTS audit_log_immutable();
"""


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(CREATE)


def backwards(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(DROP)


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]
    operations = [migrations.RunPython(forwards, backwards)]
