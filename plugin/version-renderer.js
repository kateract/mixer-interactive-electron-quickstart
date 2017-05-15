var ipcRenderer = require('electron').ipcRenderer;
var remote = require('electron').remote;
var shell = require('electron').shell;


$('#saveButton').on('click', () => {
    var version=$('#versionID').val();
    ipcRenderer.send('setVersionInfo', version);
})

$('#beamstudio').on('click', () => {
    shell.openExternal('https://beam.pro/i/studio');
})