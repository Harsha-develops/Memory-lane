"""Categorisation completion and recoverable managed-file organization."""

import sqlalchemy as sa
from alembic import op

revision = "0005_organization"
down_revision = "0004_collection_kind"


def upgrade() -> None:
    for name in [
        "categorized_at",
        "storage_path",
        "organized_label",
        "pending_path",
        "pending_label",
    ]:
        op.add_column("photos", sa.Column(name, sa.String(), nullable=False, server_default=""))
    op.execute("UPDATE photos SET categorized_at = 'legacy' WHERE tags != '[]' AND tags != ''")


def downgrade() -> None:
    raise RuntimeError("Destructive schema downgrades are not supported.")
