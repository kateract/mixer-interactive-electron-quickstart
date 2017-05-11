const interactive = require('beam-interactive-node2');
const ws = require('ws');
const ipcMain = require('electron').ipcMain;
const https = require('https');
const JsonDB = require('node-json-db');
const BrowserWindow = require('electron').BrowserWindow;
const url = require('url');
const path = require('path');

const delay = interactive.delay;

var db = new JsonDB("GameData", true, true) // TODO: set human readable to false

//set web socket for interactive client
interactive.setWebSocket(ws);

//open the client object
const client = new interactive.GameClient();

//catch any client errors
client.on('error', (err) => console.log('error:', err));

//console log joining participants
var participants = [];
client.state.on('participantJoin', (participant) => {
    participants.push(participant);
    console.log(`${participant.username}(${participant.sessionID}) Joined`);
});

//console log leaving participants
client.state.on('participantLeave', (sessionID) => {
    console.log(`${participants.find((p) => p.sessionID == sessionID).username} Left`);
    participants.splice(participants.findIndex((p) => p.sessionID == sessionID), 1);
});

//add events for windows that want to subscribe
ipcMain.on('participantSubscribe', (event) => {
    client.state.on('participantJoin', (participant) => {
        event.sender.send('participantJoin', participant);
    });

    client.state.on('participantLeave', (sessionID) => {
        event.sender.send('participantLeave', sessionID);
    });
})

var pushSubscribers = [];
ipcMain.on('subscribeToPushers', (event) => {
    pushSubscribers.push(event.sender);
})

// These can be un-commented to see the raw JSON messages under the hood
// client.on('message', (err) => console.log('<<<', err));
// client.on('send', (err) => console.log('>>>', err));
// client.on('error', (err) => console.log(err));

//recieve a connect to interactive request
ipcMain.on('connectInteractive', (event, token) => { connectInteractive(event, token) });

function connectInteractive(event, token) {
    getGameVersionFromDB().then((versionID) => {
        client.open({
            authToken: token,
            versionId: versionID
        })
            .then(() => {
                client.synchronizeScenes()
                    .then((res) => { return client.ready(true) })
                    .then(() => setupBoard('default', defaultButtons))
                    .then((controls) => {
                        event.sender.send('interactiveConnectionEstablished')
                    })
            }, (err) => { console.log('error on client open:', err); });
    }, (err) => {
        createInteractiveVersionConfigurationWindow(event, token);
    });

};

//default beam board sizes
const boardSize = [
    { size: 'large', dimensions: { x: 80, y: 20 } },
    { size: 'medium', dimensions: { x: 45, y: 25 } },
    { size: 'small', dimensions: { x: 30, y: 40 } }
]

//this will basically reflow your buttons for you if you don't want to create your own position array
function flowControls(amount, width, height) {

    var positions = [];
    for (var j = 0; j < amount; j++) positions.push([]);
    boardSize.forEach((board) => {
        var maxControlsPerRow = Math.floor(board.dimensions.x / width)
        var reqRows = Math.ceil(amount / maxControlsPerRow);
        if (reqRows * height > board.dimensions.y) {
            throw (Error(`Controls do not fit on board '${board.size}'`));
        }
        var controlsPerRow = Math.ceil(amount / reqRows);
        var lastRowControls = reqRows > 1 ? amount % controlsPerRow : controlsPerRow;
        var fullRowXOffset = Math.floor((board.dimensions.x - (controlsPerRow * width)) / 2);
        var lastRowXOffset = Math.floor((board.dimensions.x - (lastRowControls * width)) / 2);
        //console.log(board.size, reqRows, controlsPerRow, lastRowControls, fullRowXOffset, lastRowXOffset);
        for (var i = 0; i < amount; i++) {
            var row = Math.ceil((i + 1) / controlsPerRow);
            var offset = row == reqRows ? lastRowXOffset : fullRowXOffset;
            var rowPos = i % controlsPerRow
            positions[i].push({
                size: board.size,
                width: width,
                height: height,
                x: offset + rowPos * width,
                y: (row - 1) * height
            })
        }
    })
    return (positions);
}

function makeButtons(buttons) {
    const controls = [];
    buttons.counter = [];
    buttons.pushers = [];
    buttons.totPushers = 0;
    const amount = buttons.names.length;
    // this uses flowcontrols to create the array, you can build your own array
    var positions = flowControls(amount, 10, 5);
    for (let i = 0; i < amount; i++) {
        controls.push({
            controlID: `${i}`,
            kind: "button",
            text: buttons.names[i] + '\n0',
            cost: 0,
            position: positions[i]
        })
        buttons.counter.push(0);
        buttons.pushers.push([]);
    }
    return controls;
}


function setupBoard(sceneID, buttons) {
    return new Promise((resolve, reject) => {
        const scene = client.state.getScene(sceneID);
        scene.deleteAllControls();
        scene.createControls(makeButtons(buttons))
            .then(controls => {
                controls.forEach((control) => {
                    control.on('mousedown', (inputEvent, participant) => {
                        //set a cooldown
                        handleControl(buttons, participant, control, inputEvent.transactionID).then()
                    });
                });
                resolve(controls);
            })

    });
}

//function to handle button events
function handleControl(buttons, participant, control, transactionID) {
    return new Promise((resolve, reject) => {
        control.setCooldown(buttons.cooldowns ? buttons.cooldowns[control.controlID] : 1000)
            .then(() => {
                console.log(`${participant.username} pushed ${control.controlID}`);

                // this will notify windows of button pushes so you can give graphical feedback
                pushSubscribers.forEach((sub) => sub.send('buttonPush', { participant: participant, id: control.controlID }));

            }, (err) => { reject(err) });

        if (transactionID) {
            client.captureTransaction(transactionID)
                .then(() => {
                    console.log(`Charged ${participant.username} ${control.cost} sparks!`);
                }, (err) => reject(err));
        }

        resolve();
    });
}

function getGameVersionFromDB() {
    return new Promise((resolve, reject) => {
        try {
            var data = db.getData("/GameVersion")
            if (data.version) {
                resolve(data.version);
            } else {
                reject(new Error(data.error));
            }
        } catch (error) {
            reject(new Error(error));
        }

    })
}


function createInteractiveVersionConfigurationWindow(event, token) {
    var versionWindow = new BrowserWindow({ width: 600, height: 300 });
    versionWindow.setMenuBarVisibility(false);
    versionWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'oauth.html'),
        protocol: 'file',
        slashes: true
    }))

    versionWindow.on('closed', () => {
        versionWindow = null;
    });

    ipcMain.on('setOauthClientInfo', (event, versionID) => {
        var data = { version: versionID };
        db.push('/GameVersion', data, true);
        connectInteractive(event, token);
    })
}