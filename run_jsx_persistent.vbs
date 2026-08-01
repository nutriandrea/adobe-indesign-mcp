' run_jsx_persistent.vbs — persistent mode for InDesign MCP bridge.
' Reads script paths from stdin, executes each, echoes result to stdout.
' NO diagnostic output — only the script result goes to stdout.
Option Explicit
Const JAVASCRIPT_LANG = 1246973031

Dim fso, inDesign, result, line, jsxText
Set fso = CreateObject("Scripting.FileSystemObject")

' Create InDesign instance (first call; subsequent calls reuse)
On Error Resume Next
Set inDesign = GetObject(, "InDesign.Application")
If Err.Number <> 0 Then
    Err.Clear
    Set inDesign = CreateObject("InDesign.Application")
    If Err.Number <> 0 Then
        WScript.Quit 2
    End If
End If
On Error GoTo 0

Do While Not WScript.StdIn.AtEndOfStream
    line = Trim(WScript.StdIn.ReadLine())
    
    If line = "" Then
        WScript.Echo ""
    ElseIf Not fso.FileExists(line) Then
        WScript.Echo "ERROR: File not found"
    Else
        On Error Resume Next
        jsxText = fso.OpenTextFile(line, 1).ReadAll
        If Err.Number <> 0 Then
            WScript.Echo "ERROR: Read failed"
            Err.Clear
        Else
            result = inDesign.DoScript(jsxText, JAVASCRIPT_LANG)
            If Err.Number <> 0 Then
                WScript.Echo "ERROR: " & Err.Description
                Err.Clear
            ElseIf Not IsEmpty(result) And Not IsNull(result) Then
                WScript.Echo result
            Else
                WScript.Echo ""
            End If
        End If
        On Error GoTo 0
    End If
Loop

Set inDesign = Nothing
