var ipcRenderer = require('electron').ipcRenderer;
var remote = require('electron').remote;

$('#saveButton').on('click', () => {
    var id=$('#clientID').val();
    var secret=$('#clientSecret').val();
    ipcRenderer.send('setOauthClientInfo', {id: id, secret: secret});
    var window = remote.getCurrentWindow();
    window.close();
})