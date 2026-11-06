import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_updates014 import add

from app.database import SimilarPair
from app.library import Library

root = Path(sys.argv[1])
library = Library(root / "profile" / "catalog")
copies = root / "copies"
copies.mkdir()
library.configure(str(copies))
high, _ = add(library, root / "sharp.png")
low, _ = add(library, root / "blurred.png", (400, 300), 5)
with library.db.session.begin() as session:
    session.add(SimilarPair(id=uuid.uuid4().hex, first_id=high, second_id=low, distance=1))
(root / "fixture.json").write_text(
    json.dumps({"high": high, "low": low, "lowPath": str(library.organizer.original(low))}),
    encoding="utf-8",
)
library.close()
