!macro customUnInstall
  ${IfNot} ${isUpdated}
    ${IfNot} ${Silent}
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Move Memory Lane's local catalog, previews, settings and catalog backups to the Recycle Bin? $\r$\n$\r$\nChoose No to keep your collection for a future reinstall (recommended). Your chosen original-photo library is always kept." IDNO keepThingData
      nsExec::ExecToStack '"$INSTDIR\resources\backend\thing-backend.exe" --recycle-app-data'
      Pop $0
      Pop $1
      ${If} $0 != 0
        MessageBox MB_OK|MB_ICONINFORMATION "Your app data was kept because it could not be safely moved to the Recycle Bin."
      ${EndIf}
      keepThingData:
    ${EndIf}
  ${EndIf}
!macroend
