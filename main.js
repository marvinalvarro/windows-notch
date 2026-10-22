const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { spawn, execFile } = require('child_process');
const readline = require('readline');
const path = require('path');
let win, media, keys, quitting = false;
const ps = f => ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, f)];
const send = (ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); };

function startMedia() {
  media = spawn('powershell.exe', ps('media.ps1'), { windowsHide: true });
  readline.createInterface({ input: media.stdout }).on('line', l => { try { send('media', JSON.parse(l)); } catch {} });
  media.on('exit', () => { if (!quitting) setTimeout(startMedia, 3000); });
}
function pollBt() {
  execFile('powershell.exe', ps('bt.ps1'), { windowsHide: true, timeout: 12000 }, (err, out) => {
    try { send('bt', JSON.parse(out)); } catch {}
  });
}
async function getLyrics({ artist, title, dur }) {
  const clean = title.replace(/[\(\[].*?[\)\]]/g, '').replace(/official.*$/i, '').trim();
  const H = { headers: { 'User-Agent': 'nusa-island/0.2' } };
  try {
    let u = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(clean)}` + (dur ? `&duration=${Math.round(dur)}` : '');
    let r = await fetch(u, H);
    if (r.ok) { const j = await r.json(); if (j.syncedLyrics) return j.syncedLyrics; }
    r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(artist + ' ' + clean)}`, H);
    if (r.ok) { const a = await r.json(); const f = a.find(x => x.syncedLyrics); if (f) return f.syncedLyrics; }
  } catch {}
  return null;
}

app.whenReady().then(() => {
  const SM = { w: 200, h: 36 }, BG = { w: 520, h: 190 };
  const place = s => { const b = screen.getPrimaryDisplay().bounds; win.setBounds({ x: Math.round(b.x + (b.width - s.w) / 2), y: b.y, width: s.w, height: s.h }); };
  win = new BrowserWindow({
    width: SM.w, height: SM.h, x: 0, y: 0,
    transparent: true, frame: false, resizable: false, hasShadow: false, skipTaskbar: true, alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  place(SM);
  win.loadFile('index.html');

  ipcMain.on('size', (_e, open) => place(open ? BG : SM));
  ipcMain.handle('lyrics', (_e, q) => getLyrics(q));
  keys = spawn('powershell.exe', ps('keys.ps1'), { windowsHide: true });
  ipcMain.on('key', (_e, k) => keys.stdin.write(k + '\n'));
  startMedia(); pollBt(); setInterval(pollBt, 15000);
});
app.on('before-quit', () => { quitting = true; try { media.kill(); keys.kill(); } catch {} });