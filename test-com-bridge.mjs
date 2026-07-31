#!/usr/bin/env node
/**
 * Test the Windows COM bridge
 */
import { execFile } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const BRIDGE_VBS = resolve('./run_jsx.vbs');

async function runScript(code) {
  return new Promise((resolve, reject) => {
    const tmpFile = join(tmpdir(), `test-${Date.now()}.jsx`);
    writeFileSync(tmpFile, code, 'utf8');
    execFile('cscript', ['//nologo', BRIDGE_VBS, tmpFile], { timeout: 15000 }, (err, stdout, stderr) => {
      try { unlinkSync(tmpFile); } catch {}
      if (err) reject(new Error((stderr || err.message || 'Script failed').substring(0, 500)));
      else resolve((stdout || '').trim());
    });
  });
}

async function test() {
  console.log('🧪 Testing Windows COM Bridge\n');
  
  console.log('Test 1: Get InDesign version...');
  const r1 = await runScript('app.scriptPreferences.userInteractionLevel = 1699311169; var r = app.version; r;');
  console.log('✅ Result:', r1);
  
  console.log('\nTest 2: Create document...');
  const r2 = await runScript('app.scriptPreferences.userInteractionLevel = 1699311169; var doc = app.documents.add(true); var r = "{name:\\"" + doc.name + "\\",pages:" + doc.pages.length + "}"; doc.close(); r;');
  console.log('✅ Result:', r2);
  
  console.log('\nTest 3: Create document with text...');
  const r3 = await runScript('app.scriptPreferences.userInteractionLevel = 1699311169; var doc = app.documents.add(true); var tf = doc.pages.item(0).textFrames.add(); tf.geometricBounds = [72, 72, 200, 468]; tf.contents = "Hello from Windows COM Bridge!"; var r = "{name:\\"" + doc.name + "\\",text:\\"" + tf.contents + "\\"}"; doc.close(); r;');
  console.log('✅ Result:', r3);
  
  console.log('\nTest 4: Export to IDML...');
  const outPath = 'C:/Users/skype/AppData/Local/Temp/com-bridge-test.idml';
  const r4 = await runScript(`app.scriptPreferences.userInteractionLevel = 1699311169; var doc = app.documents.add(true); var tf = doc.pages.item(0).textFrames.add(); tf.contents = "COM Bridge Test"; doc.exportFile(ExportFormat.INDESIGN_MARKUP, File("${outPath}"), false); var r = "{exported:true,path:\\"" + "${outPath}" + "\\"}"; doc.close(); r;`);
  console.log('✅ Result:', r4);
  
  console.log('\n🎉 All COM bridge tests passed!');
}

test().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
