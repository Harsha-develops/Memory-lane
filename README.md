## Memory Lane 0.15.0

Similarity review now permanently deletes one **imported copy** when you select **Mark As Similar & Delete One**. It estimates quality from resolution and preview sharpness; close scores retain one deterministically. Keep Both remains available. External source files are untouched. Previously exported backups are independent snapshots and retain their contents.

Categorisation skips completed photos before selecting a batch and sends no repeat AI request. Every result is moved into an organised managed folder, with named people preferred and the destination changeable. Offline drives or move errors keep the categorised state and report the failure; reconnect and restart to retry outstanding folder organisation. Others is renameable, and optional AI discovery creates a new subject category in the existing request. Classification uses compact previews/prompts and caps replies at 256 tokens; provider billing varies and people references add input tokens.

The menu scrolls away with the page in both Top and Left layouts. Collapse/Expand Menu remembers its state.

# Memory Lane

Previous release **0.13.0** marked completed photos as Already Categorised and skips further provider calls. Single-match imported copies move into category folders; multiple matches have a destination chooser that prefers a named person. Moves change only managed copies, preserve source files, use recoverable journals, and retain their layout in backups. One chosen category section represents each organised photo.

The menu defaults to Top and can be moved to Left in Preferences. Glass surfaces, aurora motion, and glowing button ripples respect motion settings. Photos open fitted to the window, with explicit 100% and 200% controls.

Version 0.12.0 adds a Trip/Album selector for manual collections, normal Athiti typography for names, and sharp local previews up to 4,096 pixels with native-pixel zoom. Existing imported photos receive the improved preview when opened; originals stay unchanged. Manual collections share the existing single-collection assignment, while AI category albums can overlap.

Formerly thing sorted. Version 0.12.0 updates the Windows app name, supplied logo, Athiti interface typography and Birthstone memory words, quotes and captions, larger interface text, title-case presentation, card borders and shadows. Created By TheEpicMonolouge. Existing ThingSorted data directories and application ID are intentionally retained for upgrade compatibility.

Athiti and Birthstone are bundled locally with their SIL Open Font License notices. No remote font requests are made.

## About Memory Lane

A private Windows photo application for personal use. Version **0.12.0** includes trips, a photo orbit, a virtual gallery, metadata controls, optional similarity review, and a self-contained Windows x64 installer. English-only interface. Optional AI uses the user's own provider, model, endpoint, and key; there is no bundled credential or local AI model. No Memory Lane account, analytics, or automatic updates.

## Open the application

Run `release\Memory-Lane-0.15.0-windows-x64-setup.exe`, then open **Memory Lane** from the Start menu. The installer is per-user and includes Electron, Python, and the image decoders. A separate Python or Node installation is not needed to run it. It is unsigned; Windows may identify the publisher as unknown. Do not disable Windows security protections.

The source project is `D:\projects\Things Sorted`. **Start Memory Lane.cmd** remains the developer launcher. It uses the project's development dependencies. The standalone application is in `release\win-unpacked\Memory Lane.exe` with its accompanying folders; do not copy that executable alone.

**Release validation limit:** the packaged app is tested on this Windows 11 development PC. A clean Windows machine and Windows 10 have not been tested. The full M6 acceptance gate remains pending that check. See `MILESTONES-3-6.md` for evidence and `packaging\CLEAN-WINDOWS-CHECKLIST.md` for the remaining test.

## Bring in photos

1. Choose **Bring your photos home** or **All photos → Import photos**.
2. On the first import, choose a local folder for copied originals. The app creates `thing sorted library\originals` inside it.
3. Select files in the Windows picker. Your source files stay unchanged.
4. Open **Per-file results** to see added, duplicate, rejected, or cancelled outcomes.

Limits are 200 files, 256 MiB per file, 2 GiB per batch, 80 megapixels, and one active import batch. A 100 MiB free-space margin is retained. Exact SHA-256 duplicates are reported without adding another photo. A bad file does not abort the rest of the batch.

| Formats | Evidence and limits |
| --- | --- |
| JPEG, PNG, WEBP, HEIC/HEIF, TIFF, AVIF, BMP, still GIF | Generated-file import tests pass, including orientation and metadata-free previews |
| Nikon NEF, Canon CR2 | Real public RAW samples pass in backend tests |
| DNG, CR3, NRW, ARW, SR2, ORF, RW2, RAF, PEF, RAW, RWL, 3FR, IIQ | Accepted for LibRaw decoding; individual camera variants are not all tested |

Multi-page TIFF, animated and multi-frame images are rejected. RAW compatibility depends on the camera and decoder. RAW previews use half-resolution demosaicing. Color-critical/HDR fidelity is not certified. Thumbnails are at most 480 pixels on their longest edge; previews are at most 1600. Copied originals retain their original bytes and metadata.

## Organize and explore

- **Trips & albums:** create or edit names and optional dates. In All photos, select up to 500 photos, choose a destination, and click **Move selected**. Each photo belongs to at most one trip. Removing a trip keeps its photos and makes them unassigned.
- **Group unassigned by date:** an explicit, confirmed action creates editable daily trips. It uses recorded dates, including fallbacks; it does not infer destinations.
- **All photos:** filter by trip, date range, or filename. The gallery renders visible rows and loads bounded chunks. Scroll, Page Up, and Page Down work. Clear filters to return to the whole collection.
- **Photo orbit:** choose trips or months. The latest four groups each show up to 18 photos; group counts represent the rest. Open All photos to see the complete collection. Tab to a photo and press Enter/Space to open it.
- **Viewer:** use Left/Right arrows, Previous/Next, or Esc. Click the image to enlarge it. Details show the date source and let you assign a trip or choose its cover.

Window bounds and the last view are remembered. Light mode uses beige with dominant maroon/red; dark mode uses soft black and maroon/red. Gold is a small accent. Preferences and the Windows reduced-motion setting control animation.

## Dates, location, and duplicates

Capture dates use EXIF DateTimeOriginal when readable, then the source file's modified time, then import time. The source is displayed. Camera time without a timezone remains timezone-unspecified. Date filters use the recorded calendar date. Some RAW metadata cannot be read by Pillow and uses the documented fallback.

EXIF coordinates are stored locally by default and hidden in photo details until enabled. Preferences can stop storing coordinates for future imports. **Forget stored locations** clears the live catalog coordinates and disables new collection; it does not rewrite originals. Earlier database backups may retain coordinates. Generated previews contain no EXIF/GPS.

**Duplicates → Find similar photos** explicitly starts a local comparison of 64-bit difference hashes. This is an image-pattern algorithm, not an AI model. Review suggestions with **Keep both** or **Mark as similar**; both choices keep both originals. Decisions persist. The bounded search uses a five-bit threshold, limited candidate buckets, and up to 200 new suggestions per pass. It can miss lookalikes or suggest unrelated simple scenes. An interrupted scan can be restarted; saved decisions remain.

## Storage and recovery

`%APPDATA%\ThingSorted\catalog\` contains `library.db`, `staging`, `thumbnails`, `previews`, and pre-migration database `backups`. Originals live in the separately chosen library folder. No source images, database, or test collections are bundled into the installer.

Imports stream into bounded staging files, validate content and dimensions, generate previews, copy originals atomically, verify hashes, and commit transactions. SQLite uses WAL and full synchronization. Database upgrades back up the previous schema; future or unrecognized schemas are refused.

Queued complete copies resume after restart. Partial source copies require reselecting the originals. **Retry retained copies** appears when recoverable staging data exists. Cancel stops pending work; an active decoder can take time to finish. Photos already committed remain.

Uninstall keeps app data by default. Interactive uninstall can move the fixed app-data folder to the Recycle Bin after confirmation. Silent uninstall and upgrades keep data. The chosen original library is kept; the helper refuses to recycle the profile if the catalog points to originals inside it. Backup/restore, individual-photo deletion, and library relocation controls remain unfinished.

## Security model

The renderer uses local `thing://app` assets, strict CSP, sandboxing, context isolation, and no Node or direct network access. The typed preload exposes validated operations only. Photo requests use IDs. Native Windows pickers return paths only to the main process.

The local backend binds a reserved random loopback port and requires an exact Origin plus a random per-launch token. The token never enters renderer JavaScript. Requests, concurrency, sizes, and rates are limited. Thumbnail bursts are queued in the desktop process. Linked paths, UNC shares, traversal, and reserved Windows names are rejected. Backend processes shut down with their parent.

Diagnostics contain software versions and fixed error codes, without photos, GPS, paths, or tokens. Core photo operations stay local. Optional AI sends explicitly entered notes or selected resized photo previews to the user-configured HTTPS provider after consent. No telemetry exporter is included. Build downloads and vulnerability audits contact package services. This is not protection against malicious software running as the same Windows user or administrator.

## Build from source

Build prerequisites are Windows x64, Python 3.12 and Node/npm. This build used Python 3.12.5 and Node 25.9.0; other build-tool versions are unverified. Running the installed app requires neither tool.

In **PowerShell**, these commands create the local Python environment and install the exact hashed test/build dependencies. Internet access is needed for dependencies; expect successful installations.

```powershell
Set-Location 'D:\projects\Things Sorted\backend'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --require-hashes -r requirements-dev.lock -r requirements-build.lock
Set-Location '..\desktop'
npm.cmd ci
npm.cmd run build
```

From the project folder, double-click **Build installer.cmd**. It collects notices, freezes the backend with PyInstaller, builds the desktop, and creates the NSIS installer in `release`. It stops on build failures and does not install system software. The equivalent PowerShell command is:

```powershell
Set-Location 'D:\projects\Things Sorted'
.\backend\.venv\Scripts\python.exe packaging\build.py
```

## Run checks

In **PowerShell**, run the following from the project folder. Expect passing pytest, Ruff, TypeScript/build, ESLint, Prettier, and Playwright checks. The two real-RAW tests skip unless `THING_RAW_FIXTURES` points to the documented test-only sample directory from `MILESTONE-2.md`.

```powershell
Set-Location 'D:\projects\Things Sorted'
.\backend\.venv\Scripts\python.exe -m pytest backend\tests
.\backend\.venv\Scripts\ruff.exe check backend\app backend\tests backend\migrations backend\entry.py packaging
.\backend\.venv\Scripts\ruff.exe format --check backend\app backend\tests backend\migrations backend\entry.py packaging
Set-Location desktop
npm.cmd run build
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
```

Desktop tests open real windows using temporary profiles and synthetic photos. To test the packaged executable from the desktop directory, set the following environment variable and run the two release tests. The import test restricts the application's PATH to Windows directories.

```powershell
$env:THING_PACKAGED_BINARY='D:\projects\Things Sorted\release\win-unpacked\Memory Lane.exe'
npm.cmd exec playwright -- test tests/collections.spec.ts tests/performance.spec.ts
Remove-Item Env:THING_PACKAGED_BINARY
```

## Dependencies and current audit

Runtime versions are pinned in `package-lock.json` and `backend\requirements.lock`; test and build locks are separate. Packaging uses PyInstaller 6.22.3 and electron-builder 26.18.0. Send2Trash 2.1.0 handles the confirmed Recycle Bin option. License texts and metadata are installed under `resources\notices`; Electron/Chromium notices are beside the executable.

The latest build audit found no known Python build/runtime vulnerabilities and no npm production findings. The full npm development tree has 24 moderate findings, caused by a minimatch advisory affecting build/lint dependencies; zero high/critical findings were reported. Some installer transitive packages also carry deprecation notices. They are not shipped as application runtime modules. Forced major overrides were avoided because older glob consumers use incompatible APIs. These findings remain documented build-tool debt; rerun `npm.cmd audit` before future builds.

## Not yet implemented

- Clean-machine installer validation and Windows 10 verification.
- Code signing and automatic updates; updates remain manual.
- Additional languages are deferred by request; the interface is English-only.
- Individual-photo deletion and library relocation. Folder watching and backup/restore are implemented; final release acceptance remains pending.
- Native provider protocols other than OpenAI-compatible Chat Completions and Responses; unattended automatic tagging and unseeded face clustering are not implemented.

If the library drive is disconnected or full, restore access/free space and retry. For connection errors, use **Try again** or **Copy diagnostics**. Keep Windows security settings enabled. Consult `MILESTONES-3-6.md` for the acceptance checks and remaining limits.

## Optional AI: bring your own provider and key

Open **API key / Optional AI** near the bottom of the sidebar. Enter your provider's full HTTPS endpoint, model ID, API format, and personal key. No key or provider account is included with thing sorted, and there is no environment-variable or public-key fallback. The key is encrypted with Electron's asynchronous Windows safeStorage API, alongside its endpoint and model, in `ai-credential.bin` under the app profile. It is never returned to the renderer after saving, added to diagnostics, or copied by photo backup/restore. Windows protection does not protect against malicious software operating as the same Windows user.

Supported wire formats are OpenAI-compatible Chat Completions (`messages`, `max_tokens`) and Responses (`input`, `max_output_tokens`, `store:false`). Use the full endpoint provided by your service, such as its `/v1/chat/completions` or `/v1/responses` path. Other native protocols and model-specific parameters are not supported. Provider access, pricing, and data policies depend on the user's account. No particular paid model is selected automatically.

After saving, choose captions, tags, or album ideas. Enter notes, check the per-request consent box, and press **Generate with my key**. Only those notes and the task instruction are sent; there is no automatic attachment of photos, EXIF, GPS, filenames, paths, or catalog contents. Suggestions are plain text, do not execute actions, and do not modify the collection. Results and notes are cleared when the panel closes. Each request requires fresh consent. No automatic retries are made.

Requests originate in Electron's main process over HTTPS, never follow redirects, allow one active request, cap input at 6,000 characters, cap requested output at 1,200 tokens, bound replies to 1 MiB, and time out after 60 seconds. Cancel/closing the panel/closing the app aborts the local request; a provider may still charge for work already started. Remove key deletes the local credential and disables AI. Removing it here does not revoke it at the provider; use that provider's account controls to revoke a key.

The notes tool is a text-based inspiration assistant. Photo analysis is available separately in All photos and the photo viewer. After preview-sharing consent, it automatically classifies photos into the categories selected by the user and creates matching AI albums. Development verification uses only dummy credentials and mocked HTTPS responses, not a live paid provider.

API references: https://developers.openai.com/api/docs/guides/text and https://www.electronjs.org/docs/latest/api/safe-storage

## Automatic AI albums (0.10.0)

Open All photos, select up to 20 photos or use **AI categorize this view**, choose the categories to sort into, allow preview sharing, and press **Classify & create albums**. AI determines each photo's categories and saves matching album memberships automatically. There is no editable label list or manual review/save step. Albums appear under **Trips & albums > AI albums**. A photo can belong to several albums without duplicating or moving its original file. Existing trips remain independent.

Reclassifying selected categories replaces only those categories for each successfully processed photo. Categories outside the chosen scope remain intact. Processing stops on errors; previous successful photos remain organized. Continue sorting within the same panel skips completed photos. No confident match leaves the photo outside the chosen albums. Incorrect AI classifications can be corrected by re-running classification; recognition accuracy is provider-dependent.

For people, open a clear single-person portrait, enter a name, and choose **Name person & use reference**. Enable named-people sorting when classifying other photos. Up to eight references are supported. Names are display labels stored locally and included in backups; prompts use anonymous group IDs, not the names. Matching is approximate and may be declined by a provider. Name changes update the corresponding album title. Remove the reference to stop sending it in future comparisons; existing classifications remain.

Only resized 480-pixel JPEG previews are sent, with no attached EXIF/GPS metadata, filenames, original paths, or original files. Visible image content can still reveal people or places. Each request may incur charges. Groq reference comparisons are split into groups of two references plus one target to stay within the documented three-image limit; eight references can require four requests per target. Failed responses do not partially update that photo's category memberships.

### Groq setup and the HTTP 404 fix

The old setup accepted a base URL without appending the request route, causing HTTP 404 for `https://api.groq.com/openai/v1`. The app now expands API base URLs ending in `/v1` (or `/v1beta`) into the selected Chat Completions or Responses endpoint and rejects endpoint/protocol mismatches.

For Groq photos, open **API key**, choose **Use Groq vision settings**, then **Save provider & key**:

- API format: OpenAI-compatible Chat Completions.
- Full endpoint: `https://api.groq.com/openai/v1/chat/completions`.
- Vision model currently suggested by Groq's documentation: `qwen/qwen3.8-27b`.
- Use your own Groq key. A blank key retains the saved credential only when the destination origin is unchanged; it never transfers a saved credential to another provider.

`openai/gpt-oss-20b` is a text-only model, so photo requests now fail locally with an actionable explanation before any photo is uploaded. It can still be used for text tools. Model availability and permissions depend on the user's account. The preset is editable and does not make a network request until an AI action is explicitly run.

**Test vision connection (uses API credits)** sends a fixed synthetic sample, not a user photo. It verifies the route/model/image response format. There are no live connection tests at app startup or while saving credentials. The test uses the user's provider credits when invoked; development tests use mocked responses and dummy keys.

References checked November 1, 2026: https://console.groq.com/docs/vision and https://console.groq.com/docs/model/openai/gpt-oss-20b

## Provider Presets (0.15.0)

Use Groq Vision Settings, Use Gemini Vision Settings, or Use OpenAI Vision Settings in the API key panel. Gemini uses a Google AI Studio key with `gemini-3.1-flash-lite` through `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`. OpenAI uses an OpenAI API key with `gpt-4.1-mini`. Models remain editable. A saved configuration does not verify authentication, model access, quota, or billing; use Test Vision Connection explicitly to make a billable test request.

Preset changes clear typed credentials when the destination origin changes. Existing encrypted credentials are reused only for the same provider origin. No built-in key is supplied. Notes have output limits of 128 tokens for tags, 256 for captions, and 384 for album ideas. Photo classification retains its 256-token limit and skips categorised photos; Gemini Flash-Lite requests minimal reasoning. Limits are ceilings, not promised billing reductions. Tests use dummy keys and mocked provider responses, not live accounts.

Protocol references: [Google Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai), [OpenAI GPT-4.1 Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
