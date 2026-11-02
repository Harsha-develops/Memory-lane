"""Collect installed runtime license texts and metadata into the installer."""

import importlib.metadata
import re
import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
destination = root / "packaging" / "notices"
destination.mkdir(parents=True, exist_ok=True)
names = re.findall(
    r"^([a-zA-Z0-9_-]+)==",
    (root / "backend" / "requirements.lock").read_text(),
    re.MULTILINE,
)
index = [
    "# Bundled runtime dependencies",
    "",
    "These notices describe third-party software bundled with thing sorted. Upstream license terms apply.",
    "",
]
for name in names:
    distribution = importlib.metadata.distribution(name)
    index.extend(
        [
            f"## {name} {distribution.version}",
            distribution.metadata.get("License-Expression")
            or distribution.metadata.get("License")
            or "See included license texts and upstream project metadata.",
            *distribution.metadata.get_all("Project-URL", []),
            "",
        ]
    )
    for file in distribution.files or []:
        if any(word in file.name.lower() for word in ("license", "copying", "notice")):
            source = Path(distribution.locate_file(file))
            if source.is_file():
                target = destination / name / str(file)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
for name in ("react", "react-dom", "scheduler"):
    source = root / "desktop" / "node_modules" / name / "LICENSE"
    if source.is_file():
        shutil.copyfile(source, destination / f"{name}-LICENSE.txt")
python_license = Path(sys.base_prefix) / "LICENSE.txt"
if python_license.is_file():
    shutil.copyfile(python_license, destination / "Python-LICENSE.txt")
index.extend(
    [
        "Electron and Chromium license texts are installed beside the desktop executable.",
        "The icon was supplied by the product owner.",
        "",
    ]
)
(destination / "DEPENDENCIES.md").write_text("\n".join(index), encoding="utf-8")
