## 1.0.1 — November 6, 2026

- Fixed valid camera JPG/JPEG files with MPF multi-picture data being rejected as an extension mismatch. The primary picture is displayed at full resolution, while every byte of the imported original is preserved.
- Genuine extension mismatches now report the detected and expected formats. Corrupt files, oversized images, and unrelated multi-page/animated formats retain their existing checks.

## 1.0.0 — November 6, 2026

- Added Wrong Person / Category beside each categorisation result. It pauses an active batch, lets the user select the correct existing name or category, and moves only that imported copy. Corrections remain categorised and use no API credits. Incorrect person-reference assignments are cleared.
- Added responsive skeleton loading screens during startup and photo-result loading, with reduced-motion and app motion-setting support.
- Includes the named-person priority and verified album save-location changes described below.

## 0.16.0 — November 6, 2026

- Recognised named people take priority over subject and lighting categories: photos appear only in matching named-person albums, with one physical name folder. Multiple matched names retain a destination chooser. Existing mixed named-person records are repaired without repeating AI analysis.
- The imported-album action processes newly added copies (excluding re-import duplicates), skips completed photos, and opens a native save-location chooser once all selected photos are categorised. Cancelling preserves the current folders.
- Selected albums move into a unique Memory Lane Album folder at the chosen location. Moves verify SHA-256 before removing old imported copies, preserve external sources, refuse overwrites, and keep a recovery journal for interrupted saves.
- Saved locations persist across restart and remain available to the viewer, category-folder moves, duplicate review, and backup/restore. No new AI requests or tokens are needed to move saved photos.

## 0.15.0 — November 6, 2026

- Added Gemini (Google AI Studio, Gemini 3.1 Flash-Lite) and OpenAI (GPT-4.1 Mini) vision presets beside Groq. Model IDs remain editable.
- Gemini base URLs normalize to its Chat Completions compatibility endpoint; incompatible protocol choices are rejected before sending credentials.
- Switching preset origins clears any typed key. Saving settings is distinguished from successful provider verification.
- Notes now use 128 tokens for tags, 256 for captions, and 384 for album ideas. Classification retains its 256-token cap, reduced-detail scene previews and completed-photo skip. The Gemini Flash-Lite preset requests minimal reasoning.
- Provider authentication and quota still depend on the user's account. Tests use dummy keys and mocked HTTPS responses.

## 0.14.0 — November 4, 2026

- Mark As Similar permanently removes the lower estimated-quality imported copy, with a durable deletion journal; external sources are preserved. Quality uses resolution and normalized preview sharpness. Near ties retain a stable choice.
- Categorised photos are excluded before batch pagination and never sent to the provider again. Classification immediately assigns an organised folder, preferring named people. Older completed records get folders on startup.
- Others can be named; AI can discover one new broad subject category per image in the same request. Existing names and discovered categories persist and are backed up.
- Compact classification prompts, 256-token output limits, low-detail scene requests where supported, and category analysis only on the first people-reference batch.
- The top/left menu scrolls away with the page and can be collapsed. Collapse state is remembered.

# 0.13.0 — Organised Files And Glass Navigation

- Persist Already Categorised state, including empty results, and skip future AI requests.
- Move managed imported copies into one chosen category folder. Prefer named people, and show a chooser for multiple matches.
- Keep source files unchanged, refuse overwrites, recover interrupted moves, and preserve organised layout in backup/restore.
- Fit images by default, with explicit 100% and 200% zoom controls.
- Add top/left menu preference, hide only the menu scrollbar, add frosted glass, aurora motion and glowing button ripples.
- Preserve reduced-motion support and normal fonts for names.

# 0.12.0 — Albums And Sharp Photo Viewing

- Add a persistent Trip/Album choice, collection badges, and assignment controls.
- Migrate existing collections as trips; preserve album type in backups and restores.
- Regenerate high-quality previews from originals on demand, including full-resolution RAW decoding; zoom at native preview pixels.
- Use Athiti for photo, person, trip, and album names.
- Apply motion-toggle changes immediately.

# 0.11.0 — Memory Lane

- Rename the app and installer, with the supplied logo and Windows icon.
- Add bundled Athiti and Birthstone fonts, larger body text, title-case UI, stronger borders and layered shadows.
- Improve card spacing, narrow-window layout, and sidebar scrolling.
- Add Created By TheEpicMonolouge to the footer.
- Preserve app identity, library paths, settings, and credentials for existing installations.

# 0.10.0 working release

- Replaced manual category editing/review with selected-category AI classification and automatic, multiple album memberships.
- Added AI album cards under Trips & albums, person display names, and backup/restore of names.
- Fixed Groq base URL routing; added a vision preset, local text-only model detection, and an explicit synthetic-image connection test.
- Split Groq person comparisons to respect its three-image limit. Kept saved keys on same-origin changes only.
- Integration tests use simulated responses; live provider access and recognition accuracy remain unverified.

# 0.9.0 working release

- Added photo-based AI category suggestions through the user's own vision-capable provider and key.
- Multiple reviewed labels per photo, category filtering, manual corrections, and batches up to 20 photos.
- Added user-chosen anonymous person reference groups with optional, reviewable visual matching (up to eight references).
- Send only resized metadata-free previews after consent; never originals or automatic background uploads.
- Added persistent category schema migration and backup/restore support. Real-provider accuracy remains unverified.

# 0.8.0 working release

- English-only interface; other languages deferred at the user's request.
- Optional sidebar API-key panel with user-owned endpoint, model, protocol, and key. No shared/bundled credential or AI model.
- Encrypted Windows key storage, explicit per-request note sharing, text captions/tags/album ideas, cancellation, and key removal.
- Folder-watching and backup/restore work continues from M8. Clean-machine release acceptance remains pending.

# Changelog

## 0.6.0 — 2026-11-01

- Added persistent trips, bulk assignment, covers, date grouping, and filename/trip/date filters.
- Added the real photo orbit, virtual gallery, metadata viewer, keyboard focus restoration, and saved window/view state.
- Added EXIF dates with explicit fallback sources, GPS privacy controls, and optional non-AI similarity review that retains originals.
- Bundled Python and image decoders into a per-user Windows NSIS installer using the supplied icon.
- Verified installed-app import/restart and 5,000-photo behavior, including all 72 orbit images loading.
- Verified per-user installation, Start-menu registration, keep-data uninstall, and reinstall on this PC.
- Passed 53 backend tests; documented build-tool audit findings. Clean-machine and Windows 10 acceptance remain pending.
- English remains the default; extra languages and other M8 polish remain planned.

## 0.1.0 — 2026-10-30

- First Windows desktop foundation for thing sorted.
- Added supplied logo, animated orbit artwork, dark/light preferences and reduced-motion support.
- Added private FastAPI health service, authenticated desktop bridge, lifecycle supervision and failure recovery UI.
- Added security and lifecycle tests, exact dependency locks and setup documentation.
- Photo management and standalone installer remain future milestones.

## 0.2.0 — 2026-10-31

- Added native photo import, safe copies, per-file results, cancellation and retry.
- Added HEIC/HEIF, TIFF and RAW decoders alongside JPEG, PNG, WEBP, AVIF, BMP and still GIF.
- Added SQLite/Alembic catalog, exact duplicate prevention, durable import jobs and previews.
- Added paginated gallery, keyboard preview navigation and restart persistence.
- Updated the interface to red and maroon with supporting beige/soft black and gold accents.
- Refined motion and verified system reduced-motion behavior.
- Passed 43 backend tests and three desktop/recovery tests; dependency audits reported no known vulnerabilities.
