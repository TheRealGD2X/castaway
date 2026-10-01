const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('castaway',Object.freeze({
 subscribe(callback){const handler=(_,msg)=>callback(msg);ipcRenderer.on('world',handler);return()=>ipcRenderer.removeListener('world',handler);},
 ready:()=>ipcRenderer.send('ready'),save:()=>ipcRenderer.send('save'),fullscreen:()=>ipcRenderer.send('fullscreen'),
 diagnostics:()=>ipcRenderer.invoke('diagnostics'),exportSave:()=>ipcRenderer.invoke('export-save')
}));
