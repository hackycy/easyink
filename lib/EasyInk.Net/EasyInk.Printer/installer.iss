#ifndef AppVersion
#define AppVersion "1.0.0"
#endif

[Setup]
AppId={{E7A3B2C1-D4F5-4E6A-9B8C-1A2B3C4D5E6F}
AppName=EasyInk Printer
AppVersion={#AppVersion}
AppPublisher=EasyInk
DefaultDirName={autopf}\EasyInk Printer
DefaultGroupName=EasyInk Printer
OutputDir=output
OutputBaseFilename=EasyInkPrinter-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\EasyInk.Printer.exe
SetupIconFile=src\app.ico
; 需要管理员权限写入 Program Files
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut"; GroupDescription: "Additional options:"
Name: "autostart"; Description: "Start on Windows startup"; GroupDescription: "Additional options:"

[Files]
; 发布产物 - 先手动执行 dotnet publish -c Release 再打包
Source: "src\bin\Release\net48\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\EasyInk Printer"; Filename: "{app}\EasyInk.Printer.exe"
Name: "{group}\Uninstall EasyInk Printer"; Filename: "{uninstallexe}"
Name: "{autodesktop}\EasyInk Printer"; Filename: "{app}\EasyInk.Printer.exe"; Tasks: desktopicon

[Registry]
; 清理旧版本程序内设置写入的重复自启动项，避免登录时启动两个实例
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "EasyInkPrinterHost"; Flags: deletevalue; Tasks: autostart
; 开机自启动
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "EasyInkPrinter"; ValueData: """{app}\EasyInk.Printer.exe"" --autostart"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\EasyInk.Printer.exe"; Description: "Launch EasyInk Printer"; Flags: nowait postinstall skipifsilent
