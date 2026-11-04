"""Distinguish manually created trips and albums without changing memberships."""

import sqlalchemy as sa
from alembic import op

revision = "0004_collection_kind"
down_revision = "0003_categories"


def upgrade() -> None:
    op.add_column("trips", sa.Column("kind", sa.String(), nullable=False, server_default="trip"))


def downgrade() -> None:
    raise RuntimeError("Destructive schema downgrades are not supported.")
