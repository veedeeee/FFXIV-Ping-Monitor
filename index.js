const {app, Tray, Menu, nativeTheme, nativeImage} = require('electron');
const isDev = require('electron-is-dev')
const Store = require('electron-store');
const axios = require('axios');
const ping = require('ping');

/**
 * [Datacenter description]
 */
class Datacenter {
  constructor(name, ipAddr) {
    this.name = name;
    this.ipAddr = ipAddr;
    this.ping = undefined;
  }
}

// Globalで宣言しないとGCに消される
let tray = null;
let isDarkTheme = false;

const store = new Store();
const STORE_KEYS = {
  primaryDC: 'primaryDC',
};

let datacenters = null;
let pingIntervalId = undefined;

/// App Launched
app.on('ready', () => {
  if(process.platform === 'darwin') app.dock.hide();
  if(nativeTheme.shouldUseDarkColors) isDarkTheme = true;

  const isWin = process.platform === 'win32';
  let trayIconPath = `${__dirname}/appicon/icon${isDarkTheme || isWin? '-dark' : ''}.${isWin? 'ico' : 'png'}`;
  tray = new Tray(trayIconPath);
  tray.setToolTip(app.name);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Loading...', enabled: false },
    { label: 'Quit', role: 'quit' }
  ]));
  tray.on('click', () => {
    tray.popUpContextMenu();
  });

  // Get the list of Datacenters
  axios.get(`https://raw.githubusercontent.com/veedeeee/FFXIV-Ping-Monitor/${isDev? 'develop' : 'master'}/xivservers.json`).then(res => {
    datacenters = res.data.map(d => new Datacenter(d['name'], d['ip_addr']));
  }).catch(e => {
    // if ajax has failed, use local resource
    datacenters = require(`${__dirname}/xivservers.json`);
  }).then(() => {
    if(!datacenters) return;
    buildTrayIconMenu();
    doPing();
  });
});

/// App Terminated
app.on('quit', () => {
  if(pingIntervalId) clearInterval(pingIntervalId);
});


const buildTrayIconMenu = () => {
  const primaryDC = store.get(STORE_KEYS.primaryDC);
  tray.setContextMenu(Menu.buildFromTemplate(datacenters.map(dc => ({
    ...{
      id: dc.name,
      label: dc.name,
      click: () => onPrimaryDatacenterChanged(dc),
      type: 'checkbox',
      checked: !!primaryDC && primaryDC === dc.name,
    },
    ...(typeof dc.ping === 'undefined'? {} : {
      sublabel: `${dc.ping}ms`,
    })
  })).concat([
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ])));

  if(!primaryDC) return;
  tray.setToolTip(`${primaryDC} - ${datacenters.filter(dc => dc.name === primaryDC)[0].ping}ms`);
};

const doPing = () => {
  pingIntervalId = setInterval(() => {
    datacenters.forEach((dc, i) => {
      ping.promise.probe(dc.ipAddr).then(res => {
        datacenters[i].ping = res.time;
        buildTrayIconMenu();
      });
    });
  }, 1000);
};

onPrimaryDatacenterChanged = dc => {
  const prevPrimaryDC = store.get(STORE_KEYS.primaryDC);
  store.delete(STORE_KEYS.primaryDC);
  if(prevPrimaryDC !== dc.name) store.set(STORE_KEYS.primaryDC, dc.name);
  buildTrayIconMenu();
};

nativeTheme.on("updated", () => {
  isDarkTheme = nativeTheme.shouldUseDarkColors;

  const isWin = process.platform === 'win32';
  let trayIconPath = `${__dirname}/appicon/icon${isDarkTheme || isWin? '-dark' : ''}.${isWin? 'ico' : 'png'}`;
  tray.setImage(nativeImage.createFromPath(imgFilePath));
});
