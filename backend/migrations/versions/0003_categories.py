"""Reviewed photo categories and user-chosen person references."""

import sqlalchemy as sa
from alembic import op

revision = "0003_categories"
down_revision = "0002_collections"


def upgrade() -> None:
    op.add_column("photos", sa.Column("tags", sa.String(), nullable=False, server_default="[]"))
    op.add_column("photos", sa.Column("person_ref", sa.String(), nullable=False, server_default=""))


def downgrade() -> None:
    raise RuntimeError("Destructive schema downgrades are not supported.")
