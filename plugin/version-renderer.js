var ipcRenderer = require('electron').ipcRenderer;
var remote = require('electron').remote;

$('#saveButton').on('click', () => {
    var version=$('#versionID').val();
    ipcRenderer.send('setVersionInfo', version);
})