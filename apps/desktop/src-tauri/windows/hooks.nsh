; Hooks of the Windows installer, which Tauri inserts into its own script
; (bundle.windows.nsis.installerHooks in tauri.conf.json).
;
; The released installer may point the app at a copy of the media library that its users serve
; themselves, in place of the published one (docs/media-library.md), with no build of its own:
;
;   Slidr_<version>_x64-setup.exe /S /MEDIA="https://media.example.org/slidr/"
;
; or with a media-library.json beside the installer, { "url": "https://media.example.org/slidr/" }.
; Either is written into media-library.json beside slidr.exe, which the app reads when it starts
; (src/media_library.rs); /MEDIA= wins over the file. /MEDIA= with no address takes the file away:
; back to the published library. An address the app cannot read leaves it with no library at all,
; never the published one. An install with neither leaves the file as it is, so an update, which
; the app runs with /UPDATE alone, keeps the address. An uninstall takes it away, except the one an
; update runs.
;
; The address is read here and not with GetOptions, which ends a value at the next "/": up to the
; next space, or between quotes. Quoted, it is also hidden from the GetOptions of Tauri's script,
; which would take a "/p" or "/r" in its path for /P or /R.

!macro NSIS_HOOK_POSTINSTALL
  Push $R0
  Push $R1
  Push $R2
  Push $R3

  StrCpy $R1 0
  slidr_media_seek:
    StrCpy $R0 $CMDLINE 7 $R1
    StrCmp $R0 "" slidr_media_beside
    StrCmp $R0 "/MEDIA=" slidr_media_found
    IntOp $R1 $R1 + 1
    Goto slidr_media_seek

  slidr_media_found:
    IntOp $R1 $R1 + 7
    StrCpy $R0 $CMDLINE "" $R1
    ; What ends the address: a space, or the quote it opens with.
    StrCpy $R2 " "
    StrCpy $R3 $R0 1
    ${If} $R3 == '"'
      StrCpy $R0 $R0 "" 1
      StrCpy $R2 '"'
    ${EndIf}
    StrCpy $R1 0
  slidr_media_end:
    StrCpy $R3 $R0 1 $R1
    StrCmp $R3 "" slidr_media_cut
    StrCmp $R3 $R2 slidr_media_cut
    IntOp $R1 $R1 + 1
    Goto slidr_media_end
  slidr_media_cut:
    StrCpy $R0 $R0 $R1
    ; The quote that closes "/MEDIA=<url>", quoted whole.
    StrCpy $R3 $R0 1 -1
    ${If} $R3 == '"'
      StrCpy $R0 $R0 -1
    ${EndIf}

    ${If} $R0 == ""
      Delete "$INSTDIR\media-library.json"
    ${Else}
      FileOpen $R1 "$INSTDIR\media-library.json" w
      FileWrite $R1 '{ "url": "$R0" }$\r$\n'
      FileClose $R1
    ${EndIf}
    Goto slidr_media_done

  slidr_media_beside:
    ${If} ${FileExists} "$EXEDIR\media-library.json"
      CopyFiles /SILENT "$EXEDIR\media-library.json" "$INSTDIR"
    ${EndIf}
  slidr_media_done:

  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    Delete "$INSTDIR\media-library.json"
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
