const { ipcRenderer, shell, webUtils } = require('electron');
const fs = require('fs');
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const pad = n => String(n).padStart(2, '0');
const mm = s => { s = Math.max(0, Math.floor(s)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
const hue = s => { let h = 0; for (const c of s || 'x') h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const ring = (p, col, inner, sz = 64) => { const r = sz / 2 - 6, c = 2 * Math.PI * r; return `<div class="ring" style="width:${sz}px;height:${sz}px"><svg width="${sz}" height="${sz}"><circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" stroke="#1d1d24" stroke-width="6"/><circle id="rg" cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, p)))}" style="transition:stroke-dashoffset .5s"/></svg><b>${inner}</b></div>`; };

// ---------- state ----------
let idx = 0, hover = false, dragging = false, closeT, sizeT, openState = false, lyricsMode = false, wView = 0, addMode = false, editMode = false;
const today = new Date().toDateString();
let water = load('water2', { day: today, ml: 0, hours: {}, on: true, every: 60, next: Date.now() + 3600000 });
if (water.day !== today) { water.day = today; water.ml = 0; water.hours = {}; }
let todos = load('todos', [{ t: 'Contoh tugas', d: false }]);
let files = load('shelf', []);
let pomo = { mode: 'fokus', left: 1500, run: false, int: null };
let bat = { level: 1, charging: false }, bt = null, btName = null;
let music = { has: false, playing: false, title: '', artist: '', album: '', pos: 0, dur: 0, at: Date.now(), key: '' }, art = '', lyr = null;
if (navigator.getBattery) navigator.getBattery().then(b => { const u = () => { bat = { level: b.level, charging: b.charging }; if (cur() === 'daya') render(true); }; u(); b.onlevelchange = b.onchargingchange = u; });
const EN_D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], EN_M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const curPos = () => { const p = music.pos + (music.playing ? (Date.now() - music.at) / 1000 : 0); return music.dur ? Math.min(p, music.dur) : p; };
const hm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

const ICON = {
  drop: '<svg width="11" height="11" viewBox="0 0 24 24" fill="#60a5fa"><path d="M12 2.5s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z"/></svg>',
  gear: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  stop: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="7"/><path d="M12 14l3-3M10 3h4M12 3v4"/></svg>',
  cup: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2"/></svg>',
  target: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/></svg>',
  play: '<svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M6 4l14 8-14 8z"/></svg>',
  pause: '<svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>'
};

// ---------- halaman ----------
const pages = [
 { k: 'musik', h: () => {
   if (!music.has) return `<div class="fx" style="justify-content:center;text-align:center"><div><div style="font-size:28px">🎵</div><div class="ttl" style="margin-top:4px">Tidak ada musik diputar</div><div class="sub">Putar lagu di Spotify / YouTube / pemutar lain</div></div></div>`;
   const hh = hue(music.title), cov = art ? `background-image:url(${art})` : `background:linear-gradient(135deg,hsl(${hh} 75% 55%),hsl(${(hh+60)%360} 75% 30%))`;
   const left = `<div style="display:flex;gap:10px;align-items:center"><div class="cov" style="${cov}">${art ? '' : '♪'}</div><div style="min-width:0;flex:1"><div class="ttl">${esc(music.title)}</div><div class="sub">${esc(music.artist)}${music.album ? ' - ' + esc(music.album) : ''}</div></div></div>
     <div class="prog"><span id="mpos">00:00</span><div class="pbar"><i id="mbar" style="width:0"></i></div><span id="mrem"></span></div>
     <div class="ctl"><button id="kl" title="Lirik">💬</button><button id="kp">⏪</button><button id="kpp">${music.playing ? '⏸' : '▶'}</button><button id="kn">⏩</button></div>`;
   if (!lyricsMode) return `<div style="padding-top:2px">${left}</div>`;
   let body; if (!lyr || lyr.loading) body = '<div id="l1" style="color:#ffffff88;font-size:12px">Memuat lirik…</div>';
   else if (lyr.none) body = '<div id="l1" style="color:#ffffff88;font-size:12px">Lirik tersinkron tidak ditemukan</div>';
   else body = '<div id="l0"></div><div id="l1" data-i="-9"></div><div id="l2"></div>';
   return `<div class="fx" style="align-items:flex-start;padding-top:2px"><div style="width:178px;flex:none">${left}</div><div class="lyc" style="height:84px">${body}</div></div>`; } },
 { k: 'pomodoro', t: () => 'Pomodoro', h: () => { const tot = pomo.mode === 'fokus' ? 1500 : 300, r = 24, c = 2 * Math.PI * r;
   return `<div class="pm"><div class="ring pmr"><svg width="60" height="60"><circle cx="30" cy="30" r="${r}" fill="none" stroke="#ef4444" stroke-opacity=".25" stroke-width="4"/><circle id="pring" cx="30" cy="30" r="${r}" fill="none" stroke="#ef4444" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pomo.left / tot)}"/></svg><b>${ICON.stop}</b></div>
   <div class="pmc"><div class="pmt"><span id="ptime">${mm(pomo.left)}</span><button class="ic" id="pr">↻</button></div><div class="sub">${pomo.mode === 'fokus' ? 'Waktu fokus' : 'Istirahat singkat'}</div>
   <div class="pmb"><button class="pb" id="psb">${ICON.cup} Istirahat Singkat</button><button class="play" id="pp">${pomo.run ? ICON.pause : ICON.play}</button><button class="pb" id="pfb">${ICON.target} Waktu Fokus</button></div></div></div>`; } },
 { k: 'air', t: () => '<span style="color:#60a5fa">Pengingat</span> Minum Air', h: () => {
   const pct = Math.min(100, Math.round(water.ml / 15)), nh = new Date().getHours(), st = Math.min(Math.max(0, nh - 5), 18);
   const vals = [0, 1, 2, 3, 4, 5].map(i => water.hours[st + i] || 0), mx = Math.max(600, Math.ceil(Math.max(...vals) / 300) * 300);
   let right;
   if (wView === 0) { const r = 27, c = 2 * Math.PI * r, a = c * 0.75;
     right = `<div class="wr" id="wg" title="Klik untuk melihat grafik"><svg width="74" height="74"><defs><linearGradient id="wgd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><g transform="rotate(135 37 37)"><circle cx="37" cy="37" r="${r}" fill="none" stroke="#182033" stroke-width="5" stroke-linecap="round" stroke-dasharray="${a} ${c}"/><circle cx="37" cy="37" r="${r}" fill="none" stroke="url(#wgd)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${a * pct / 100} ${c}"/></g></svg><div class="wgt"><b>${pct}</b><small>%</small></div></div>`;
   } else right = `<div class="wr wc" id="wg" title="Klik untuk kembali"><div class="wcb">${vals.map((v, i) => `<div class="wcc"><i style="height:${Math.max(4, v / mx * 100)}%"></i><em>${i % 3 === 0 ? st + i : ''}</em></div>`).join('')}</div><div class="wcy"><span>${mx}</span><span>${mx / 2}</span><span>0 ml</span></div></div>`;
   return `<div class="pg"><i class="${wView === 0 ? 'on' : ''}" data-v="0"></i><i class="${wView === 1 ? 'on' : ''}" data-v="1"></i></div>
   <div class="wm"><div class="wl"><div class="wtop"><span class="t30">${(water.ml / 1000).toFixed(1)}</span><span class="sub" style="margin:0">/ 1,5 L</span><div class="tg ${water.on ? 'on' : ''}" id="wt"></div></div>
   <div class="sub" style="margin-top:4px">Hari ini · <b style="color:#60a5fa">${pct}%</b> · Berikutnya ${water.on ? hm(water.next) : 'mati'}</div><div class="bar"><i style="width:${pct}%"></i></div>
   <div class="wbtn"><button class="drink" id="wd">${ICON.drop} Minum</button><button id="ws">${ICON.gear} Tiap ${water.every}m</button></div></div>${right}</div>`; } },
 { k: 'tugas', t: () => '<span style="color:#4ade80">Daftar</span> Tugas', h: () => {
   const done = todos.filter(x => x.d).length;
   const act = addMode ? `<input id="ti" placeholder="Tugas baru, Enter">` : `<div style="display:flex;gap:5px;flex-wrap:wrap"><button id="ta">＋ Tambah Tugas</button><button id="te">${editMode ? '✓ Selesai' : '✎ Edit Tugas'}</button></div>`;
   return `<div class="fx" style="gap:14px"><div style="width:130px;flex:none"><div class="t30">${done}/${todos.length}</div><div class="sub" style="margin:3px 0 8px">Tugas selesai hari ini</div>${act}</div>
   <div class="tl">${todos.map((x, i) => `<div class="tr ${x.d ? 'd' : ''}" data-i="${i}"><div class="box">✓</div><span>${esc(x.t)}</span>${editMode ? `<b class="del" data-x="${i}">✕</b>` : ''}</div>`).join('') || '<div class="sub">Belum ada tugas</div>'}</div></div>`; } },
 { k: 'rak', t: () => `Rak ${files.length ? '<button id="fc">Hapus</button>' : ''}`, h: () => files.length
   ? `<div class="shelf">${files.map((f, i) => `<div class="tile" data-i="${i}" title="${esc(f.path)}"><div class="ti">${f.img ? `<img src="file:///${encodeURI(f.path.replace(/\\/g, '/'))}">` : f.dir ? '📁' : '📄'}</div><div class="tn">${esc(f.name)}</div><div class="ts">${f.dir ? 'Folder' : fmtSize(f.size)}</div></div>`).join('')}</div>`
   : `<div class="fx"><div class="empty">📥 Seret file ke notch ini<div class="sub">file langsung tersimpan di sini</div></div></div>` },
 { k: 'daya', h: () => `<div class="fx" style="gap:16px;justify-content:center">${ring(bat.level, bat.level < .2 && !bat.charging ? '#ef4444' : '#22c55e', bat.charging ? '⚡' : '🔋', 70)}<div><div class="t30">${Math.round(bat.level * 100)}%</div><div class="sub" style="margin-top:4px">${bat.charging ? 'Sedang mengisi daya' : 'Tidak mengisi daya'}</div></div></div>` },
 { k: 'headphone', h: () => { if (!bt) return `<div class="fx" style="justify-content:center;text-align:center"><div><div style="font-size:28px">🎧</div><div class="ttl" style="margin-top:4px">Tidak ada headphone terhubung</div><div class="sub">Sambungkan earbud / headphone Bluetooth</div></div></div>`;
   const b = bt.battery; return `<div class="fx" style="gap:16px;justify-content:center">${ring(b != null ? b / 100 : 1, '#38bdf8', '🎧', 70)}<div style="min-width:0"><div class="ttl" style="font-size:19px">${esc(bt.name)}</div><div class="sub" style="margin-top:3px">Terhubung${b != null ? ' · ' + b + '%' : ''}</div></div></div>`; } }
];
const cur = () => pages[idx].k;
const find = k => pages.findIndex(p => p.k === k);

function render(soft) {
  if (soft && document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const p = pages[idx];
  hl.innerHTML = p.t ? p.t() : ''; page.innerHTML = p.h();
  page.style.animation = 'none'; if (!soft) { void page.offsetWidth; page.style.animation = ''; }
  dots.innerHTML = pages.map((_, i) => `<i class="${i === idx ? 'on' : ''}" ${i === idx ? 'style="background:#fff"' : ''}></i>`).join('');
  inner.style.background = (cur() === 'musik' && lyricsMode && music.has) ? `linear-gradient(180deg,#000 38%,hsl(${hue(music.title)} 65% 20%))` : '#000';
  bind(cur()); syncUI();
}
function bind(k) {
  const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  if (k === 'musik') { on('kp', () => ipcRenderer.send('key', 'prev')); on('kpp', () => ipcRenderer.send('key', 'play')); on('kn', () => ipcRenderer.send('key', 'next')); on('kl', () => { lyricsMode = !lyricsMode; render(); }); }
  if (k === 'pomodoro') { on('pp', togglePomo); on('pr', () => setPomo(pomo.mode)); on('psb', () => setPomo('istirahat')); on('pfb', () => setPomo('fokus')); }
  if (k === 'air') {
    on('wd', () => { water.ml += 250; const h = new Date().getHours(); water.hours[h] = (water.hours[h] || 0) + 250; if (water.on) water.next = Date.now() + water.every * 60000; save('water2', water); render(); });
    on('wt', () => { water.on = !water.on; if (water.on) water.next = Date.now() + water.every * 60000; save('water2', water); render(); });
    on('ws', () => { const o = [30, 45, 60, 90, 120]; water.every = o[(o.indexOf(water.every) + 1) % o.length]; water.next = Date.now() + water.every * 60000; save('water2', water); render(); });
    on('wg', () => { wView = wView ? 0 : 1; render(true); });
    page.querySelectorAll('.pg i').forEach(i => i.onclick = () => { wView = +i.dataset.v; render(true); });
  }
  if (k === 'tugas') {
    on('ta', () => { addMode = true; render(); $('ti').focus(); }); on('te', () => { editMode = !editMode; render(); });
    if ($('ti')) $('ti').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { todos.push({ t: e.target.value.trim(), d: false }); save('todos', todos); addMode = false; render(); } if (e.key === 'Escape') { addMode = false; render(); } };
    page.querySelectorAll('.tr').forEach(el => el.onclick = e => { if (e.target.dataset.x !== undefined) todos.splice(+e.target.dataset.x, 1); else if (!editMode) todos[el.dataset.i].d = !todos[el.dataset.i].d; save('todos', todos); render(); });
  }
  if (k === 'rak') { on('fc', () => { files = []; save('shelf', files); render(); }); page.querySelectorAll('.tile').forEach(t => t.onclick = () => shell.openPath(files[t.dataset.i].path)); }
}
function syncUI() {
  const k = cur(), p = curPos();
  if (k === 'musik' && $('mbar')) { $('mpos').textContent = mm(p); $('mrem').textContent = music.dur ? '-' + mm(music.dur - p) : ''; $('mbar').style.width = (music.dur ? Math.min(100, p / music.dur * 100) : 0) + '%'; }
  if (k === 'musik' && lyricsMode && lyr && lyr.lines && $('l1')) { let i = -1; lyr.lines.forEach((l, j) => { if (l.t <= p + 0.3) i = j; });
    if ($('l1').dataset.i != i) { const g = j => lyr.lines[j] ? (lyr.lines[j].text || '♪') : ''; $('l0').textContent = g(i - 1); $('l1').textContent = i < 0 ? '♪' : g(i); $('l2').textContent = g(i + 1); $('l1').dataset.i = i; } }
}
setInterval(syncUI, 300);

// ---------- header ----------
function header() { const d = new Date(); tm.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()); dt.textContent = `${EN_D[d.getDay()]} ${d.getDate()} ${EN_M[d.getMonth()]} ${d.getFullYear()}`; sr.style.setProperty('--p', d.getSeconds() * 6 + 'deg'); }
setInterval(() => { header(); if (water.on && Date.now() >= water.next) { water.next = Date.now() + water.every * 60000; save('water2', water); peek('air', 5000); } }, 1000); header();

// ---------- pomodoro ----------
function setPomo(m) { stopPomo(); pomo.mode = m; pomo.left = m === 'fokus' ? 1500 : 300; render(); }
function stopPomo() { clearInterval(pomo.int); pomo.run = false; }
function togglePomo() { if (pomo.run) stopPomo(); else { pomo.run = true; pomo.int = setInterval(() => {
  if (--pomo.left <= 0) { const n = pomo.mode === 'fokus' ? 'istirahat' : 'fokus'; setPomo(n); peek('pomodoro', 4000); return; }
  if (cur() === 'pomodoro') { const tot = pomo.mode === 'fokus' ? 1500 : 300; $('ptime').textContent = mm(pomo.left); $('pring').style.strokeDashoffset = 2 * Math.PI * 24 * (1 - pomo.left / tot); } }, 1000); } render(); }

// ---------- musik / lirik / headphone ----------
function parseLrc(s) { const o = []; s.split('\n').forEach(l => { const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/); if (m) o.push({ t: +m[1] * 60 + +m[2], text: m[3].trim() }); }); return o; }
async function loadLyrics() { const key = music.key; lyr = { loading: true };
  const r = await ipcRenderer.invoke('lyrics', { artist: music.artist, title: music.title, dur: music.dur });
  if (key !== music.key) return; lyr = r ? { lines: parseLrc(r) } : { none: true }; if (cur() === 'musik' && lyricsMode) render(true); }
let prevKey = '', prevPlaying = false;
ipcRenderer.on('media', (_e, m) => {
  const key = (m.title || '') + '|' + (m.artist || ''), playing = m.status === 4, has = !!m.title, changed = key !== prevKey;
  if (changed) { art = ''; lyr = null; }
  music = { has, playing, title: m.title || '', artist: m.artist || '', album: m.album || '', pos: m.pos || 0, dur: m.dur || 0, at: Date.now(), key };
  wv.classList.toggle('on', playing);
  let redo = false;
  if (m.art) { art = 'data:image/jpeg;base64,' + m.art; redo = true; }
  if (changed) { prevKey = key; if (has) { loadLyrics(); if (playing) peek('musik', 3500); } redo = true; }
  if (playing !== prevPlaying) redo = true;
  prevPlaying = playing;
  if (redo && cur() === 'musik') render(true);
});
ipcRenderer.on('bt', (_e, list) => {
  const d = list.find(x => x.battery != null) || list[0]; bt = d || null;
  if (d && d.name !== btName) { btName = d.name; peek('headphone', 4000); } if (!d) btName = null;
  if (cur() === 'headphone') render(true);
});

// ---------- buka/tutup + resize jendela ----------
function setOpen(v) { clearTimeout(sizeT);
  if (v) { if (!openState) { openState = true; ipcRenderer.send('size', true); requestAnimationFrame(() => requestAnimationFrame(() => pill.classList.add('open'))); } else pill.classList.add('open'); }
  else { openState = false; pill.classList.remove('open'); sizeT = setTimeout(() => { if (!openState) ipcRenderer.send('size', false); }, 580); } }
function scheduleClose(ms) { clearTimeout(closeT); closeT = setTimeout(() => { const a = document.activeElement; if (!hover && !dragging && !(a && a.tagName === 'INPUT')) setOpen(false); }, ms); }
function peek(k, ms) { if (hover || dragging) return; idx = find(k); render(); setOpen(true); scheduleClose(ms); }
pill.addEventListener('mouseenter', () => { hover = true; clearTimeout(closeT); setOpen(true); });
pill.addEventListener('mousemove', () => { hover = true; clearTimeout(closeT); });
pill.addEventListener('mouseleave', () => { hover = false; scheduleClose(450); });
const go = d => { idx = (idx + d + pages.length) % pages.length; addMode = false; render(); };
prev.onclick = () => go(-1); next.onclick = () => go(1);
pill.addEventListener('wheel', e => go(e.deltaY > 0 ? 1 : -1));

// ---------- drag & drop file: otomatis buka Rak ----------
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
function addFiles(list) { [...list].forEach(f => { let p = f.path || (webUtils && webUtils.getPathForFile(f)); if (!p) return; let size = 0, dir = false; try { const s = fs.statSync(p); size = s.size; dir = s.isDirectory(); } catch {}
  files.push({ name: f.name, path: p, size, dir, img: /\.(png|jpe?g|gif|webp|bmp)$/i.test(p) }); }); save('shelf', files); }
document.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragging = true; clearTimeout(closeT); if (cur() !== 'rak') { idx = find('rak'); render(); } setOpen(true); });
document.addEventListener('dragover', e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
document.addEventListener('dragleave', e => { if (e.relatedTarget === null) { dragging = false; scheduleClose(700); } });
document.addEventListener('drop', e => { e.preventDefault(); dragging = false; addFiles(e.dataTransfer.files); hover = false; idx = find('rak'); render(); scheduleClose(2500); });

render();