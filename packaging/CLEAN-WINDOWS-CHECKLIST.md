# Clean Windows acceptance — not yet executed

Use a separate Windows x64 test machine or existing disposable VM with no Python/Node installation. This development PC is Windows 11 Home and has no Windows Sandbox. Do not enable system features or erase an existing machine for this test.

1. Copy the installer and its SHA-256 manifest to the test machine. Compare its hash with `Get-FileHash -Algorithm SHA256` in PowerShell. Do not disable Windows security features if the unsigned publisher is flagged.
2. Run setup as a standard user. Expect a per-user install, supplied logo, Start-menu shortcut, and no Python/Node setup requirement.
3. Disconnect network access using the VM's normal controls, then launch. Expect the welcome screen and HEALTH OK.
4. Import five disposable photos including JPEG, PNG, TIFF and HEIC. Expect previews in All photos and Photo orbit. Reimport one: expect an exact-duplicate report and unchanged total. Import a text file renamed JPG: expect a clear rejection.
5. Create a trip, select two photos, move them into it, and filter by that trip. Expect two photos. Open the viewer, choose a cover, and verify capture-date source. Test a real camera RAW sample for each camera variant you need.
6. Enable location display for a disposable GPS-tagged image. Turn it off and expect hidden coordinates. Forget stored locations and expect no live-catalog coordinates; originals remain unchanged.
7. Start similarity review, review a suggested pair if one appears, and confirm both originals remain. Results are approximate.
8. Switch light/dark appearance and reduced motion. Resize to 820 × 640. Navigate with Tab, Enter, arrows and Esc. Expect visible focus, no horizontal page overflow, and no essential animation.
9. Close and reopen. Expect photos, trips, preferences, last view, and window bounds to persist.
10. Uninstall and choose **No** at the app-data question (default). Confirm the chosen original library and app data remain. Reinstall and verify the collection is restored.
11. With a separate disposable test collection only, uninstall and choose **Yes** to recycle app data. Verify the data is in the Recycle Bin and the external original library is still present. Do not use this optional destructive-path check with irreplaceable photos.
12. Record OS build, standard-user status, installer SHA-256, results, and any exact error. M6 is accepted only after this clean-machine evidence and your review.
