import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build,Platform,Arch} from 'electron-builder';
import {sourceFingerprint} from '../runtime/storage.js';
const desktop=fileURLToPath(new URL('../',import.meta.url)),root=path.resolve(desktop,'..'),dist=path.join(desktop,'dist'),stage=path.join(dist,'app'),out=path.resolve(process.argv[2]||path.join(dist,'release'));
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Build the Windows x64 release on Windows x64.');
if(!stage.startsWith(dist+path.sep))throw Error('Invalid staging path');
await fs.rm(stage,{recursive:true,force:true});await fs.mkdir(stage,{recursive:true});await fs.mkdir(out,{recursive:true});
const copy=async(from,to=from)=>{await fs.cp(path.join(root,from),path.join(stage,to),{recursive:true,dereference:true});};
for(const name of ['runtime','shell','ui','render'])await copy('desktop/'+name);
await copy('v2/src');await copy('v2/package.json');await copy('data/v2/checkpoint.json');await copy('data/v2/mind.json');
for(const name of ['build','src','examples/jsm','LICENSE'])await copy('desktop/node_modules/three/'+name,'vendor/three/'+name);
await copy('desktop/node_modules/astronomy-engine/esm/astronomy.js','vendor/astronomy-engine/esm/astronomy.js'); // MIT notice is embedded in this distributed file.
await copy('desktop/node_modules/electron/LICENSE','THIRD-PARTY-ELECTRON.txt');
const pkg=JSON.parse(await fs.readFile(path.join(desktop,'package.json'),'utf8'));
await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,type:'module',main:'desktop/shell/main.js',description:pkg.description,author:'GD2X',private:true,dependencies:{}},null,2));
async function treeHash(base){const hash=createHash('sha256');async function visit(dir){for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,e.name),relative=path.relative(base,file).replaceAll('\\','/');if(e.isDirectory())await visit(file);else if(relative!=='build-manifest.json'){hash.update(relative);hash.update(await fs.readFile(file));}}}await visit(base);return hash.digest('hex');}
const manifest={version:pkg.version,builtUTC:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),simulationFingerprint:await sourceFingerprint(root),applicationTreeSHA256:await treeHash(stage),dependencies:pkg.dependencies,platform:'win32-x64',signing:'unsigned'};
await fs.writeFile(path.join(stage,'build-manifest.json'),JSON.stringify(manifest,null,2));await fs.writeFile(path.join(out,'build-manifest.json'),JSON.stringify(manifest,null,2));
process.env.ELECTRON_BUILDER_CACHE=path.join(dist,'builder-cache');await fs.mkdir(process.env.ELECTRON_BUILDER_CACHE,{recursive:true});await fs.writeFile(path.join(process.env.ELECTRON_BUILDER_CACHE,'package.json'),'{"type":"commonjs"}');process.env.CSC_IDENTITY_AUTO_DISCOVERY='false';
await build({projectDir:desktop,targets:Platform.WINDOWS.createTarget(['nsis','zip'],Arch.x64),publish:'never',config:{
 appId:'uk.castaway.desktop',productName:'The Castaway',electronVersion:pkg.dependencies.electron,electronDist:path.join(desktop,'node_modules/electron/dist'),asar:false,npmRebuild:false,compression:'normal',
 directories:{app:stage,output:out,buildResources:path.join(root,'desktop')},files:['**/*','!**/node_modules{,/**/*}'],extraFiles:[{from:path.join(desktop,'README.md'),to:'README.md'},{from:path.join(desktop,'RENDERING.md'),to:'RENDERING.md'}],
 afterPack:async({appOutDir})=>{const packed=path.resolve(appOutDir,'resources/app');if(!packed.startsWith(path.resolve(out)+path.sep))throw Error('Unexpected packaged application path');
  // Browser libraries are explicitly vendored; no development Node packages
  // (including Electron's duplicate runtime) belong in the distributable.
  if(await fs.stat(path.join(packed,'node_modules')).catch(()=>null))throw Error('Unexpected Node dependencies in the staged release');
  const fingerprint=await sourceFingerprint(packed);if(fingerprint!==manifest.simulationFingerprint)throw Error('Packaging changed simulation sources');
  if(await treeHash(packed)!==manifest.applicationTreeSHA256)throw Error('Packaged files differ from the verified staging tree');
 },
 win:{icon:path.join(root,'icon-512.png'),signExecutable:false,signAndEditExecutable:true,requestedExecutionLevel:'asInvoker',artifactName:'The-Castaway-Windows-x64.${ext}'},
 nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,createDesktopShortcut:false,createStartMenuShortcut:true,runAfterFinish:false,deleteAppDataOnUninstall:false,artifactName:'The-Castaway-Setup.exe'},
 publish:null
}});
const sums=[];for(const name of ['The-Castaway-Setup.exe','The-Castaway-Windows-x64.zip']){const bytes=await fs.readFile(path.join(out,name));sums.push(createHash('sha256').update(bytes).digest('hex')+'  '+name);}
await fs.writeFile(path.join(out,'SHA256SUMS.txt'),sums.join('\n')+'\n');console.log('Windows release ready:',out);
