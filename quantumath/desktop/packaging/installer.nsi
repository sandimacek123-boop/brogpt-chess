; Quantumath Windows installer (per-user, no administrator rights required).
Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define APPNAME "Quantumath"
!define APPVERSION "1.0.0"
!define PUBLISHER "Quantumath"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quantumath"
!ifndef STAGE
  !define STAGE "stage"
!endif
!ifndef OUTFILE
  !define OUTFILE "Quantumath-${APPVERSION}-Setup.exe"
!endif

Name "${APPNAME} ${APPVERSION}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\Quantumath"
InstallDirRegKey HKCU "Software\Quantumath" "InstallDir"
RequestExecutionLevel user
BrandingText "Quantumath ${APPVERSION}"
VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "Quantumath"
VIAddVersionKey "FileDescription" "Quantumath ${APPVERSION} Setup"
VIAddVersionKey "FileVersion" "${APPVERSION}"
VIAddVersionKey "ProductVersion" "${APPVERSION}"
VIAddVersionKey "LegalCopyright" "Quantumath"

!define MUI_ICON "quantumath.ico"
!define MUI_UNICON "quantumath.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to Quantumath ${APPVERSION}"
!define MUI_WELCOMEPAGE_TEXT "Quantumath is an offline mathematics laboratory: precise calculator, equation solver, graphing, calculus, linear algebra, statistics, number theory, fractals, lessons and challenges.$\r$\n$\r$\nIt is installed for your user account only and does not need administrator rights.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Quantumath.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Quantumath"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Quantumath (required)" SecMain
  SectionIn RO
  ; replace an older installation cleanly (user data in %APPDATA%\Quantumath is kept)
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  SetOutPath "$INSTDIR"
  File "${STAGE}\Quantumath.exe"
  File "quantumath.ico"
  SetOutPath "$INSTDIR\app"
  File "${STAGE}\app\quantumath.jar"
  SetOutPath "$INSTDIR\runtime"
  File /r "${STAGE}\runtime\*.*"
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Quantumath"
  CreateShortcut "$SMPROGRAMS\Quantumath\Quantumath.lnk" "$INSTDIR\Quantumath.exe" "" "$INSTDIR\quantumath.ico"
  CreateShortcut "$SMPROGRAMS\Quantumath\Uninstall Quantumath.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Quantumath" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "Quantumath"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${APPVERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\quantumath.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" $0
SectionEnd

Section "Desktop shortcut" SecDesktop
  CreateShortcut "$DESKTOP\Quantumath.lnk" "$INSTDIR\Quantumath.exe" "" "$INSTDIR\quantumath.ico"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "The Quantumath app with its own Java runtime (no separate Java install needed)."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Put a Quantumath shortcut on the desktop."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  Delete "$DESKTOP\Quantumath.lnk"
  RMDir /r "$SMPROGRAMS\Quantumath"
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  Delete "$INSTDIR\Quantumath.exe"
  Delete "$INSTDIR\quantumath.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\Quantumath"
  ; your notebook, history and settings stay in %APPDATA%\Quantumath
SectionEnd
