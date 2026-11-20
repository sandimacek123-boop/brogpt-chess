; Quantumath.exe — tiny native launcher that starts the bundled Java runtime with the app jar.
Unicode true
!include "FileFunc.nsh"
!ifndef OUTFILE
  !define OUTFILE "Quantumath.exe"
!endif
Name "Quantumath"
OutFile "${OUTFILE}"
Icon "quantumath.ico"
SilentInstall silent
RequestExecutionLevel user
VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "Quantumath"
VIAddVersionKey "FileDescription" "Quantumath - Advanced Mathematics Laboratory"
VIAddVersionKey "FileVersion" "1.0.0"
VIAddVersionKey "ProductVersion" "1.0.0"
VIAddVersionKey "LegalCopyright" "Quantumath"

Section
  IfFileExists "$EXEDIR\runtime\bin\javaw.exe" +3
    MessageBox MB_ICONSTOP "Quantumath is incomplete: the bundled Java runtime was not found next to Quantumath.exe.$\nPlease reinstall Quantumath."
    Abort
  ${GetParameters} $R0
  Exec '"$EXEDIR\runtime\bin\javaw.exe" -Xmx1536m -Dfile.encoding=UTF-8 -Dsun.java2d.uiScale.enabled=true -jar "$EXEDIR\app\quantumath.jar" $R0'
SectionEnd
