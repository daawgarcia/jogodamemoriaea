const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ea', {
  call: (action, data) => ipcRenderer.invoke('ea:call', action, data)
});
