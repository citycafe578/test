const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');
const $ = selector => document.querySelector(selector);

const ui = {
  stage: document.querySelector('.game-stage'), canvas,
  score: $('#score'), combo: $('#combo'), time: $('#time'), distance: $('#distanceLabel'), bar: $('#distanceBar'),
  hp: $('#hp'), speed: $('#speed'), mud: $('#mudBar'), event: $('#eventText'), toast: $('#toast'), pop: $('#scorePop'),
  camera: $('#cameraBadge'), firstPerson: $('#firstPersonOverlay'), mudOverlay: $('#mudOverlay'), start: $('#mainMenu'), pause: $('#pauseScreen'), result: $('#resultScreen'),
  finalScore: $('#finalScore'), finalNear: $('#finalNearMiss'), finalPhotos: $('#finalPhotos'), finalPenalties: $('#finalPenalties'),
  rank: $('#rank'), resultTitle: $('#resultTitle'), resultMessage: $('#resultMessage')
};
const laneIndicator = document.createElement('div'); laneIndicator.className = 'lane-indicator'; laneIndicator.innerHTML = '<small>橫向位置</small><strong>1.00 / 2.00</strong><i><b></b></i>'; document.querySelector('.game-stage').appendChild(laneIndicator);

const input = { left: false, right: false, gas: false, brake: false, drift: false };
const vehicles = [
  { id: 'classic', name: '經典雙人敞篷款', icon: '▰', color: '#2f604d', desc: '轉彎靈敏度中等，加速度平穩，適合新手。', speed: 1, turn: 1, hp: 100, risk: '穩定' },
  { id: 'van', name: '豪華四人大篷車', icon: '▰', color: '#69717a', desc: '車身長、轉彎半徑大，但碰撞抗性高。', speed: .82, turn: .72, hp: 140, risk: '耐撞' },
  { id: 'scooter', name: '改裝速克達款', icon: '◈', color: '#c45f43', desc: '速度極快、轉彎易甩尾，碰撞扣分加倍。', speed: 1.35, turn: 1.35, hp: 80, risk: '高風險' }
];
const tutorialPages = [
  ['操作與控制', '<span class="big-key">W ↑</span>油門加速　<span class="big-key">S ↓</span>煞車', '<span class="big-key">A ←</span><span class="big-key">D →</span>切換三條車道　<span class="big-key">Space</span>甩尾', '<span class="big-key">E</span>靠近相框拍照、遇農夫禮讓打招呼'],
  ['加扣分機制', '<b class="green">+100</b> 極限擦身　 <b class="green">+500</b> 地標拍照　 <b class="green">+300</b> 禮讓農夫', '<b class="red">-600</b> 撞到行人　 <b class="red">-350</b> 撞到單車　 <b class="red">-250</b> 摔進稻田', '<b class="red">-30 / 秒</b> 測速照相區超速，速度保持在 20 km/h 以下'],
  ['物理特性', '高速轉彎會推頭，Space + A/D 可甩尾修正。', '稻田泥地會降低抓地力，側風會把車推向路肩。', '三線車流會依速度接近，觀察空檔再切線。']
];

let selectedVehicle = vehicles[0];
let width = 0; let height = 0; let lastTime = 0; let raf = 0;
let audioContext; let motorOscillator; let motorGain;
let state;

function resetGame() {
  state = {
    running: false, paused: false, score: 0, time: 200, distance: 0,
    lane: 1, lanePosition: 1, laneVelocity: 0, speed: 0, hp: selectedVehicle.hp,
    accidents: 0, nearMisses: 0, photos: 0, courtesy: 0, penalties: 0, mud: 0, mudPenalty: 0, offRoad: false,
    camera: 0, cameraX: 0, cameraY: 0, cameraRoll: 0, shake: 0, hitStop: 0, drift: 0, tilt: 0, roadOffset: 0,
    spawnTimer: .8, eventTimer: 0, items: [], doubleScore: 0, boost: 0
  };
}
resetGame();

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = canvas.clientWidth; height = canvas.clientHeight;
  canvas.width = width * ratio; canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener('resize', resize); resize();

function showScreen(id) {
  document.querySelectorAll('.screen-layer').forEach(screen => screen.classList.remove('active'));
  $(id).classList.add('active');
}
function applyVehicleSelection() {
  ui.stage.dataset.vehicle = selectedVehicle.id;
  ui.stage.style.setProperty('--vehicle-color', selectedVehicle.color);
}
function flash(text, color = '') { ui.toast.textContent = text; ui.toast.style.color = color; ui.toast.classList.remove('show'); void ui.toast.offsetWidth; ui.toast.classList.add('show'); }
function popScore(value) { ui.pop.textContent = `${value >= 0 ? '+' : ''}${Math.round(value)}`; ui.pop.style.color = value >= 0 ? '#d7f09d' : '#ff9c82'; ui.pop.classList.remove('show'); void ui.pop.offsetWidth; ui.pop.classList.add('show'); }
function addScore(value) { state.score += value > 0 && state.doubleScore > 0 ? value * 2 : value; if (Math.abs(value) >= 20) popScore(value); }
function setEvent(text) { ui.event.textContent = text; }
function switchCamera() { if (!state.running) return; state.camera = (state.camera + 1) % 3; const names = ['第三人稱追蹤', '第一人稱駕駛', '俯瞰追蹤']; flash(`${names[state.camera]} · C 切換`, '#f1d47c'); setEvent(state.camera === 1 ? '駕駛座視角：觀察車流縫隙與車道位置' : state.camera === 2 ? '俯瞰視角：掌握三線道車流佈局' : '追蹤視角：看清車身與路肩'); }

function road() { return { horizon: height * .33, top: Math.max(90, width * .1), bottom: Math.min(width * .78, width - 40) }; }
function roadHalf(t) { const r = road(); return r.top / 2 + (r.bottom / 2 - r.top / 2) * t; }
function laneX(t, lane) { return width / 2 + (lane - 1) * roadHalf(t) * .58; }
function project(z) { const r = road(); const t = Math.max(0, Math.min(1, 1 - z / 100)); return { t, y: r.horizon + (height - r.horizon) * t, scale: .34 + t * 1.1 }; }

function drawWorld() {
  const r = road();
  const sky = ctx.createLinearGradient(0, 0, 0, r.horizon); sky.addColorStop(0, '#91bdd0'); sky.addColorStop(1, '#e5d79d');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#e9c66b'; ctx.beginPath(); ctx.arc(width * .78, height * .18, Math.min(width, height) * .1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#62846b'; ctx.beginPath(); ctx.moveTo(0, r.horizon + 52); ctx.lineTo(width * .18, r.horizon - 12); ctx.lineTo(width * .38, r.horizon + 20); ctx.lineTo(width * .58, r.horizon - 15); ctx.lineTo(width, r.horizon + 30); ctx.lineTo(width, r.horizon + 88); ctx.lineTo(0, r.horizon + 88); ctx.fill();
  ctx.fillStyle = '#91ad6c'; ctx.fillRect(0, r.horizon, width, height - r.horizon);
  ctx.globalAlpha = .28; ctx.strokeStyle = '#f5dc8d';
  for (let y = r.horizon + 35; y < height; y += 22) { const t = (y - r.horizon) / (height - r.horizon); const half = roadHalf(t); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width / 2 - half - 18, y); ctx.moveTo(width, y); ctx.lineTo(width / 2 + half + 18, y); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.fillStyle = '#b9a67e'; ctx.beginPath(); ctx.moveTo(width / 2 - r.top / 2, r.horizon); ctx.lineTo(width / 2 + r.top / 2, r.horizon); ctx.lineTo(width / 2 + r.bottom / 2, height + 60); ctx.lineTo(width / 2 - r.bottom / 2, height + 60); ctx.fill();
  ctx.strokeStyle = '#eadbab'; ctx.lineWidth = 4; ctx.setLineDash([28, 24]); ctx.lineDashOffset = -state.roadOffset; ctx.beginPath(); ctx.moveTo(width / 2 - r.top / 6, r.horizon); ctx.lineTo(width / 2 - r.bottom / 6, height); ctx.moveTo(width / 2 + r.top / 6, r.horizon); ctx.lineTo(width / 2 + r.bottom / 6, height); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
}

function drawPlayer() {
  const firstPerson = state.camera === 1;
  const t = .94; const firstPersonZoom = 1.24 + state.speed * .025; const x = firstPerson ? width / 2 - state.cameraX / firstPersonZoom : laneX(t, state.lanePosition); const y = firstPerson ? height - 105 - state.cameraY / firstPersonZoom : height - 86;
  ctx.save(); ctx.translate(x, y); ctx.rotate(firstPerson ? 0 : state.tilt * .08 + state.drift * .06); ctx.scale(firstPerson ? .95 : 1, firstPerson ? .95 : 1);
  ctx.shadowColor = '#253d2b66'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 10; ctx.fillStyle = selectedVehicle.color; ctx.beginPath(); ctx.roundRect(-30, -21, 60, 43, 10); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.fillStyle = '#e8c969'; ctx.beginPath(); ctx.roundRect(-21, -17, 42, 18, 6); ctx.fill(); ctx.fillStyle = '#203a31'; ctx.fillRect(-25, 13, 11, 7); ctx.fillRect(14, 13, 11, 7); ctx.restore();
}
function drawItem(item) {
  const p = project(item.z); const x = laneX(p.t, item.lane); ctx.save(); ctx.translate(x, p.y); ctx.scale(p.scale, p.scale); if (item.frightened) ctx.rotate(Math.sin(state.distance * 8) * .06);
  if (item.kind === 'pedestrian' || item.kind === 'group') { ctx.fillStyle = '#e9c28d'; ctx.beginPath(); ctx.arc(0, -27, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = item.kind === 'group' ? '#7182a2' : '#d66d50'; ctx.fillRect(-8, -20, 16, 22); ctx.fillStyle = '#354f45'; ctx.fillRect(-8, 2, 6, 16); ctx.fillRect(2, 2, 6, 16); if (item.kind === 'group') { ctx.fillRect(-36, -18, 16, 21); ctx.fillRect(20, -18, 16, 21); } }
  else if (item.kind === 'bike') { ctx.strokeStyle = '#3c4c48'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-10, 5, 8, 0, Math.PI * 2); ctx.arc(10, 5, 8, 0, Math.PI * 2); ctx.moveTo(-10, 5); ctx.lineTo(0, -10); ctx.lineTo(10, 5); ctx.stroke(); }
  else if (item.kind === 'farm') { ctx.fillStyle = '#597852'; ctx.fillRect(-17, -13, 34, 20); ctx.fillStyle = '#d9ba65'; ctx.fillRect(-9, -24, 18, 13); }
  else if (item.kind === 'bento') { ctx.fillStyle = '#bd6345'; ctx.fillRect(-14, -12, 28, 22); ctx.fillStyle = '#f2d38a'; ctx.fillRect(-11, -8, 22, 5); }
  else if (item.kind === 'tea') { ctx.fillStyle = '#ead19a'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); }
  else if (item.kind === 'photo') { ctx.strokeStyle = '#f4d179'; ctx.lineWidth = 5; ctx.strokeRect(-18, -22, 36, 36); }
  else if (item.kind === 'farmer') { ctx.fillStyle = '#7c6847'; ctx.fillRect(-18, -13, 36, 20); ctx.fillStyle = '#e3c36d'; ctx.fillRect(-22, -26, 44, 8); }
  else if (item.kind === 'pole') { ctx.fillStyle = '#524c3d'; ctx.fillRect(-4, -40, 8, 46); ctx.fillStyle = '#d7684b'; ctx.fillRect(-15, -35, 30, 13); }
  ctx.restore();
}

function modelSize(kind) { return { pedestrian: { width: 16, height: 52, top: -34 }, group: { width: 72, height: 52, top: -34 }, bike: { width: 36, height: 30, top: -20 }, farm: { width: 34, height: 37, top: -24 }, farmer: { width: 44, height: 33, top: -26 }, pole: { width: 30, height: 46, top: -40 }, bento: { width: 28, height: 22, top: -12 }, tea: { width: 28, height: 28, top: -14 }, photo: { width: 36, height: 36, top: -22 } }[kind] || { width: 24, height: 24, top: -12 }; }
function modelRect(item) { const p = project(item.z); const size = modelSize(item.kind); const scale = p.scale; const centerX = laneX(p.t, item.lane); return { left: centerX - size.width * scale / 2, right: centerX + size.width * scale / 2, top: p.y + size.top * scale, bottom: p.y + (size.top + size.height) * scale }; }
function playerRect() { const firstPerson = state.camera === 1; const centerX = laneX(.94, state.lanePosition); const centerY = firstPerson ? height - 105 : height - 86; const widthScale = firstPerson ? .95 : 1; return { left: centerX - 30 * widthScale, right: centerX + 30 * widthScale, top: centerY - 21 * widthScale, bottom: centerY + 22 * widthScale }; }
function overlaps(item) { const obstacle = modelRect(item); const player = playerRect(); return obstacle.left <= player.right && obstacle.right >= player.left && obstacle.top <= player.bottom && obstacle.bottom >= player.top; }

function spawnTraffic() {
  const spawnLane = () => Math.max(0, Math.min(2, Math.floor(Math.random() * 3) + (Math.random() - .5) * .45));
  const traffic = ['pedestrian', 'bike', 'pedestrian', 'pole', 'bento', 'tea', 'farmer']; const kind = traffic[Math.floor(Math.random() * traffic.length)]; state.items.push({ kind, lane: spawnLane(), z: 100, npcSpeed: kind === 'bike' ? .55 : .12 });
  if (Math.random() < .1) state.items.push({ kind: 'group', lane: spawnLane(), z: 88, npcSpeed: .1 });
  if (Math.random() < .1) state.items.push({ kind: 'photo', lane: spawnLane(), z: 72, npcSpeed: 0 });
  if (Math.random() < .08) { const pairStart = Math.random() < .5 ? .05 : 1.05; state.items.push({ kind: 'bike', lane: pairStart, z: 94, paired: true, npcSpeed: .5 }); state.items.push({ kind: 'bike', lane: pairStart + .9, z: 94, paired: true, npcSpeed: .5 }); }
}
function collide(item) {
  if (item.kind === 'farmer' || item.kind === 'photo' || item.hit || !overlaps(item)) return; item.hit = true;
  if (item.kind === 'pedestrian' || item.kind === 'group') { const loss = selectedVehicle.id === 'scooter' ? 1200 : 600; addScore(-loss); state.penalties += loss; state.accidents++; state.speed = 0; state.freeze = 3; state.shake = 1.35; state.hitStop = .03; flash('撞到行人！強制煞停 3 秒', '#b84d3b'); setEvent('遊客嚇了一跳，請降低速度'); }
  else if (item.kind === 'bike') { addScore(-350); state.penalties += 350; state.accidents++; state.speed *= .72; state.laneVelocity += item.lane > state.lane ? -.8 : .8; state.shake = .8; flash('擦撞單車！-350', '#b84d3b'); }
  else if (item.kind === 'pole') { addScore(-150); state.penalties += 150; state.accidents++; state.speed = 0; state.laneVelocity += item.lane > state.lane ? -.6 : .6; state.shake = 1.2; flash('硬撞路牌！-150', '#b84d3b'); }
  else if (item.kind === 'farm') { addScore(-250); state.penalties += 250; state.accidents++; state.speed *= .5; state.mud = 100; state.mudPenalty = 4; state.shake = .9; flash('摔進稻田！-250 · 減速 4 秒', '#b84d3b'); setEvent('泥巴黏住輪胎，抓地力大幅下降'); }
  else if (item.kind === 'bento') { addScore(200); state.boost = 5; state.speed = Math.min(1.65, state.speed + .35); flash('池上便當！+200 · 加速', '#2f765a'); }
  else if (item.kind === 'tea') { addScore(200); state.doubleScore = 10; flash('阿嬤奉茶！+200 · 得分翻倍', '#2f765a'); }
}
function nearMiss(item) { if (item.near || item.hit || item.z > 13 || item.z < 4 || !['pedestrian', 'bike'].includes(item.kind)) return; const distance = Math.abs(item.lane - state.lanePosition); if (distance < 1.05 && distance > .4 && state.speed > .45) { item.near = true; state.nearMisses++; addScore(100); flash('極限擦身而過！+100', '#2f765a'); } }
function interact() { if (!state.running) return; const photo = state.items.find(item => item.kind === 'photo' && !item.hit && item.z < 18 && item.z > 0); const farmer = state.items.find(item => item.kind === 'farmer' && !item.hit && item.z < 18 && item.z > 0); if (farmer && state.speed < .6) { farmer.hit = true; state.courtesy++; addScore(300); flash('禮讓農夫！+300', '#2f765a'); setEvent('農夫點頭致意，鄉土讚賞分入袋'); } else if (photo && state.speed < .5) { photo.hit = true; state.photos++; addScore(500); flash('完美停靠打卡！+500', '#2f765a'); setEvent('相框地標打卡成功'); } else flash('靠近地標或農夫，減速後按 E'); }
function enterPaddyField() { if (state.offRoad || state.speed < .25) return; state.offRoad = true; addScore(-250); state.penalties += 250; state.accidents++; state.speed *= .5; state.mud = 100; state.mudPenalty = 4; state.shake = .9; flash('開進農田！-250 · 泥巴減速 4 秒', '#b84d3b'); setEvent('離開柏油路，請往內側修正方向'); }

function update(dt) {
  if (!state.running || state.paused) return;
  if (state.hitStop > 0) { state.hitStop -= dt; return; }
  state.time -= dt; if (state.time <= 0) return finish(false);
  if (state.freeze > 0) state.freeze -= dt; if (state.doubleScore > 0) state.doubleScore -= dt; if (state.boost > 0) state.boost -= dt; if (state.mudPenalty > 0) state.mudPenalty = Math.max(0, state.mudPenalty - dt); state.mud = Math.max(0, state.mud - dt * 20);
  const steerTarget = input.left ? -1 : input.right ? 1 : 0; const steerRate = steerTarget ? 5 : 6.67; state.laneVelocity += (steerTarget * selectedVehicle.turn - state.laneVelocity) * Math.min(1, dt * steerRate);
  const grip = state.mudPenalty > 0 || state.mud > 0 ? .22 : 1; state.lanePosition += state.laneVelocity * dt * .95 * grip; state.lanePosition = Math.max(0, Math.min(2, state.lanePosition)); state.lane = Math.round(state.lanePosition);
  const cameraTargetX = state.camera === 1 ? (1 - state.lanePosition) * 150 : 0; const cameraTargetY = state.camera === 1 ? (input.brake ? 7 : -state.speed * 2) : state.camera === 2 ? -35 : 0; state.cameraX += (cameraTargetX - state.cameraX) * Math.min(1, dt * 5); state.cameraY += (cameraTargetY - state.cameraY) * Math.min(1, dt * 5); state.cameraRoll = 0;
  const maxSpeed = (1.65 * selectedVehicle.speed + (state.boost > 0 ? .25 : 0)) * (state.mudPenalty > 0 ? .5 : 1); const targetSpeed = state.freeze > 0 ? 0 : input.brake || input.drift ? .18 : input.gas ? maxSpeed : .7 * selectedVehicle.speed * (state.mudPenalty > 0 ? .5 : 1); state.speed += (targetSpeed - state.speed) * Math.min(1, dt * (input.brake ? 8 : 3));
  state.tilt += (state.laneVelocity * .5 - state.tilt) * Math.min(1, dt * 7); if (input.drift && steerTarget) { state.speed *= .985; state.drift += steerTarget * .01; } else state.drift *= Math.pow(.02, dt);
  state.distance += state.speed * dt * .16; state.roadOffset = (state.roadOffset + state.speed * dt * 160) % 52;
  state.spawnTimer -= dt; if (state.spawnTimer <= 0) { spawnTraffic(); state.spawnTimer = .75 + Math.random() * 1.05; }
  state.items.forEach(item => { item.z -= (state.speed * 18 + (item.npcSpeed || 0)) * dt; if (!item.hit && item.z < 24 && item.z > 0 && state.speed > .5 && Math.abs(item.lane - state.lanePosition) < .7) { item.frightened = true; const evadeStep = item.kind === 'group' ? .0012 : item.kind === 'bike' ? .0016 : .002; item.lane += item.lane >= state.lanePosition ? evadeStep : -evadeStep; item.lane = Math.max(0, Math.min(2, item.lane)); } collide(item); nearMiss(item); }); state.items = state.items.filter(item => item.z > -10);
  if (state.distance > 35 && state.distance < 72 && state.speed > 1.05) { state.penalties += 30 * dt; addScore(-30 * dt); setEvent('測速照相區超速！每秒 -30'); }
  const inPaddyField = state.lanePosition <= .02 || state.lanePosition >= 1.98; if (inPaddyField) { enterPaddyField(); state.mud = Math.min(100, state.mud + dt * 18); if (state.speed > 1.1) state.hp -= dt * 6; } else if (state.lanePosition > .2 && state.lanePosition < 1.8) state.offRoad = false;
  if (state.hp <= 0) return finish(false); if (state.distance >= 100) finish(true); updateHud();
}
function updateHud() { const displayedSpeed = Math.max(0, Math.floor(state.speed * 30)); ui.score.textContent = String(Math.max(0, Math.floor(state.score))).padStart(4, '0'); ui.time.textContent = `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`; ui.distance.textContent = `${Math.min(100, Math.floor(state.distance))}%`; ui.bar.style.width = `${Math.min(100, state.distance)}%`; ui.hp.innerHTML = `${Math.ceil(state.hp)}<small>%</small>`; ui.speed.innerHTML = `${displayedSpeed}<small> km/h</small>`; ui.mud.style.width = `${state.mud}%`; ui.combo.textContent = state.accidents ? `${state.accidents} 次事故` : '安全駕駛中'; if (ui.firstPerson) ui.firstPerson.dataset.speed = `◜  ${displayedSpeed} km/h  ◝`; }
function draw() { const shakeX = (Math.random() - .5) * state.shake * 15; const shakeY = (Math.random() - .5) * state.shake * 10; const zoom = state.camera === 1 ? 1.24 + state.speed * .025 : state.camera === 2 ? .82 : 1; ctx.save(); ctx.translate(width / 2 + shakeX + state.cameraX, height / 2 + shakeY + state.cameraY); ctx.scale(zoom, zoom); ctx.translate(-width / 2, -height / 2); drawWorld(); state.items.forEach(drawItem); drawPlayer(); ctx.restore(); if (state.shake > 0) state.shake = Math.max(0, state.shake - .06); ui.mudOverlay.style.opacity = String(Math.min(.7, state.mud / 140)); ui.stage.classList.toggle('camera-first', state.camera === 1); ui.stage.classList.toggle('camera-overhead', state.camera === 2); const positionText = state.lanePosition.toFixed(2); ui.camera.textContent = `${['第三人稱追蹤', '第一人稱駕駛', '俯瞰追蹤'][state.camera]} · ${state.camera === 1 ? `位置 ${positionText} / 2.00` : 'C 切換'}`; laneIndicator.querySelector('strong').textContent = `${positionText} / 2.00`; laneIndicator.querySelector('b').style.left = `${state.lanePosition / 2 * 100}%`; laneIndicator.classList.toggle('active', state.camera === 1); }
function loop(now) { if (!state.running) return; const dt = Math.min(.04, (now - lastTime) / 1000 || 0); lastTime = now; update(dt); draw(); if (state.running) raf = requestAnimationFrame(loop); }

function startGame() { applyVehicleSelection(); resetGame(); state.running = true; document.querySelectorAll('.screen-layer').forEach(screen => screen.classList.remove('active')); ui.result.classList.add('hidden'); ui.pause.classList.add('hidden'); lastTime = performance.now(); updateHud(); raf = requestAnimationFrame(loop); }
function exitGame() { if (!state.running && ui.result.classList.contains('hidden')) return; state.running = false; state.paused = false; if (raf) cancelAnimationFrame(raf); ui.pause.classList.add('hidden'); ui.result.classList.add('hidden'); resetGame(); showScreen('#mainMenu'); setEvent('已離開本局，準備好再出發時按開始遊戲'); }
function finish(arrived) { state.running = false; if (arrived) state.score += Math.floor(state.time) * 15; const score = Math.max(0, Math.floor(state.score)); const rank = arrived && score > 6000 && state.accidents === 0 ? 'S' : score >= 4000 ? 'A' : score < 2000 || state.hp <= 0 || state.accidents > 5 ? 'C' : 'B'; ui.rank.textContent = rank; ui.finalScore.textContent = score; ui.finalNear.textContent = state.nearMisses; ui.finalPhotos.textContent = `${state.photos}/2`; ui.finalPenalties.textContent = `-${Math.floor(state.penalties)}`; ui.resultTitle.textContent = arrived ? '抵達天堂路終點' : state.hp <= 0 ? '電池損壞，旅程中止' : '時間到，稻浪還在等你'; ui.resultMessage.textContent = rank === 'S' ? '你掌握了池上最剛好的速度。' : rank === 'C' ? '今天先當水溝蓋英雄，下趟記得慢一點。' : '這趟路，開得很有池上的節奏。'; ui.result.classList.remove('hidden'); }

function renderTutorial(page = 0) { const data = tutorialPages[page]; $('#tutorialCount').textContent = `0${page + 1} / 03`; $('#tutorialTitle').textContent = data[0]; $('#tutorialCard').innerHTML = data.slice(1).map(line => `<div>${line}</div>`).join(''); $('#tutorialNext').textContent = page === 2 ? '完成教學 →' : '下一頁 →'; $('#tutorialNext').dataset.page = page; }
function renderVehicles() { $('#vehicleGrid').innerHTML = vehicles.map(vehicle => `<article class="vehicle-card ${vehicle.id === selectedVehicle.id ? 'selected' : ''}" data-vehicle="${vehicle.id}"><div class="vehicle-visual vehicle-${vehicle.id}">${vehicle.icon}</div><div><h3>${vehicle.name}</h3><p>${vehicle.desc}</p><div class="stats-lines">速度 ${Math.round(vehicle.speed * 100)}　轉向 ${Math.round(vehicle.turn * 100)}<br>電池 ${vehicle.hp}%　${vehicle.risk}</div></div></article>`).join(''); document.querySelectorAll('.vehicle-card').forEach(card => card.addEventListener('click', () => { selectedVehicle = vehicles.find(vehicle => vehicle.id === card.dataset.vehicle) || vehicles[0]; applyVehicleSelection(); renderVehicles(); })); }

function initAudio() { if (audioContext) return audioContext.resume(); audioContext = new (window.AudioContext || window.webkitAudioContext)(); motorOscillator = audioContext.createOscillator(); motorGain = audioContext.createGain(); motorOscillator.type = 'triangle'; motorOscillator.frequency.value = 110; motorGain.gain.value = 0; motorOscillator.connect(motorGain).connect(audioContext.destination); motorOscillator.start(); }
function updateAudio() { if (!audioContext || !motorOscillator) return; const ratio = Math.min(1, state.speed / 1.65); motorOscillator.frequency.setTargetAtTime(110 + ratio * 95, audioContext.currentTime, .08); motorGain.gain.setTargetAtTime(state.running ? .015 + ratio * .02 : 0, audioContext.currentTime, .08); }

$('#startBtn').addEventListener('click', () => { renderVehicles(); showScreen('#garageScreen'); }); $('#garageBtn').addEventListener('click', () => { renderVehicles(); showScreen('#garageScreen'); }); $('#garageStart').addEventListener('click', () => { initAudio(); startGame(); }); $('#tutorialBtn').addEventListener('click', () => { renderTutorial(); showScreen('#tutorialScreen'); }); $('#tutorialBack').addEventListener('click', () => showScreen('#mainMenu')); $('#tutorialNext').addEventListener('click', event => { const page = Number(event.currentTarget.dataset.page); page === 2 ? showScreen('#mainMenu') : renderTutorial(page + 1); }); $('#leaderboardBtn').addEventListener('click', () => showScreen('#leaderboardScreen')); $('#settingsBtn').addEventListener('click', () => showScreen('#settingsScreen')); document.querySelectorAll('[data-menu]').forEach(button => button.addEventListener('click', () => showScreen(`#${button.dataset.menu}`))); $('#garageBack').addEventListener('click', () => showScreen('#mainMenu')); $('#restartBtn').addEventListener('click', startGame); $('#resultMenu').addEventListener('click', () => { ui.result.classList.add('hidden'); showScreen('#mainMenu'); }); $('#pauseBtn').addEventListener('click', () => { state.paused = !state.paused; ui.pause.classList.toggle('hidden', !state.paused); }); $('#resumeBtn').addEventListener('click', () => { state.paused = false; ui.pause.classList.add('hidden'); }); $('#soundBtn').addEventListener('click', event => { event.currentTarget.textContent = event.currentTarget.textContent === '♫' ? '×' : '♫'; });
window.addEventListener('keydown', event => { const key = event.key.toLowerCase(); if (event.key === 'Escape') { exitGame(); event.preventDefault(); return; } if (key === 'a' || key === 'arrowleft') input.left = true; if (key === 'd' || key === 'arrowright') input.right = true; if (key === 'w' || key === 'arrowup') input.gas = true; if (key === 's' || key === 'arrowdown') input.brake = true; if (key === ' ') { input.drift = true; event.preventDefault(); } if (key === 'e') interact(); if (key === 'c') switchCamera(); });
window.addEventListener('keyup', event => { const key = event.key.toLowerCase(); if (key === 'a' || key === 'arrowleft') input.left = false; if (key === 'd' || key === 'arrowright') input.right = false; if (key === 'w' || key === 'arrowup') input.gas = false; if (key === 's' || key === 'arrowdown') input.brake = false; if (key === ' ') input.drift = false; });
canvas.addEventListener('pointerdown', event => { if ($('#touchToggle').checked && state.running) { if (event.offsetX < width / 2) input.left = true; else input.right = true; } }); window.addEventListener('pointerup', () => { input.left = false; input.right = false; });

applyVehicleSelection(); renderVehicles(); draw();
setInterval(updateAudio, 80);
