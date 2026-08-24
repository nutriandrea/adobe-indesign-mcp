' run_jsx_persistent.vbs — persistent COM bridge for InDesign MCP.
' Adapted from @graydini's windows-com-bridge (PR #1). Thanks!
'
' Protocol: reads .jsx file paths from stdin, one per line; executes each via
' InDesign DoScript and echoes the raw result to stdout. "ERROR: ..." marks a
' failure. Nothing else is ever written to stdout.
Option Explicit
Const JAVASCRIPT_LANG = 1246973031

Dim fso, inDesign, result, line, jsxText
Set fso = CreateObject("Scripting.FileSystemObject")

On Error Resume Next
Set inDesign = GetObject(, "InDesign.Application")
If Err.Number <> 0 Then
    Err.Clear
    Set inDesign = CreateObject("InDesign.Application")
    If Err.Number <> 0 Then
        WScript.StdOut.WriteLine "ERROR: Cannot attach to InDesign — " & Err.Description
        WScript.Quit 2
    End If
End If
On Error GoTo 0

Do While Not WScript.StdIn.AtEndOfStream
    line = Trim(WScript.StdIn.ReadLine())

    If line <> "" Then
        If Not fso.FileExists(line) Then
            WScript.StdOut.WriteLine "ERROR: Script file not found: " & line
        Else
            On Error Resume Next
            jsxText = fso.OpenTextFile(line, 1).ReadAll
            If Err.Number <> 0 Then
                WScript.StdOut.WriteLine "ERROR: Read failed — " & Err.Description
                Err.Clear
            Else
                result = inDesign.DoScript(jsxText, JAVASCRIPT_LANG)
                If Err.Number <> 0 Then
                    WScript.StdOut.WriteLine "ERROR: " & Err.Description
                    Err.Clear
                ElseIf Not IsEmpty(result) And Not IsNull(result) Then
                    WScript.StdOut.WriteLine result
                Else
                    WScript.StdOut.WriteLine ""
                End If
            End If
            On Error GoTo 0
        End If
    End If
Loop

Set inDesign = Nothing
