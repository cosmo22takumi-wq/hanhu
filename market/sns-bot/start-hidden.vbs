Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Owner\report-saas\market\sns-bot"
WshShell.Run "cmd /c ""C:\Program Files\nodejs\npm.cmd"" run dev >> logs\startup.log 2>&1", 0, False
