var ipcRenderer = require('electron').ipcRenderer;
var remote = require('electron').remote;
var shell = require('electron').shell;

$('#saveButton').on('click', () => {
    var id=$('#clientID').val();
    var secret=$('#clientSecret').val();
    ipcRenderer.send('setOauthClientInfo', {id: id, secret: secret});
})

$('#beamoauth').on('click', () => {
    shell.openExternal('https://beam.pro/lab/oauth');
})