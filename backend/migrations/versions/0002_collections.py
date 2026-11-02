"""Trips, metadata and explicit visual-similarity review."""

import sqlalchemy as sa
from alembic import op

revision = "0002_collections"
down_revision = "0001_imports"


def upgrade() -> None:
    op.create_table(
        "trips",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("start_date", sa.String(), nullable=True),
        sa.Column("end_date", sa.String(), nullable=True),
        sa.Column("cover_photo_id", sa.String(), nullable=True),
    )
    op.add_column("photos", sa.Column("trip_id", sa.String(), nullable=True))
    op.add_column("photos", sa.Column("captured_at", sa.String(), nullable=True))
    op.add_column(
        "photos",
        sa.Column("date_source", sa.String(), nullable=False, server_default="import_time"),
    )
    op.add_column("photos", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("photos", sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column(
        "photos", sa.Column("metadata_version", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column("photos", sa.Column("visual_hash", sa.String(), nullable=True))
    op.add_column("import_items", sa.Column("modified_ms", sa.Float(), nullable=True))
    op.create_index("ix_photos_trip_id", "photos", ["trip_id"])
    op.create_index("ix_photos_captured_at", "photos", ["captured_at"])
    op.create_table(
        "similar_pairs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("first_id", sa.String(), nullable=False),
        sa.Column("second_id", sa.String(), nullable=False),
        sa.Column("distance", sa.Integer(), nullable=False),
        sa.Column("decision", sa.String(), nullable=False, server_default="pending"),
        sa.UniqueConstraint("first_id", "second_id"),
    )
    table = sa.table("photos", sa.column("captured_at"), sa.column("imported_at"))
    op.get_bind().execute(table.update().values(captured_at=table.c.imported_at))


def downgrade() -> None:
    raise RuntimeError("Destructive schema downgrades are not supported.")
