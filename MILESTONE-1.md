# thing sorted — milestone 1

Built in `D:\projects\Things Sorted` on 30 October 2026.

**Status: M1 implemented and tested on this Windows computer; awaiting your review.** This is a developer build. It is not yet a standalone installer or working photo organizer.

## Open it

In File Explorer, open `D:\projects\Things Sorted` and double-click **Start thing sorted.cmd**. The launcher starts the desktop shell and its private Python backend using the environments already installed in the project. It does not import or scan photos.

Alternatively, run these commands in **PowerShell**, from any starting folder:

```powershell
Set-Location 'D:\projects\Things Sorted\desktop'
npm.cmd start
```

`Set-Location` selects the frontend folder. `npm.cmd start` launches the desktop app. Expect the branded window followed by **HEALTH OK**. Closing the window shuts down the private backend. No administrator rights or PowerShell policy changes are needed.

## What you can try now

1. **Launch:** the window opens with your supplied logo and the heading “Welcome to your little universe.”
2. **Connection:** scroll down if necessary and check that **HEALTH OK** appears. The initial “CONNECTING” message should clear within 15 seconds.
3. **Animation:** the decorative orbit rings rotate and the illustration cards drift. These are illustrations, not imported photos.
4. **Preferences:** open Preferences, choose Light, then Dark. Toggle Animated moments. Motion stops when disabled; Windows reduced-motion settings also take priority.
5. **Keyboard:** open Preferences with the keyboard, use Tab to move between controls, and press Esc. The dialog closes and focus returns to its opening button. The “Skip to content” link appears when focused and keeps the backend connected.
6. **Build journey:** choose “Explore what’s taking shape” or “Build journey.” The page lists the current and upcoming milestones. Overview returns to the welcome screen.
7. **Restart:** close and reopen the app. Appearance and motion preferences are saved locally. Photo persistence is not available yet.
8. **Second launch:** opening the launcher again should focus the existing window. Single-instance behavior is implemented; this particular manual check is still for your confirmation.

“All photos,” “Trips & albums,” and “Duplicates” are visibly unavailable in M1. Importing your photos is the next milestone.

## Tests actually run

| Check | Result |
| --- | --- |
| Backend pytest suite | **19 passed**, final run 8.68 seconds, no warnings |
| Desktop/supervisor Playwright suite | **3 passed**, final run 11.3 seconds |
| Strict TypeScript check and Vite production build | Passed |
| ESLint | Passed |
| Prettier check | Passed |
| Ruff lint and formatting check | Passed |
| npm dependency audit during installation | Zero known vulnerabilities reported |
| pip-audit 2.10.1, hashed runtime lock | No known vulnerabilities found |
| pip-audit 2.10.1, hashed development lock | No known vulnerabilities found |
| Rendered screenshot inspection | Supplied logo, layout and connection state inspected |
| Post-test process inspection | No project Python backend left running |

Tests cover valid/missing/wrong tokens; invalid/missing Origin; disabled API docs; rejected request bodies/methods; rate limits; invalid bootstrap messages; real HTTP startup; shutdown by message and parent-pipe closure; missing Python executable; backend crash detection and restart; renderer sandbox/context isolation; absence of renderer Node access; blocked external fetch; theme/motion controls; keyboard dialog closure; skip-link focus; and navigation between the two implemented screens.

The JavaScript tests run the actual Electron window and the actual Python backend. They do not constitute a packaged installer test. Dependency audit results are a dated snapshot, not a guarantee of absence of vulnerabilities.

## Rerun the checks

Close thing sorted first. In **PowerShell**, select the backend folder and run its test, lint, and formatting commands. Expected output: 19 passed, “All checks passed,” and already-formatted files.

```powershell
Set-Location 'D:\projects\Things Sorted\backend'
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
```

In **PowerShell**, select the desktop folder and compile, lint, check formatting, and test. Expected output: a completed Vite build, clean lint/format results, and 3 passed. The tests briefly open a desktop window.

```powershell
Set-Location 'D:\projects\Things Sorted\desktop'
npm.cmd run build
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
```

## Files and architecture

All source files are complete in the project folder. `README.md` contains the file tree, setup, dependency rationale, security model, and troubleshooting. Main files:

- `D:\projects\Things Sorted\desktop\electron\main.ts` — Windows shell and validated IPC.
- `D:\projects\Things Sorted\desktop\electron\backend.ts` — backend start/health/retry/shutdown.
- `D:\projects\Things Sorted\desktop\electron\security.ts` — local assets, path containment and CSP.
- `D:\projects\Things Sorted\desktop\electron\preload.ts` — minimal typed bridge.
- `D:\projects\Things Sorted\desktop\src\App.tsx` — application interface.
- `D:\projects\Things Sorted\desktop\src\components\` — orbit artwork, icons, preferences and build journey.
- `D:\projects\Things Sorted\desktop\public\brand\logo.png` — copy of your supplied logo.
- `D:\projects\Things Sorted\backend\app\main.py` — typed health API.
- `D:\projects\Things Sorted\backend\app\security.py` — token, Origin and request restrictions.
- `D:\projects\Things Sorted\backend\app\runner.py` — loopback socket and parent-pipe lifecycle.
- `D:\projects\Things Sorted\backend\tests\` and `D:\projects\Things Sorted\desktop\tests\` — automated checks.
- `D:\projects\Things Sorted\desktop\package-lock.json` and the backend `requirements*.lock` files — locked dependencies.

The local repository is initialized on `codex/desktop-foundation`. Files have not been committed or pushed. `.gitignore` excludes environments, build products, databases, logs, secrets and private photo formats while allowing the supplied branding asset.

## Privacy and Windows notes

- The app is offline and has no AI services, accounts or analytics. Development downloads and vulnerability audits use the internet for package metadata only.
- No user photos were opened, copied, modified or transmitted. Only the supplied logo was copied into the project.
- The renderer has no backend token, no direct network access and no arbitrary filesystem bridge. Backend access uses a per-launch token and app Origin over loopback.
- M1 stores display preferences and Chromium application data under `%APPDATA%\ThingSorted\`. It does not yet store a photo library.
- Copy diagnostics is a user action and excludes paths, tokens, photo content and GPS.
- The development launcher requires the tools/environment already installed here. A clean Windows computer without Python/Node is **not supported until M6 packaging is implemented and tested**.
- The available Python command is `python`; this computer's `py` launcher reports no interpreters. Use `npm.cmd` to avoid PowerShell script-policy issues.
- Node 25.9.0 and Python 3.12.5 are the installed development tools used here. Release toolchain support and security patch levels must be checked again before distribution.
- The TypeScript pin is 6.0.3: the current linter rejects TypeScript 7. The maintained HTTPX2 test client replaced HTTPX after the installed framework warned that the older integration was deprecated.
- Installer signing, Windows 10 compatibility, low-disk conditions, long photo paths, disappearing drives, language translations, and large-library performance remain untested and unimplemented at this milestone.

## Next milestone

M2 adds real photo importing, safe copies, content validation, thumbnail generation, per-file results and a gallery. HEIC/HEIF, TIFF and selected RAW formats are part of the requested first release. Decoder/camera coverage will be documented rather than claiming every RAW variant works.

Twelve additional languages, the full photo orbit, trips, metadata, duplicates and the standalone Windows installer remain on the build plan. There will be no AI milestone.

Progress pauses here for your milestone review, as requested in the build brief. **Ready for the next milestone?**
