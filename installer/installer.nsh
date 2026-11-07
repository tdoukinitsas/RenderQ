; RenderQ NSIS additions (electron-builder: build.nsis.include)
;
; RenderQ.exe isn't only the app: every AI agent with RenderQ's MCP server installed runs its own windowless
; RenderQ.exe in Node mode (the stdio bridge, see electron/mcpBridge.js). Those lock the program files, and the
; default "close the app" check can't close them. So: close RenderQ gracefully (it saves state on quit), stop
; any bridges, install, then start RenderQ again if it was running. Agents reconnect on their next tool call.

Var renderqWasRunning

!macro customCheckAppRunning
  StrCpy $renderqWasRunning "0"
  nsExec::ExecToStack `"$SYSDIR\cmd.exe" /c tasklist /fi "imagename eq ${APP_EXECUTABLE_FILENAME}" /nh | "$SYSDIR\find.exe" /i "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  Pop $1
  ${if} $0 == 0
    StrCpy $renderqWasRunning "1"
    DetailPrint "Closing RenderQ..."
    ; without /f: the window gets a close request, so RenderQ quits normally
    nsExec::Exec `"$SYSDIR\taskkill.exe" /im "${APP_EXECUTABLE_FILENAME}"`
    Sleep 3000
    ; whatever is left (agents' MCP bridges, a hung window)
    nsExec::Exec `"$SYSDIR\taskkill.exe" /f /t /im "${APP_EXECUTABLE_FILENAME}"`
    Sleep 1500
  ${endif}
!macroend

!macro customInstall
  ; Start RenderQ again if the installer closed it (auto-updates relaunch it themselves)
  ${if} $renderqWasRunning == "1"
  ${andIfNot} ${isUpdated}
    ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" ""
  ${endif}
!macroend
