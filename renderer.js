// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
var remote = require('electron').remote;
var Menu = remote.require('electron').Menu;
var ipcRenderer = require('electron').ipcRenderer;


var menu = Menu.buildFromTemplate([
    {
        label: 'My Interactive App',
        submenu: [
            {
                label: 'Refresh',
                click: function () {
                    location.reload();
                }
            },           
            {
                label: 'Open Dev Tools...',
                click: function () {
                    remote.getCurrentWindow().openDevTools()
                }
            },
            {
                label: 'Quit',
                click: function () {
                    var window = remote.getCurrentWindow()
                    window.close();
                }

            }
        ]
    }
])

Menu.setApplicationMenu(menu);

$(document).ready(function () {
    ipcRenderer.send('participantSubscribe');
})


ipcRenderer.on('participantJoin', (event, participant) => {
    console.log(`joining: ${participant.username} (${participant.sessionId})`);
});

ipcRenderer.on('participantLeave', (event, sessionID) => {
    console.log(`${sessionID} left`);
})

function processButtonPush(data) {
    console.log(`participant ${data.participant.username} pressed button id ${data.id}`)
}

$('#connectButton').on('click', () => { connectToInteractive(); });

function connectToInteractive() {
    console.log('Attempting Connection');
    $('#connectButton').html('Connecting...');
    ipcRenderer.send('oauthRequest', 'interactive:robot:self');
    ipcRenderer.on('oauthRequestApproved', (event, token) => {
        ipcRenderer.send('connectInteractive', token.access_token);
        ipcRenderer.on('interactiveConnectionEstablished', (event, connection) => {
            ipcRenderer.send('subscribeToPushers')
            ipcRenderer.on('buttonPush', (event, data) => processButtonPush(data));
            console.log('Interactive Connected');
            $('#connectButton').html('Connected');

        });
        ipcRenderer.on('interactiveConnectionError', (event, err) => {
            console.log(event);
            $('#connectButton').html('Connect');
            WarningDialog.show(err.toString(), 'Interactive Connection Error');
        });

    })
    ipcRenderer.on('oauthRequestRejected', (event, err) => {
        console.log(err);
        $('#connectButton').html('Connect');
        WarningDialog.show(err.toString(), 'Authentication Error');
    })

}


var WarningDialog = { 
    show: function(warningText, warningTitle) {
        $('#warningDialog .headerText').html(warningTitle);
        $('#warningDialog .bodyText').html(warningText);
        $('#warningDialog').css('display', 'block');
    }
}