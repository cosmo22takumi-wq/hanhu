Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Owner\report-saas\market\chiebukuro-bot"
WshShell.Run "cmd /c ""C:\Program Files\nodejs\npm.cmd"" run run >> logs\run.log 2>&1", 0, False
