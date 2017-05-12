const ipcMain = require('electron').ipcMain;
// Module to handle Oauth Requests
const electronOauth2 = require('electron-oauth2');
//storage of oauth tokens
const JsonDB = require('node-json-db');
var fs = require('fs');

const electron = require('electron');
const BrowserWindow = electron.BrowserWindow;
const path = require('path');
const url = require('url');

var db = new JsonDB("GameData", true, true) // TODO: set human readable to false

ipcMain.on('oauthRequest', (event, scopes) => {
  oauthRequest(scopes)
    .then((token) => event.sender.send('oauthRequestApproved', token),
    (err) => {
      console.log(err.message);
      event.sender.send('oauthRequestRejected', err.message)
    })
});

const windowParams = {
  alwaysOnTop: true,
  autoHideMenuBar: true,
  webPreferences: {
    nodeIntegration: false
  }
};

function oauthRequest(scopes) {
  return new Promise((resolve, reject) => {
    getOauthClient()
      .then((authInfo) => {

        const opinionOauth = electronOauth2(authInfo, windowParams);

        //check and see if we have a refresh token available
        getRefreshTokenFromDB(scopes)
          .then((token) => {
            // we found a token, let's get an access token
            opinionOauth.refreshToken(token.refresh_token)
              .then((token) => {
                db.push("/" + scopes, token, true);
                //console.log(token);
                resolve(token);
              }, (err) => { reject(err); });
          }, (err) => {

            // we need to authenticate, let's get an access token
            opinionOauth.getAccessToken({ scope: scopes })
              .then((token) => {
                db.push("/" + scopes, token, true);
                resolve(token);
              },
              (err) => { reject(err); }
              );
          });
      }, (reason) => { console.log("Error processing oauth request: ", reason.message); })
  });

};
function getOauthClient() {
  return new Promise((resolve, reject) => {
    try {
      var client = db.getData("/OauthAuthentication")
      if (client.clientId && client.clientSecret) {
        resolve(client);
        return;
      } else {
      }
    } catch (error) {
      
    }
    createOauthClientConfigurationWindow().then((client) => resolve(client), (err) => reject(err));
  })
}

function getRefreshTokenFromDB(scopes) {
  return new Promise((resolve, reject) => {
    try {
      var token = db.getData("/" + scopes)
      if (token.refresh_token) {
        resolve(token);
        return;
      }
    } catch (err) {
      console.log(err.message);
    }
    reject(Error('No Refresh Token Saved'));

  })
}

function createOauthClientConfigurationWindow() {
  return new Promise((resolve, reject) => {
    var data = {
      "clientId": "",
      "clientSecret": "",
      "authorizationUrl": "https://beam.pro/oauth/authorize",
      "tokenUrl": "https://beam.pro/api/v1/oauth/token",
      "useBasicAuthorizationHeader": false,
      "redirectUri": "http://localhost"
    }

    var oauthWindow = new BrowserWindow({ width: 800, height: 600 });
    oauthWindow.setMenuBarVisibility(false);
    //oauthWindow.webContents.openDevTools();
    oauthWindow.loadURL(url.format({
      pathname: path.join(__dirname, 'oauth.html'),
      protocol: 'file',
      slashes: true
    }))

    oauthWindow.on('closed', () => {
      oauthWindow = null;
      ipcMain.removeListener('setOauthClientInfo', setData);
      if (data && data.clientId && data.clientId.length > 0 && data.clientSecret && data.clientSecret.length > 0)
        resolve(data);
      else
        reject(Error('Invalid Client Data'));
    });
    var setData = function (event, details) {
      data.clientId = details.id;
      data.clientSecret = details.secret;
      db.push('/OauthAuthentication', data)
      oauthWindow.close();
    }
    ipcMain.on('setOauthClientInfo', setData)
  })
}
