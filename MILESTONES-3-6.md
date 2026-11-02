# thing sorted — M3 through M6 review

Build: **0.6.0**, reviewed **1 November 2026**. Project: `D:\projects\Things Sorted`.

You authorized the next four milestones together with default choices. M3–M5 are implemented and tested. M6 has a working installer and installed-app tests on this PC; its required **clean-machine acceptance test remains pending**. No AI model or service was added.

## What changed

| Milestone | Delivered behavior |
| --- | --- |
| M3 — catalog and trips | Backed-up Alembic migration, persistent trips, optional trip dates, bulk photo assignment, cover selection, filename/trip/date filters, confirmed date grouping, remove-trip while retaining photos |
| M4 — circular dashboard | Interactive photo orbit by trip or month; capped at 72 images, with remaining counts shown; virtual gallery with bounded chunk cache; zoomable viewer; keyboard navigation and focus restoration; saved window bounds/last view |
| M5 — metadata and duplicates | EXIF date/source with file-modified/import fallback; hidden-by-default GPS display and collection controls; confirmed removal of live-catalog coordinates; exact import duplicates; optional local dHash review with persistent decisions and no photo deletion |
| M6 — Windows package | Frozen Python/native image decoders, Electron/NSIS per-user installer, supplied logo as Windows icon, Start-menu registration, manual update route, keep-data uninstall default, explicit Recycle Bin helper, bundled license notices |

Red and maroon remain dominant. Light mode uses supporting beige; dark mode uses soft black. Gold accents, eased transitions, orbit breathing, viewer entrance, hover depth, and motion preferences are retained. System reduced motion takes priority.

## Verification performed

- **53 backend tests passed.** These cover import formats including real NEF/CR2, corrupted/oversized files, orientation, original-byte preservation, exact duplicate races, recovery/cancellation, authentication/path checks, metadata/GPS, trip operations, similarity decisions, migration backups, and the uninstall helper's fixed-path safeguards.
- **Five desktop scenarios passed across final runs:** missing backend, crash/restart supervision, secure native import/theme/viewer/persistence, collection organization/privacy/persistence, and the 5,000-photo gallery/orbit. One desktop smoke run was interrupted while installer testing was occurring; its isolated rerun passed. Installation and app tests were then run sequentially.
- **Two tests passed against the actual installed executable:** import five synthetic photos, trips, metadata, privacy, restart persistence, and a 5,000-photo gallery/orbit. The import test removed Node/Python directories from the launched app's PATH.
- The 5,000-photo check rendered **20 initial gallery cards**, retained fewer than 60 after scrolling, and drew **72 orbit nodes**. Every orbit image loaded; no failed image responses were observed. The last installed-app run measured 137 ms from gallery navigation to its first card, 7.3 ms median animation-frame interval and 30.5 ms p95 during scripted scrolling. These are synthetic measurements on this PC, not a minimum-hardware or 60-fps guarantee.
- TypeScript and Vite builds, ESLint, Prettier, Ruff lint/format checks passed.
- Installer creation succeeded. Per-user installation created `thing sorted 0.6.0` registration and `thing sorted.lnk` in the user's Start menu. Executable product name is `thing sorted`, version `0.6.0`.
- Runtime npm audit: **zero findings**. Python runtime/build audit: **no known vulnerabilities**. Full npm development-tree audit: **24 moderate, zero high/critical**, driven by the minimatch advisory and its dependent build/lint packages. These build-time findings and older transitive deprecation notices are disclosed in README; no forced incompatible overrides were applied.

Visual inspection caught broken orbit thumbnails during burst loading. The desktop now queues backend HTTP requests below the server's existing concurrency cap, and the performance test explicitly verifies all 72 images. The inner ring also uses smaller images when crowded. Startup restoration now waits for the local service before loading saved views.

## Try the four milestones

1. Open **thing sorted** from Start. Choose **Bring your photos home**, select a library folder, and import five disposable photos. Expect five cards and per-file results. Reimport one and expect a duplicate result with an unchanged total.
2. Open **Trips & albums**, create a trip, return to **All photos**, select two photos, choose the trip, and click **Move selected**. Filter by the trip and expect two photos. In the viewer, set one as its cover.
3. Open **Photo orbit**. Switch between trips and months. Tab to a photo, press Enter, use arrows, then Esc. Expect focus to return to the photo. Change appearance and animation in Preferences; resize and restart to check persistence.
4. In photo details, inspect **Date source**. A photo without EXIF uses source modified time; older catalog entries may use import time. GPS stays hidden until enabled. **Duplicates → Find similar photos** is optional and approximate; reviewing a pair keeps both originals.

For format/security/edge cases, also try a portrait with EXIF orientation, no-EXIF image, disposable GPS image, exact duplicate, Unicode filename, a text file renamed JPG, corrupt JPG, huge dimensions, and the camera RAW variants you own. Invalid files should receive a per-file rejection. Existing automated checks cover these categories except that every possible camera variant and Windows path configuration cannot be certified.

## Installer and data behavior

Installer: `D:\projects\Things Sorted\release\thing-sorted-0.6.0-windows-x64-setup.exe`.

SHA-256: `727f0499c5bff50c8ec12da211bddfda095ad2ba3a7beca98937bb6b175ec373`.

The app is installed per user in `%LOCALAPPDATA%\Programs\thing sorted`. The executable and all accompanying resources form one application. It is unsigned, so its publisher may appear as unknown. Security protections were not disabled.

The default uninstall keeps app data. Interactive uninstall can ask to recycle the fixed `%APPDATA%\ThingSorted` profile; a safety check refuses this if originals are catalogued inside that profile. The external original library is not removed. The helper's target validation is unit-tested; the interactive Yes/Recycle-Bin path still belongs in the disposable clean-machine checklist. The silent keep-data path and reinstall are recorded separately in `INSTALLER-VERIFICATION.json`.

## Files to review

All complete source files are in the project. Main additions are:

```text
D:\projects\Things Sorted\
  README.md, MILESTONES-3-6.md, CHANGELOG.md
  Build installer.cmd
  backend\app\catalog.py, catalog_api.py, metadata.py
  backend\migrations\versions\0002_collections.py
  backend\entry.py, thing-backend.spec, requirements-build.in, requirements-build.lock
  backend\tests\test_catalog.py, test_release_safety.py, seed_large_library.py
  desktop\shared\catalog.ts
  desktop\electron\catalog.ts, windowState.ts
  desktop\src\components\Trips.tsx, Orbit.tsx, Similar.tsx, PhotoViewer.tsx
  desktop\src\components\VirtualGallery.tsx, PrivacySettings.tsx
  desktop\src\styles-collections.css
  desktop\tests\collections.spec.ts, performance.spec.ts
  desktop\build\installer.nsh, icon.ico
  packaging\build.py, collect_notices.py, CLEAN-WINDOWS-CHECKLIST.md, notices\
```

The existing import service, database models, desktop bridge, navigation, preferences, gallery, and dependency locks were updated. Generated distributions, databases, private images, environments, and test results are excluded from Git. The only source image assets intended for version control are your supplied logo and its icon conversion.

## Remaining limits

- Clean-machine M6 testing is **not done**. This Windows 11 Home PC has no Windows Sandbox. Windows 10 and a separate standard-user clean installation remain unverified. Follow `packaging\CLEAN-WINDOWS-CHECKLIST.md` on a disposable environment.
- No signing certificate is configured. Updates are manual.
- English works; the additional twelve languages, optional watched folder, backup/restore UI, photo deletion, and library relocation remain in the later polish milestone.
- Similarity review is approximate and bounded. It does not automatically remove files. GPS removal does not alter originals or previous backups.
- The full original project definition of done has not yet been reached, because clean-machine acceptance and later polish remain outstanding.

No further product-choice questions were needed for these four milestones.
