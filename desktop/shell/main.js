import {app,BrowserWindow,protocol,ipcMain,dialog,Menu} from 'electron';
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
protocol.registerSchemesAsPrivileged([{scheme:'castaway',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const qa=process.argv.includes('--qa'),testArg=process.argv.find(s=>s.startsWith('--minute='));
app.setName('The Castaway');app.setAppUserModelId('uk.castaway.desktop');
// The PC target has 64 GB RAM. Leave headroom for detailed shader compilation
// and large old islands without changing a single authoritative simulation step.
app.commandLine.appendSwitch('js-flags','--max-old-space-size=8192');
const stateArg=process.argv.find(s=>s.startsWith('--state-dir='))?.slice(12);
if(stateArg){await fs.mkdir(path.join(stateArg,'browser'),{recursive:true});app.setPath('userData',path.join(stateArg,'browser'));}
if(qa&&!process.argv.some(s=>s.startsWith('--remote-debugging-port'))){app.commandLine.appendSwitch('remote-debugging-port','9223');app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');}
let win,worker,last,lastConnection,closing=false,closed=false;
if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',()=>{if(win){win.show();win.focus();}});
app.whenReady().then(async()=>{
protocol.handle('castaway',async request=>{
 const u=new URL(request.url);if(u.hostname!=='app')return new Response('Not found',{status:404});
 const relative=decodeURIComponent(u.pathname).replace(/^\//,'');let candidate=path.resolve(root,relative||'desktop/ui/index.html');
 if(relative.startsWith('vendor/three/')&&!app.isPackaged)candidate=path.resolve(root,'desktop/node_modules/three',relative.slice(13));
 if(relative.startsWith('vendor/astronomy-engine/')&&!app.isPackaged)candidate=path.resolve(root,'desktop/node_modules/astronomy-engine',relative.slice(24));
 const allowed=['desktop/ui','desktop/render','v2/src','vendor/three','vendor/astronomy-engine',...(!app.isPackaged?['desktop/node_modules/three','desktop/node_modules/astronomy-engine']:[])].some(p=>candidate.startsWith(path.join(root,p)+path.sep));
 if(!allowed)return new Response('Forbidden',{status:403});
 try{const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(candidate)]||'application/octet-stream';return new Response(await fs.readFile(candidate),{headers:{'Content-Type':mime,'Cache-Control':'no-store'}});}catch(e){console.error('Local asset:',candidate,e.message);return new Response('Not found',{status:404});}
});
win=new BrowserWindow({width:1600,height:1000,minWidth:1000,minHeight:700,show:false,title:'The Castaway',backgroundColor:'#182d30',autoHideMenuBar:true,webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
Menu.setApplicationMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('castaway://app/'))e.preventDefault();});
const userDir=stateArg||path.join(app.getPath('appData'),'The Castaway');
worker=new Worker(path.join(root,'desktop/runtime/worker.js'),{workerData:{root,userDir,testMinute:testArg?Number(testArg.slice(9)):undefined,offline:process.argv.includes('--offline')}});
worker.on('message',m=>{if(m.type==='snapshot')last=m;if(m.type==='connection')lastConnection=m;if(m.type==='closed'){closed=true;app.quit();return;}if(!win.isDestroyed())win.webContents.send('world',m);});
worker.on('error',e=>{if(!win.isDestroyed())win.webContents.send('world',{type:'error',message:e.stack});});
worker.on('exit',code=>{if(code&&!closing)dialog.showErrorBox('The island stopped',`The simulation process stopped (${code}). Your last saved world is retained. Restart the application to resume.`);});
const trusted=e=>e.sender===win.webContents&&e.senderFrame.url.startsWith('castaway://app/');
ipcMain.on('ready',e=>{if(trusted(e)){if(last)e.sender.send('world',last);if(lastConnection)e.sender.send('world',lastConnection);worker.postMessage({type:'snapshot'});}});
ipcMain.on('save',e=>{if(trusted(e))worker.postMessage({type:'save'});});
ipcMain.on('fullscreen',e=>{if(trusted(e))win.setFullScreen(!win.isFullScreen());});
ipcMain.handle('diagnostics',async e=>{if(!trusted(e))throw Error('Invalid sender');return{version:app.getVersion(),gpu:await app.getGPUInfo('basic'),features:app.getGPUFeatureStatus(),userDir,minute:last?.t};});
ipcMain.handle('export-save',async e=>{if(!trusted(e)||!last)return;const {filePath,canceled}=await dialog.showSaveDialog(win,{defaultPath:'Castaway-world.json',filters:[{name:'World checkpoint',extensions:['json']}]});if(!canceled){await fs.writeFile(filePath,JSON.stringify({t:last.t,blob:last.blob,thoughts:last.thoughts}));return true;}});
win.webContents.on('render-process-gone',(_,details)=>{console.error('Renderer exited',details);fs.appendFile(path.join(userDir,'renderer-events.jsonl'),JSON.stringify({at:new Date().toISOString(),...details})+'\n').catch(()=>{});if(!closing)win.reload();});
win.once('ready-to-show',()=>{if(!qa)win.show();});
win.on('close',e=>{if(!closed){e.preventDefault();if(!closing){closing=true;worker.postMessage({type:'close'});}}});
app.on('before-quit',e=>{if(!closed&&worker){e.preventDefault();if(!closing){closing=true;worker.postMessage({type:'close'});}}});
await win.loadURL('castaway://app/desktop/ui/index.html'+(qa?'?qa=1':''));
}).catch(e=>{console.error(e);if(!qa)dialog.showErrorBox('The Castaway could not start',e.message);app.exit(1);});
