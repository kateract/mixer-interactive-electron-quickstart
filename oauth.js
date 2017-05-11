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

function oauthRequest(scopes) {
  return new Promise((resolve, reject) => {
    getOauthClientFromDB().then((authInfo) => {



      const windowParams = {
        alwaysOnTop: true,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false
        }
      };

      const options = {
        scope: scopes
      };

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
        }, () => {
          // we need to authenticate, let's get an access token
          opinionOauth.getAccessToken(options)
            .then((token) => {
              db.push("/" + scopes, token, true);
              resolve(token);
            },
            (err) => { reject(err); }
            );
        });
    }, (err) => { createOauthClientConfigurationWindow(scopes); });
  });

};
function getOauthClientFromDB(scopes) {
  return new Promise((resolve, reject) => {
    try {
      var client = db.getData("/OauthClient")
      if (client) {
        resolve(client);
      } else {
        reject(new Error(client.error));
      }
    } catch (error) {
      reject(new Error(error));
    }

  })
}

function getRefreshTokenFromDB(scopes) {
  return new Promise((resolve, reject) => {
    try {
      var token = db.getData("/" + scopes)
      if (token.refresh_token) {
        resolve(token);
      } else {
        reject(new Error(token.error));
      }
    } catch (error) {
      reject(new Error(error));
    }

  })
}

function createOauthClientConfigurationWindow(scopes) {
  var data = {
    "Oauth2": {
      "clientId": "",
      "clientSecret": "",
      "authorizationUrl": "https://beam.pro/oauth/authorize",
      "tokenUrl": "https://beam.pro/api/v1/oauth/token",
      "useBasicAuthorizationHeader": false,
      "redirectUri": "http://localhost"
    }
  }

  var oauthWindow = new BrowserWindow({ width: 800, height: 600 });
  oauthWindow.setMenuBarVisibility(false);
  oauthWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'oauth.html'),
    protocol: 'file',
    slashes: true
  }))

  oauthWindow.on('closed', () => {
    oauthWindow = null;
  });

  ipcMain.on('setOauthClientInfo', (event, details) => {
    data.Oauth2.clientId = details.clientId;
    data.Oauth2.clientSecret = details.clientSecret;
    db.push('/OauthAuthentication', data)
    oauthRequest(scopes);
  })
}