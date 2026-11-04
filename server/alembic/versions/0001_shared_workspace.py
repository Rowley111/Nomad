"""Add protected shared workspace. No existing application tables are changed."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_shared_workspace"
down_revision = None
branch_labels = None
depends_on = None


def data_type():
    return sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade():
    op.create_table(
        "nomad_users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("username", sa.String(120), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'staff')", name="nomad_user_role"),
    )
    op.create_table(
        "nomad_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("nomad_users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_nomad_sessions_user_id", "nomad_sessions", ["user_id"])
    op.create_index("ix_nomad_sessions_expires_at", "nomad_sessions", ["expires_at"])
    op.create_table(
        "nomad_login_windows",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
    )
    workspace = op.create_table(
        "nomad_workspace",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("state", data_type(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name="nomad_single_workspace"),
        sa.CheckConstraint("revision >= 0", name="nomad_positive_revision"),
    )
    op.bulk_insert(workspace, [{"id": 1, "revision": 0, "state": None, "updated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)}])
    op.create_table(
        "nomad_operations",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("nomad_users.id"), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("response", data_type(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "nomad_audit",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("nomad_users.id"), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("before_state", data_type(), nullable=True),
        sa.Column("after_state", data_type(), nullable=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "nomad_import_previews",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("nomad_users.id"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("state", data_type(), nullable=False),
        sa.Column("report", data_type(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_nomad_import_previews_expires_at", "nomad_import_previews", ["expires_at"])


def downgrade():
    # Downgrading would destroy business history. Restore a verified DB backup instead.
    raise RuntimeError("Автоматическое удаление рабочих таблиц запрещено; используйте резервную копию")
