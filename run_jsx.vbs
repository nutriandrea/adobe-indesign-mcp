' Test COM behavior - check if GetObject finds the right instance
Option Explicit
Const JAVASCRIPT_LANG = 1246973031

Dim fso, jsxFile, jsxText, inDesign, result
Set fso = CreateObject("Scripting.FileSystemObject")

jsxFile = WScript.Arguments(0)
jsxText = fso.OpenTextFile(jsxFile, 1).ReadAll

' Method 1: Try GetObject first (reuse existing)
On Error Resume Next
Set inDesign = GetObject(, "InDesign.Application")
If Err.Number <> 0 Then
    WScript.Echo "GetObject failed: " & Err.Description & " (errno=" & Err.Number & ")"
    Err.Clear
    ' Fall back to CreateObject
    Set inDesign = CreateObject("InDesign.Application")
    If Err.Number <> 0 Then
        WScript.Echo "CreateObject failed: " & Err.Description
        WScript.Quit 2
    End If
    WScript.Echo "Created NEW instance"
Else
    WScript.Echo "Reused EXISTING instance"
End If
On Error GoTo 0

' Check what's running
result = "docs:" & inDesign.Documents.Count
WScript.Echo result

' Run the script
result = inDesign.DoScript(jsxText, JAVASCRIPT_LANG)
If Err.Number <> 0 Then
    WScript.Echo "DoScript error: " & Err.Description
    Set inDesign = Nothing
    WScript.Quit 3
End If

' Echo result to stdout
If Not IsEmpty(result) And Not IsNull(result) Then
    WScript.Echo result
End If

Set inDesign = Nothing
