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
