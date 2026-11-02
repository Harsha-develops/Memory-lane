# thing sorted — milestone 2

**Version 0.2.0, completed for review on 31 October 2026 (India time).** Project: `D:\projects\Things Sorted`.

## What changed

- Red, burgundy and maroon now lead the interface. Beige and soft black support light/dark modes; gold is limited to small details.
- Refined movement: slow orbit rings, gentle floating cards, eased hover depth, button sheen, dialog/image entrance and view/theme transitions. Both the app motion switch and system reduced-motion settings are respected.
- Real native photo import, a chosen local library folder, streamed copying, validation, thumbnails, larger previews, progress, cancellation and per-file results.
- Gallery with 48 photos per page, lazy previews, click-to-view, arrow keys and Esc.
- Exact duplicate detection with a database uniqueness constraint. Originals outside the app library are never changed.
- Durable jobs, recovery of staged copies, interrupted-file messages, low-space retry, SQLite WAL, Alembic migrations and pre-migration backups.

The database foundation was added in M2 because safe imports require transactions, uniqueness and durable job state. Trips and album organization remain the next milestone.

## Try it

1. Double-click `D:\projects\Things Sorted\Start thing sorted.cmd`.
2. Wait for **HEALTH OK**, then choose **Bring your photos home**.
3. Pick a folder for copied originals. The app creates `thing sorted library\originals` inside it.
4. Select a few photos. Open **Per-file results** to inspect each outcome.
5. Import the same photo again: it should be reported as a duplicate, with no additional gallery entry.
6. Click a photo, use Left/Right arrows, and press Esc to close its preview.
7. Switch Light/Dark in Preferences and try the motion toggle.
8. Close and reopen: the imported collection and appearance preferences should remain.

To launch from **PowerShell**, the following commands select the desktop folder and open the application. Expected result: the branded desktop window and **HEALTH OK**.

```powershell
Set-Location 'D:\projects\Things Sorted\desktop'
npm.cmd start
```

## Verified results

| Check | Result |
| --- | --- |
| Backend tests, including real RAW samples | **43 passed** in 27.22 seconds |
| Desktop and recovery tests | **3 passed** in 25.5 seconds |
| TypeScript and production build | Passed |
| ESLint / Prettier | Passed |
| Ruff lint and formatting | Passed |
| npm audit | Zero known vulnerabilities reported |
| pip-audit of the expanded hashed development lock | No known vulnerabilities found |
| Screenshot review | Final red-led overview and light gallery inspected |
| Process check after tests | No project Python backend left running |

The desktop test imported five synthetic photos, detected one exact duplicate, rejected one corrupt file, checked that all five thumbnails loaded, opened/navigated the preview, switched themes, checked system reduced motion, checked the 820-pixel minimum window for horizontal overflow, restarted the app, and confirmed both persistence and unchanged source-file hashes.

Backend checks also covered corrupt/truncated/mislabeled images, empty and unsupported files, oversized batches/files, decompression-bomb headers, multipage rejection, concurrent duplicate uploads, EXIF orientation and stripped preview metadata, invalid paths/UNC/reserved names, cancellation during decode, interrupted-copy recovery, low-space rejection followed by retry, long Unicode paths over 260 characters, long display filenames, schema backup and future-schema refusal, token/Origin enforcement and backend lifecycle.

These are developer-build tests on this machine. Packaged-installer and clean-machine tests have not happened.

## Format coverage and limits

- Automated successful imports: JPEG, PNG, WEBP, HEIC, single-page TIFF, AVIF, BMP and still GIF.
- Real successful RAW tests: Nikon NEF and Canon CR2 fixtures from the rawpy project.
- Other accepted RAW extensions are sent to LibRaw, but every camera/variant has not been tested. Unsupported camera variants are rejected individually.
- Animated/multi-frame files and multipage TIFFs are rejected with an explanation.
- Limits: **200 files, 256 MiB per file, 2 GiB per batch, 80 million pixels per image**. A 100 MiB free-space margin is enforced.
- 480-pixel JPEG thumbnails and 1600-pixel previews are generated without embedded EXIF/GPS. Original bytes remain intact. RAW previews use half-resolution demosaicing; color-critical/HDR fidelity is not certified.

The real RAW fixtures are test-only scratch files and are not bundled in the product. The rawpy repository [fixture notes](https://github.com/letmaik/rawpy/blob/main/test/README.txt) identify the Canon sample source and its CC BY-NC-SA 4.0 license. Displayed screenshots use generated test illustrations, not your personal photos or the public RAW sample images.

## Rerun tests

In **PowerShell**, the backend commands below run tests, lint and formatting checks. Without the optional RAW fixture directory, expect 41 passed and 2 skipped. The full recorded run used `THING_RAW_FIXTURES` pointing to scratch files named `sample.NEF` and `sample.CR2`.

```powershell
Set-Location 'D:\projects\Things Sorted\backend'
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
```

Close the app first. In **PowerShell**, these commands rebuild and check the desktop app, then run three tests. The tests briefly open Electron windows and use isolated temporary profiles and synthetic images.

```powershell
Set-Location 'D:\projects\Things Sorted\desktop'
npm.cmd run build
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
```

## Files and remaining scope

Complete source is in the project. The updated `README.md` lists exact locations, dependencies, commands, the security model and recovery behavior. Key additions are `backend\app\api.py`, `library.py`, `database.py`, `storage.py`, `decoders.py`, the initial Alembic migration, `desktop\electron\imports.ts`, `desktop\src\components\Library.tsx` and `desktop\src\styles-premium.css`.

No AI features or cloud photo services were added. The Windows installer, trip/album management, advanced metadata/GPS controls, near-duplicate review, twelve additional languages, deletion controls and backup/restore remain upcoming. There is no library-relocation control yet.

The launcher still requires this development environment. Unsigned installer behavior, packaging licenses, clean Windows installation, large-library performance and wider camera coverage need later verification. Do not distribute this developer build as the finished product.

**Next milestone: trips/albums, assigning photos, and filtering the collection. Ready for the next milestone?**
