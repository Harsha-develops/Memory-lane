# Windows packaging

The 0.6.0 installer is built and tested on this Windows 11 PC. See ../MILESTONES-3-6.md and ../INSTALLER-VERIFICATION.json for evidence. Clean-machine acceptance remains pending; use CLEAN-WINDOWS-CHECKLIST.md.

Build with the project-local Python environment: `backend\.venv\Scripts\python.exe packaging\build.py` from the project root, or double-click **Build installer.cmd**. Install the hashed development/build requirements and run `npm.cmd ci` first as described in README.

The build collects runtime license notices, creates a PyInstaller onedir backend with native codecs, and creates a per-user electron-builder NSIS installer. Console pipes remain enabled for the private backend handshake; Electron hides the process window. The supplied logo is converted to the ICO asset in desktop/build.

No signing certificate is configured. The application is unsigned and uses manual updates. The installer keeps app data by default; interactive recycling requires confirmation and targets only the fixed profile. External originals are retained. The keep-data uninstall/reinstall path has been tested; the interactive recycle choice remains part of clean-machine testing.
