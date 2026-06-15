Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Owner\report-saas\market\note-bot"
WshShell.Run "cmd /c ""C:\Program Files\nodejs\npm.cmd"" run post >> logs\run.log 2>&1", 0, False
