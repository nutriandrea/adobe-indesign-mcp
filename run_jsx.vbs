' run_jsx.vbs — run ExtendScript inside InDesign via COM automation.
' Usage: cscript //nologo run_jsx.vbs <script.jsx>
' Echoes the script's return value to stdout (last expression).
' Does NOT quit InDesign — keeps the COM instance alive for the bridge.
Option Explicit
Const JAVASCRIPT_LANG = 1246973031   ' DoScript language = JavaScript (ExtendScript)

Dim fso, jsxFile, jsxText, inDesign, result
Set fso = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count > 0 Then
    jsxFile = WScript.Arguments(0)
Else
    WScript.Echo "Usage: cscript //nologo run_jsx.vbs <script.jsx>"
    WScript.Quit 1
End If

If Not fso.FileExists(jsxFile) Then
    WScript.Echo "JSX file not found: " & jsxFile
    WScript.Quit 1
End If

jsxText = fso.OpenTextFile(jsxFile, 1).ReadAll

On Error Resume Next
Set inDesign = CreateObject("InDesign.Application")
If Err.Number <> 0 Then
    WScript.Echo "CreateObject failed: " & Err.Description
    WScript.Quit 2
End If
On Error GoTo 0

' Execute the script; capture return value (last expression)
result = inDesign.DoScript(jsxText, JAVASCRIPT_LANG)
If Err.Number <> 0 Then
    WScript.Echo "DoScript error: " & Err.Description
    Set inDesign = Nothing
    WScript.Quit 3
End If

' Echo result to stdout — null/empty is fine, bridge handles it
If Not IsEmpty(result) And Not IsNull(result) Then
    WScript.Echo result
End If

Set inDesign = Nothing
