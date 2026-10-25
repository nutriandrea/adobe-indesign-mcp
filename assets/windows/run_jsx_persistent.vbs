' run_jsx_persistent.vbs - persistent COM bridge for InDesign MCP.
' Adapted from @graydini's windows-com-bridge (PR #1). Thanks!
'
' Protocol: reads .jsx file paths from stdin, one per line; executes each via
' InDesign DoScript and echoes the result to stdout as one line. "ERROR: ..."
' marks a failure. Nothing else is ever written to stdout.
'
' Encoding: ComScriptExecutor writes the .jsx as UTF-8, so it is read back as
' UTF-8 through ADODB.Stream (FileSystemObject.OpenTextFile reads ANSI and
' turned every non-ASCII character into mojibake inside InDesign). cscript's
' stdout is ANSI as well, so every character above U+007F in a result or error
' line is written as a JSON-style \uXXXX escape. Results are the JSON produced
' by wrapExtendScript, where the escape is valid as-is; ComScriptExecutor
' decodes the escapes on "ERROR:" lines. Keep this file pure ASCII: cscript
' reads the .vbs itself as ANSI too.
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
        WScript.StdOut.WriteLine "ERROR: Cannot attach to InDesign - " & Err.Description
        WScript.Quit 2
    End If
End If
On Error GoTo 0

' Reads a whole file as UTF-8 text (with or without BOM).
Function ReadUtf8(path)
    Dim stm
    Set stm = CreateObject("ADODB.Stream")
    stm.Type = 2 ' adTypeText
    stm.Charset = "utf-8"
    stm.Open
    stm.LoadFromFile path
    ReadUtf8 = stm.ReadText(-1) ' adReadAll
    stm.Close
End Function

' Replaces every character above U+007F with its \uXXXX escape so the line
' survives cscript's ANSI stdout. Surrogate pairs come out as two escapes,
' which is exactly how JSON encodes them.
Function EscapeNonAscii(s)
    Dim i, c, out
    out = ""
    For i = 1 To Len(s)
        c = AscW(Mid(s, i, 1))
        If c < 0 Then c = c + 65536 ' AscW returns a signed 16-bit value
        If c > 127 Then
            out = out & "\u" & Right("0000" & Hex(c), 4)
        Else
            out = out & ChrW(c)
        End If
    Next
    EscapeNonAscii = out
End Function

Do While Not WScript.StdIn.AtEndOfStream
    line = Trim(WScript.StdIn.ReadLine())

    If line <> "" Then
        If Not fso.FileExists(line) Then
            WScript.StdOut.WriteLine "ERROR: Script file not found: " & line
        Else
            On Error Resume Next
            jsxText = ReadUtf8(line)
            If Err.Number <> 0 Then
                WScript.StdOut.WriteLine "ERROR: Read failed - " & EscapeNonAscii(Err.Description)
                Err.Clear
            Else
                result = inDesign.DoScript(jsxText, JAVASCRIPT_LANG)
                If Err.Number <> 0 Then
                    WScript.StdOut.WriteLine "ERROR: " & EscapeNonAscii(Err.Description)
                    Err.Clear
                ElseIf Not IsEmpty(result) And Not IsNull(result) Then
                    WScript.StdOut.WriteLine EscapeNonAscii(CStr(result))
                Else
                    WScript.StdOut.WriteLine ""
                End If
            End If
            On Error GoTo 0
        End If
    End If
Loop

Set inDesign = Nothing
