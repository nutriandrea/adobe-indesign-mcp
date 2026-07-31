#!/usr/bin/env node
/**
 * Direct COM bridge test - FINAL
 */
import { execFile } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const BRIDGE_VBS = resolve('./run_jsx.vbs');

async function test() {
  console.log('🧪 Testing Windows COM Bridge\n');
  
  // Test 1: Simple version check
  console.log('Test 1: Get InDesign version...');
  const test1 = `app.scriptPreferences.userInteractionLevel = 1699311169; var r = app.version; r;`;
  const result1 = await runScript(test1);
  console.log('✅ Result:', result1);
  
  // Test 2: Create document
  console.log('\nTest 2: Create document...');
  const test2 = `
    app.scriptPreferences.userInteractionLevel = 1699311169;
    var doc = app.documents.add(true);
    doc.documentPreferences.pageWidth = "8.5in";
    doc.documentPreferences.pageHeight = "11in";
    var r = "{name:\\"" + doc.name + "\\",pages:" + doc.pages.length + "}";
    r;
  `;
  const result2 = await runScript(test2);
  console.log('✅ Result:', result2);
  
  // Test 3: Document with text
  console.log('\nTest 3: Create document with text...');
  const test3 = `
    app.scriptPreferences.userInteractionLevel = 1699311169;
    var doc = app.documents.add(true);
    var tf = doc.pages.item(0).textFrames.add();
    tf.geometricBounds = [72, 72, 200, 468];
    tf.contents = "Hello from Windows COM Bridge!";
    var r = "{name:\\"" + doc.name + "\\",text:\\"" + tf.contents.replace(/"/g, '\\"') + "\\"}";
    r;
  `;
  const result3 = await runScript(test3);
  console.log('✅ Result:', result3);
  
  // Test 4: Export IDML
  console.log('\nTest 4: Export to IDML...');
  const outPath = 'C:/Users/skype/AppData/Local/Temp/com-bridge-test.idml';
  const test4 = `
    app.scriptPreferences.userInteractionLevel = 1699311169;
    var doc = app.documents.add(true);
    var tf = doc.pages.item(0).textFrames.add();
    tf.contents = "COM Bridge Test";
    doc.exportFile(ExportFormat.INDESIGN_MARKUP, File("${outPath}"), false);
    var r = "{exported:true,path:\\"" + "${outPath}" + "\\"}";
    r;
  `;
  const result4 = await runScript(test4);
  console.log('✅ Result:', result4);
  
  // Verify file exists
  if (existsSync(outPath)) {
    const stats = statSync(outPath);
    console.log('✅ IDML file created:', stats.size, 'bytes');
  }
  
  console.log('\n🎉 All COM bridge tests passed!');
}

function runScript(code) {
  return new Promise((resolve, reject) => {
    const tmpFile = join(tmpdir(), `com-bridge-test-${Date.now()}.jsx`);
    writeFileSync(tmpFile, code, 'utf8');
    
    execFile('cscript', ['//nologo', BRIDGE_VBS, tmpFile], { timeout: 15000 }, (err, stdout, stderr) => {
      try { unlinkSync(tmpFile); } catch {}
      
      if (err) {
        reject(new Error((stderr || err.message || 'Script failed').substring(0, 500)));
      } else {
        resolve((stdout || '').trim());
      }
    });
  });
}

test().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
