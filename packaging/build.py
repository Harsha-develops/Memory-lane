"""Build using the project's pinned environments; never installs system software."""

import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
python = root / "backend" / ".venv" / "Scripts" / "python.exe"
subprocess.run(
    [str(python), str(root / "packaging" / "collect_notices.py")], cwd=root, check=True
)
subprocess.run(
    [str(python), "-m", "PyInstaller", "--noconfirm", "thing-backend.spec"],
    cwd=root / "backend",
    check=True,
)
subprocess.run(
    ["npm.cmd", "run", "package"], cwd=root / "desktop", check=True, shell=False
)
print("Installer built under:", root / "release")
