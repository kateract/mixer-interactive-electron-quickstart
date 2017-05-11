var ipcRenderer = require('electron').ipcRenderer;
var remote = require('electron').remote;

$('#saveButton').on('click', () => {
    var version=$('#versionID').val();
    ipcRenderer.send('setOauthClientInfo', version);
    var window = remote.getCurrentWindow();
    window.close();
})