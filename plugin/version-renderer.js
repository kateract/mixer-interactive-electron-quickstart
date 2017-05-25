var ipcRenderer = require('electron').ipcRenderer;
var remote = require('electron').remote;
var shell = require('electron').shell;


$('#saveButton').on('click', () => {
    var version=$('#versionID').val();
    ipcRenderer.send('setVersionInfo', version);
})

$('#mixerstudio').on('click', () => {
    shell.openExternal('https://mixer.com/i/studio');
})