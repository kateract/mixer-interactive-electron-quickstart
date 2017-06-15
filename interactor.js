const interactive = require('beam-interactive-node2');
const ws = require('ws');
const ipcMain = require('electron').ipcMain;
const https = require('https');
const JsonDB = require('node-json-db');
const BrowserWindow = require('electron').BrowserWindow;
const url = require('url');
const path = require('path');
const fs = require('fs');

const delay = interactive.delay;

var buttonDef;
fs.readFile('./buttons.json', (err, data) => {
    if (err) console.log(err);
    buttonDef = JSON.parse(data.toString());    
})

var db = new JsonDB("./data/VersionData", true, true) // TODO: set human readable to false

//set web socket for interactive client
interactive.setWebSocket(ws);

//open the client object
const client = new interactive.GameClient();

//catch any client errors
client.on('error', (err) => console.log('error:', err));


//recieve a connect to interactive request
ipcMain.on('connectInteractive', (event, token) => { connectInteractive(event.sender, token) });

function connectInteractive(requestor, token) {
    //check that we have a game configured to run 
    console.log('opening interactive connection');
    getGameVersionFromDB().then((version) => { 
        console.log('studio version found');
        openGameConnection(requestor, version, token);
    }, (err) => {
        requestVersionID(requestor, token);
    });

};

function openGameConnection(requestor, version, authToken) {
    client.open({
        authToken: authToken,
        versionId: version
    })
    .catch(err => console.log(err.message));
}

client.on('open', () => {
    client.synchronizeScenes()
    .then((res) => client.ready(true))
    .then(() => setupBoard('default', buttonDef.defaultButtons))
    .then((controls) => requestor.send('interactiveConnectionEstablished'))
    .catch((err) => console.log('Error connecting to game: ', err.message?err.message:err));
})

//this will set up the board, 
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

//default mixer board sizes, needed for flowControls
const boardSize = [
    { size: 'large', dimensions: { x: 80, y: 20 } },
    { size: 'medium', dimensions: { x: 45, y: 25 } },
    { size: 'small', dimensions: { x: 30, y: 40 } }
]

//this will basically reflow your buttons for you if you don't want to create your own position array
function flowControls(a, w, h) {
    var pos = [];
    for (var j = 0; j < a; j++) pos.push([]);
    boardSize.forEach((b) => {
        var x = b.dimensions.x; var y = b.dimensions.y; var c = Math.ceil; var f = Math.floor;
        var rc = c(a / f(b.dimensions.x / w));
        if (rc * h > y) {
            throw (Error(`Controls do not fit on board '${b.size}'`));
        }
        var cpr = c(a / rc);
        var lrc = rc > 1 ? a % cpr : cpr;
        var xOff = f((x - (cpr * w)) / 2);
        for (var i = 0; i < a; i++) {
            pos[i].push({
                size: b.size, width: w,height: h,
                x: (c((i + 1) / cpr) == rc ? f((x - (lrc * w)) / 2) : xOff) + i % cpr * w,
                y: (c((i + 1) / cpr) - 1) * h 
            })
        }
    })
    return (pos);
}

//This will create buttons from an array 
function makeButtons(buttons) {
    const controls = [];
    const amount = buttons.length;
    // this uses flowcontrols to create the array, you can build your own array
    var positions = flowControls(amount, 10, 5);
    for (let i = 0; i < amount; i++) {
        controls.push({
            controlID: buttons[i].name,
            kind: "button",
            text: buttons[i].name,
            cost: buttons[i].cost ? buttons[i].cost : 0,
            position: positions[i]
        })

    }
    return controls;
}


//function to handle button events
function handleControl(buttons, participant, control, transactionID) {
    return new Promise((resolve, reject) => {
        control.setCooldown(buttons.find((b) => b.name).cooldown ? buttons.find((b) => b.name).cooldown : 1000)
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


function requestVersionID(requestor, token) {
    var versionWindow = new BrowserWindow({ width: 600, height: 300 });
    versionWindow.setMenuBarVisibility(false);
    versionWindow.on('will-navigate', (e, url) => {
      e.preventDefault();
      require('electron').shell.openExternal(url);
    })
    versionWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'plugin', 'version.html'),
        protocol: 'file',
        slashes: true
    }))

    versionWindow.on('closed', () => {
        versionWindow = null;
    });

    ipcMain.on('setVersionInfo', (event, versionID) => {
        var data = { version: versionID };
        db.push('/GameVersion', data, true);
        versionWindow.close();
        openGameConnection(event, versionID, token);
    })
}

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

// when windows want to get button events they call this event so we can add a reference to the array
var pushSubscribers = [];
ipcMain.on('subscribeToPushers', (event) => {
    pushSubscribers.push(event.sender);
})