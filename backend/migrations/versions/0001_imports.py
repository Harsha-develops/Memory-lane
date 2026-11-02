"""Initial durable import catalog."""

import sqlalchemy as sa
from alembic import op

revision = "0001_imports"
down_revision = None


def upgrade() -> None:
    op.create_table(
        "photos",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("extension", sa.String(), nullable=False),
        sa.Column("sha256", sa.String(), nullable=False, unique=True),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("imported_at", sa.String(), nullable=False),
    )
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("cancelled", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "import_items",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("job_id", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("photo_id", sa.String(), nullable=True),
    )
    op.create_index("ix_import_items_job_id", "import_items", ["job_id"])
    op.create_table(
        "settings",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", sa.String(), nullable=False),
    )


def downgrade() -> None:
    raise RuntimeError("Destructive schema downgrades are not supported.")
