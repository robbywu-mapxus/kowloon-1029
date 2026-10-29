import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ==========================================
// 九龍迷圖 - 主應用程式 (main.js)
// ==========================================

let contentData = null;
let scene, camera, renderer, labelRenderer, controls;
let islandsGroup = new THREE.Group();
let animationItems = [];
let residentsGroup = new THREE.Group();
let cloudsGroup = new THREE.Group();
let birdsGroup = new THREE.Group();
let boatsGroup = new THREE.Group();

// 遊戲狀態存檔 (localStorage)
let gameState = {
  playerName: '冒險者波比',
  avatarColor: '#2a8a74',
  exp: 0,
  level: 1,
  visitedIslands: [],
  clearedIslands: [],
  quizRecords: {}, // islandId -> { correctCount, answeredIds }
  stamps: [],
  shells: 3,
  inventory: ['🐚 完美貝殼', '🐚 完美貝殼', '🐚 完美貝殼'],
  tradedItems: {}, // islandId -> boolean
  theme: 'mint',
  timeMode: 'day', // day, dusk, night, auto
  audioOn: false,
  reducedMotion: false
};

let audioCtx = null;
let bgmInterval = null;

function initUI() {
  // UI 初始化完成
}

// 初始化
async function init() {
  try {
    const res = await fetch('data/content.json');
    contentData = await res.json();
  } catch (e) {
    console.error('Failed to load content.json', e);
  }

  loadGameState();
  initThree();
  initUI();
  setupEventListeners();

  // 隱藏載入遮罩
  document.getElementById('loading-overlay').classList.add('hidden');
}

// 載入與儲存存檔
function loadGameState() {
  const saved = localStorage.getItem('kowloon_save_v1');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      gameState = { ...gameState, ...parsed };
    } catch(e) { console.error('Save parse error', e); }
  }
  updateHUD();
}

function saveGameState() {
  localStorage.setItem('kowloon_save_v1', JSON.stringify(gameState));
  updateHUD();
}

function updateHUD() {
  const currentLevel = contentData?.rpgRules?.levels.slice().reverse().find(l => gameState.exp >= l.exp) || { level: 1, title: '初級探索者' };
  gameState.level = currentLevel.level;
  
  document.getElementById('hud-level').innerText = `⭐ ${currentLevel.title} (Lv.${gameState.level}, ${gameState.exp} EXP)`;
  document.getElementById('hud-shells').innerText = `🐚 貝殼: ${gameState.shells}`;
  document.getElementById('passport-badge').innerText = `${gameState.stamps.length}/7`;
  
  const timeLabel = gameState.timeMode === 'day' ? '☀️ 白天' : gameState.timeMode === 'dusk' ? '🌇 黃昏' : gameState.timeMode === 'night' ? '🌙 夜晚' : '⏱️ 自動';
  document.getElementById('hud-time').innerText = `⏱️ ${new Date().getHours().toString().padStart(2,'0')}:${new Date().getMinutes().toString().padStart(2,'0')} (${timeLabel})`;
}

// ==========================================
// Three.js 3D 場景初始化
// ==========================================
function initThree() {
  const container = document.getElementById('canvas-container');
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe7f5f0);
  scene.fog = new THREE.FogExp2(0xe7f5f0, 0.015);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 45, 65);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 20;
  controls.maxDistance = 120;

  // 燈光設定
  setupLights();

  // 建立環境
  createOcean();
  createSkyAndClouds();
  createIslandsAndBridges();
  createResidentsAndEntities();

  window.addEventListener('resize', onWindowResize);

  // 渲染迴圈
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    if (!gameState.reducedMotion) {
      // 海浪起伏
      animateOcean(time);
      // 雲朵與鳥群飄移
      animateSky(delta);
      // 居民移動
      animateResidents(delta);
    }

    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  animate();
}

let dirLight, ambientLight, hemiLight;
function setupLights() {
  ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
  hemiLight.position.set(0, 50, 0);
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(30, 50, 30);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 150;
  const d = 40;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);
}

// 海面與浪花
let oceanMesh, oceanGeo;
function createOcean() {
  oceanGeo = new THREE.PlaneGeometry(300, 300, 64, 64);
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.1,
    metalness: 0.1,
    flatShading: true,
    transparent: true,
    opacity: 0.85
  });
  oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.rotation.x = -Math.PI / 2;
  oceanMesh.position.y = -2;
  scene.add(oceanMesh);
}

function animateOcean(time) {
  if (!oceanGeo) return;
  const pos = oceanGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const v = pos.getY(i);
    const z = Math.sin(u * 0.1 + time * 1.5) * Math.cos(v * 0.1 + time * 1.2) * 0.6;
    pos.setZ(i, z);
  }
  pos.needsUpdate = true;
}

// 天空與雲朵
function createSkyAndClouds() {
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const count = 3 + Math.floor(Math.random() * 3);
    for (let c = 0; c < count; c++) {
      const size = 2 + Math.random() * 2;
      const sphere = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), cloudMat);
      sphere.position.set((c - count/2) * 2.5, Math.random() * 1, (Math.random() - 0.5) * 2);
      cloud.add(sphere);
    }
    const angle = Math.random() * Math.PI * 2;
    const radius = 60 + Math.random() * 30;
    cloud.position.set(Math.cos(angle) * radius, 25 + Math.random() * 10, Math.sin(angle) * radius);
    cloudsGroup.add(cloud);
  }
  scene.add(cloudsGroup);

  // 鳥群
  for (let b = 0; b < 3; b++) {
    const flock = new THREE.Group();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    for (let i = 0; i < 5; i++) {
      const bird = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 3), birdMat);
      bird.rotation.x = Math.PI / 2;
      bird.position.set(i * 2 - 4, Math.sin(i) * 0.5, i * -1.5);
      flock.add(bird);
    }
    flock.position.set((b - 1) * 35, 30 + b * 5, (b - 1) * 25);
    flock.userData = { speed: 0.2 + b * 0.05, angle: b * 2 };
    birdsGroup.add(flock);
  }
  scene.add(birdsGroup);
}

function animateSky(delta) {
  cloudsGroup.children.forEach(c => {
    c.position.x += delta * 0.5;
    if (c.position.x > 90) c.position.x = -90;
  });

  birdsGroup.children.forEach(f => {
    f.userData.angle += delta * f.userData.speed;
    f.position.x = Math.cos(f.userData.angle) * 45;
    f.position.z = Math.sin(f.userData.angle) * 45;
  });
}

// 建立群島與橋梁
let islandMeshes = [];
function createIslandsAndBridges() {
  if (!contentData) return;

  // 中央島：九龍漫遊島
  const centerGroup = createIslandMesh(0, 0, 0, 14, 0xffa726, '九龍漫遊島 (旅客服務中心)', 'center', () => {
    openCenterModal();
  });
  islandsGroup.add(centerGroup);

  // 7 座周邊島嶼 (環形分佈)
  const count = contentData.islands.length;
  const radius = 32;
  contentData.islands.forEach((island, index) => {
    const angle = (index / count) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const islandGroup = createIslandMesh(x, 0, z, 10, getIslandColor(index), island.name, island.id, () => {
      openIslandModal(island);
    });
    islandsGroup.add(islandGroup);

    // 建立連接中央島與周邊島的木橋
    createBridge(0, 0, 0, x, 0, z);
  });

  scene.add(islandsGroup);
}

function getIslandColor(index) {
  const colors = [0xef5350, 0xab47bc, 0x42a5f5, 0x26a69a, 0x66bb6a, 0xffca28, 0xff7043];
  return colors[index % colors.length];
}

function createIslandMesh(x, y, z, radius, color, name, id, onClick) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.userData = { id, name, onClick };

  // 島嶼本體 (多層低多邊形地形)
  const terrainGeo = new THREE.CylinderGeometry(radius, radius - 2, 4, 16);
  const terrainMat = new THREE.MeshStandardMaterial({ color: 0x81c784, roughness: 0.8, flatShading: true });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.position.y = -2;
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  group.add(terrain);

  // 沙灘基底
  const beachGeo = new THREE.CylinderGeometry(radius + 1.5, radius, 1, 16);
  const beachMat = new THREE.MeshStandardMaterial({ color: 0xffe082, roughness: 0.9, flatShading: true });
  const beach = new THREE.Mesh(beachGeo, beachMat);
  beach.position.y = -3.8;
  group.add(beach);

  // 建築物 / 地標
  const bldgGeo = new THREE.BoxGeometry(4, 5, 4);
  const bldgMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, flatShading: true });
  const building = new THREE.Mesh(bldgGeo, bldgMat);
  building.position.set(0, 2.5, 0);
  building.castShadow = true;
  group.add(building);

  // 屋頂
  const roofGeo = new THREE.ConeGeometry(3.5, 3, 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.5, flatShading: true });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 6, 0);
  group.add(roof);

  // 樹木
  for (let t = 0; t < 3; t++) {
    const tree = createLowPolyTree();
    const angle = (t / 3) * Math.PI * 2;
    tree.position.set(Math.cos(angle) * (radius * 0.6), 0, Math.sin(angle) * (radius * 0.6));
    group.add(tree);
  }

  // HTML 標籤 (CSS2D)
  const p = document.createElement('div');
  p.className = 'island-label';
  p.style.background = 'var(--surface)';
  p.style.border = '2px solid var(--primary)';
  p.style.padding = '4px 10px';
  p.style.borderRadius = '12px';
  p.style.fontWeight = '700';
  p.style.fontSize = '0.85rem';
  p.style.color = 'var(--ink)';
  p.style.cursor = 'pointer';
  p.style.boxShadow = '0 4px 12px var(--shadow)';
  p.innerHTML = `📍 ${name}`;
  p.onclick = (e) => {
    e.stopPropagation();
    onClick();
  };

  const label = new CSS2DObject(p);
  label.position.set(0, 9, 0);
  group.add(label);

  islandMeshes.push({ group, onClick });
  return group;
}

function createLowPolyTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2, 5), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
  trunk.position.y = 1;
  group.add(trunk);
  const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 0), new THREE.MeshStandardMaterial({ color: 0x388e3c, flatShading: true }));
  leaves.position.y = 2.5;
  group.add(leaves);
  return group;
}

function createBridge(x1, y1, z1, x2, y2, z2) {
  const bridgeGroup = new THREE.Group();
  const distance = Math.hypot(x2 - x1, z2 - z1);
  const bridgeGeo = new THREE.BoxGeometry(1.2, 0.3, distance);
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.8 });
  const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
  
  bridge.position.set((x1 + x2) / 2, -1, (z1 + z2) / 2);
  bridge.lookAt(x2, -1, z2);
  bridgeGroup.add(bridge);
  scene.add(bridgeGroup);
}

// 居民與小動物 (生活感模式)
function createResidentsAndEntities() {
  // 建立居民和送貨員
  for (let i = 0; i < 10; i++) {
    const resident = createLowPolyPerson();
    resident.position.set((Math.random() - 0.5) * 50, 0, (Math.random() - 0.5) * 50);
    resident.userData = { wanderAngle: Math.random() * Math.PI * 2, speed: 2 + Math.random() * 2 };
    residentsGroup.add(resident);
  }
  scene.add(residentsGroup);
}

function createLowPolyPerson() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a8a74 });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.2, 5), bodyMat);
  body.position.y = 0.6;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 6), headMat);
  head.position.y = 1.4;
  group.add(head);

  return group;
}

function animateResidents(delta) {
  residentsGroup.children.forEach(r => {
    r.userData.wanderAngle += (Math.random() - 0.5) * 0.1;
    r.position.x += Math.cos(r.userData.wanderAngle) * delta * 2;
    r.position.z += Math.sin(r.userData.wanderAngle) * delta * 2;
    if (Math.hypot(r.position.x, r.position.z) > 40) {
      r.userData.wanderAngle += Math.PI;
    }
  });
}

// 點擊互動偵測 (Raycaster)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function setupEventListeners() {
  window.addEventListener('click', (e) => {
    // 如果點擊在 UI 上，不觸發 3D 點擊
    if (e.target.closest('.top-toolbar') || e.target.closest('.modal-overlay') || e.target.closest('.dialog-modal') || e.target.closest('.quiz-modal') || e.target.closest('.cert-modal')) {
      return;
    }

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(islandsGroup.children, true);

    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.onClick) {
        obj = obj.parent;
      }
      if (obj.userData && obj.userData.onClick) {
        obj.userData.onClick();
      }
    }
  });

  // UI 按鈕事件
  document.getElementById('btn-list').onclick = openLocationListModal;
  document.getElementById('btn-passport').onclick = openPassportModal;
  document.getElementById('btn-guide').onclick = openGuideModal;
  document.getElementById('btn-audio').onclick = toggleAudio;
  document.getElementById('btn-daynight').onclick = toggleDayNight;
  document.getElementById('btn-reset-cam').onclick = resetCamera;
  document.getElementById('btn-savecode').onclick = openSaveCodeModal;

  document.getElementById('panel-close').onclick = closeSideModal;
  document.getElementById('npc-close').onclick = () => document.getElementById('npc-modal').classList.remove('active');
  document.getElementById('quiz-close').onclick = () => document.getElementById('quiz-modal').classList.remove('active');
  document.getElementById('cert-close').onclick = () => document.getElementById('cert-modal').classList.remove('active');

  // 主題切換
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const theme = btn.getAttribute('data-theme-val');
      document.documentElement.setAttribute('data-theme', theme);
      gameState.theme = theme;
      saveGameState();
    };
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

function resetCamera() {
  controls.reset();
  camera.position.set(0, 45, 65);
}

// ==========================================
// 互動視窗與面板邏輯
// ==========================================

function openSideModal(title, htmlContent) {
  document.getElementById('panel-main-title').innerText = title;
  document.getElementById('panel-main-content').innerHTML = htmlContent;
  document.getElementById('side-modal').classList.add('active');
}

function closeSideModal() {
  document.getElementById('side-modal').classList.remove('active');
}

// 島嶼詳細面板
function openIslandModal(island) {
  // 記錄訪問與加 EXP
  if (!gameState.visitedIslands.includes(island.id)) {
    gameState.visitedIslands.push(island.id);
    gameState.exp += contentData.rpgRules.firstVisit;
    if (!gameState.stamps.includes(island.id)) {
      gameState.stamps.push(island.id);
    }
    saveGameState();
  }

  const html = `
    <div class="section-block">
      <h3>🏷️ ${island.style}</h3>
      <p style="font-size:1.05rem; font-weight:600; color:var(--primary); margin-top:6px;">${island.intro}</p>
    </div>
    <div class="section-block">
      <h3>🏛️ 特色地標 (POI)</h3>
      <div class="tag-list">${island.points.map(p => `<span class="tag">${p}</span>`).join('')}</div>
    </div>
    <div class="section-block">
      <h3>🍜 在地美食</h3>
      <div class="tag-list">${island.food.map(f => `<span class="tag" style="background:var(--surface); border-color:var(--accent);">${f}</span>`).join('')}</div>
    </div>
    <div class="section-block">
      <h3>📖 人文故事 (Island Lore)</h3>
      <p>${island.lore}</p>
    </div>
    <div class="section-block" style="background:var(--bg); padding:16px; border-radius:12px; border:2px solid var(--line);">
      <h3>💬 在地導覽員 (NPC)</h3>
      <p style="margin-bottom:10px;"><b>${island.residents[0].name}</b> (${island.residents[0].role}): "${island.residents[0].dialogs[0]}"</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="window.startIslandQuiz('${island.id}')">🧠 挑戰知識測驗 (+EXP)</button>
        <button class="btn" onclick="window.openNpcDialog('${island.id}')">💬 與居民對話 & 交易</button>
        <a class="btn" href="${island.mapLink}" target="_blank" style="text-decoration:none;">🗺️ 官方地圖連結</a>
      </div>
    </div>
  `;
  openSideModal(island.name, html);
}

// 中央島面板
function openCenterModal() {
  const canFinal = gameState.stamps.length >= contentData.rpgRules.centerUnlockStamps;
  const html = `
    <div class="section-block">
      <h3>🌟 ${contentData.centerIsland.name} (${contentData.centerIsland.role})</h3>
      <p>${contentData.centerIsland.lore}</p>
    </div>
    <div class="section-block" style="background:var(--bg); padding:16px; border-radius:12px; border:2px solid var(--line);">
      <h3>🏆 探索進度與最終挑戰</h3>
      <p style="margin-bottom:10px;">目前已收集島章：<b>${gameState.stamps.length} / 7 枚</b></p>
      ${canFinal ? `<button class="btn btn-primary" onclick="window.startFinalQuiz()">🏅 參加中央島最終挑戰！</button>` : `<p style="color:var(--accent); font-weight:600;">⚠️ 須集滿 4 枚島章才能解鎖最終挑戰！</p>`}
    </div>
  `;
  openSideModal(contentData.centerIsland.name, html);
}

// 地點清單
function openLocationListModal() {
  if (!contentData) return;
  const html = `
    <div class="section-block">
      <h3>📋 九龍全島站點總覽</h3>
      <p style="margin-bottom:16px; color:var(--muted);">不用 3D 也能透過清單快速閱讀所有站點與故事。</p>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${contentData.islands.map(i => `
          <div style="background:var(--bg); border:2px solid var(--line); padding:12px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h4 style="color:var(--primary);">${i.name}</h4>
              <p style="font-size:0.85rem; color:var(--muted);">${i.intro}</p>
            </div>
            <button class="btn btn-primary" onclick="window.openIslandModalById('${i.id}')">查看</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  openSideModal('九龍景點清單', html);
}

// 探索護照與背包
function openPassportModal() {
  const html = `
    <div class="section-block">
      <h3>🎒 冒險者背包與道具</h3>
      <div class="tag-list" style="margin-bottom:20px;">
        ${gameState.inventory.map(item => `<span class="tag" style="background:var(--surface); font-weight:600; padding:8px 12px;">${item}</span>`).join('')}
      </div>
      <h3>🛂 探索護照印章 (${gameState.stamps.length}/7)</h3>
      <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; margin-top:10px;">
        ${contentData.islands.map(i => {
          const hasStamp = gameState.stamps.includes(i.id);
          return `
            <div style="background:var(--bg); border:2px solid ${hasStamp ? 'var(--primary)' : 'var(--line)'}; padding:10px; border-radius:10px; text-align:center;">
              <div style="font-weight:700; color:${hasStamp ? 'var(--primary)' : 'var(--muted)'};">${i.name}</div>
              <div style="font-size:0.8rem; margin-top:4px;">${hasStamp ? '✅ 已蓋章' : '🔒 未解鎖'}</div>
            </div>
          `;
        }).join('')}
      </div>
      ${gameState.stamps.length === 7 ? `<button class="btn btn-primary" style="width:100%; margin-top:20px;" onclick="window.openCertificate()">📜 檢視與下載冒險證書</button>` : ''}
    </div>
  `;
  openSideModal('探索護照與背包', html);
}

// 波仔嚮導問答
function openGuideModal() {
  const html = `
    <div class="section-block">
      <h3>🤖 波仔嚮導問答中心</h3>
      <p style="margin-bottom:12px;">輸入關鍵字（例如：雷生春、黃大仙、啟德、菠蘿油），波仔會從網站內容中幫你找到解答！</p>
      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <input type="text" id="guide-input" placeholder="輸入搜尋關鍵字..." style="flex:1; padding:10px; border-radius:8px; border:2px solid var(--line); background:var(--bg); color:var(--ink); font-family:var(--font-family);">
        <button class="btn btn-primary" onclick="window.runGuideSearch()">搜尋</button>
      </div>
      <div id="guide-results" style="display:flex; flex-direction:column; gap:10px;"></div>
    </div>
  `;
  openSideModal('波仔嚮導', html);
}

window.runGuideSearch = function() {
  const query = document.getElementById('guide-input').value.trim().toLowerCase();
  const resultsDiv = document.getElementById('guide-results');
  if (!query) return;

  let matches = [];
  contentData.islands.forEach(island => {
    if (island.name.toLowerCase().includes(query) || island.intro.toLowerCase().includes(query) || island.lore.toLowerCase().includes(query)) {
      matches.push({ title: island.name, desc: island.lore });
    }
  });

  if (matches.length === 0) {
    resultsDiv.innerHTML = `<p style="color:var(--muted);">找不到關於「${query}」的資料，請試試其他關鍵字。</p>`;
  } else {
    resultsDiv.innerHTML = matches.map(m => `
      <div style="background:var(--bg); border:2px solid var(--line); padding:10px; border-radius:8px;">
        <h4 style="color:var(--primary); margin-bottom:4px;">📍 ${m.title}</h4>
        <p style="font-size:0.9rem;">${m.desc}</p>
      </div>
    `).join('');
  }
};

// 接關碼視窗
function openSaveCodeModal() {
  const code = btoa(encodeURIComponent(JSON.stringify(gameState)));
  const html = `
    <div class="section-block">
      <h3>🔑 冒險接關碼 (Save Code)</h3>
      <p style="margin-bottom:10px; font-size:0.9rem;">你可以複製這串接關碼，在其他裝置或瀏覽器貼上以還原進度：</p>
      <textarea id="save-code-text" style="width:100%; height:80px; padding:8px; border-radius:8px; border:2px solid var(--line); background:var(--bg); color:var(--ink); font-size:0.8rem; margin-bottom:10px;">${code}</textarea>
      <div style="display:flex; gap:10px; margin-bottom:20px;">
        <button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('save-code-text').value); alert('已複製接關碼！');">📋 複製接關碼</button>
      </div>
      <h3>📥 匯入接關碼</h3>
      <input type="text" id="import-code-input" placeholder="在此貼上接關碼..." style="width:100%; padding:8px; border-radius:8px; border:2px solid var(--line); background:var(--bg); color:var(--ink); margin-bottom:10px;">
      <button class="btn" onclick="window.importSaveCode()">還原進度</button>
    </div>
  `;
  openSideModal('接關碼管理', html);
}

window.importSaveCode = function() {
  const val = document.getElementById('import-code-input').value.trim();
  try {
    const decoded = JSON.parse(decodeURIComponent(atob(val)));
    if (decoded && decoded.exp !== undefined) {
      gameState = decoded;
      saveGameState();
      alert('進度還原成功！');
      location.reload();
    } else {
      throw new Error('Invalid format');
    }
  } catch(e) {
    alert('接關碼格式錯誤或損毀，無法還原！');
  }
};

// 全域導向函數
window.openIslandModalById = function(id) {
  const island = contentData.islands.find(i => i.id === id);
  if (island) openIslandModal(island);
};

// ==========================================
// NPC 對話與測驗機制
// ==========================================

window.openNpcDialog = function(islandId) {
  const island = contentData.islands.find(i => i.id === islandId);
  const npc = island.residents[0];
  document.getElementById('npc-title').innerText = `${npc.name} (${npc.role})`;
  document.getElementById('npc-text').innerText = npc.dialogs[Math.floor(Math.random() * npc.dialogs.length)];
  
  const actionsDiv = document.getElementById('npc-actions');
  actionsDiv.innerHTML = `
    <button class="btn btn-primary" onclick="window.npcExchange('${islandId}')">🔁 進行物品交易 (${island.trade.desc})</button>
    <button class="btn" onclick="document.getElementById('npc-modal').classList.remove('active')">關閉</button>
  `;
  document.getElementById('npc-modal').classList.add('active');
};

window.npcExchange = function(islandId) {
  const island = contentData.islands.find(i => i.id === islandId);
  if (gameState.tradedItems[islandId]) {
    alert('你已經跟這位居民交換過物品囉！');
    return;
  }
  gameState.inventory.push(island.trade.get);
  gameState.tradedItems[islandId] = true;
  gameState.exp += 5;
  saveGameState();
  alert(`交易成功！獲得道具：${island.trade.get}`);
  document.getElementById('npc-modal').classList.remove('active');
};

// 知識測驗
let currentQuizIsland = null;
let currentQuizIndex = 0;
let currentQuizScore = 0;

window.startIslandQuiz = function(islandId) {
  const island = contentData.islands.find(i => i.id === islandId);
  currentQuizIsland = island;
  currentQuizIndex = 0;
  currentQuizScore = 0;
  closeSideModal();
  showQuizQuestion();
};

function showQuizQuestion() {
  const qList = currentQuizIsland.quiz;
  if (currentQuizIndex >= qList.length) {
    finishQuiz();
    return;
  }

  const q = qList[currentQuizIndex];
  document.getElementById('quiz-progress').innerText = `第 ${currentQuizIndex + 1} 題 / 共 ${qList.length} 題`;
  document.getElementById('quiz-question').innerText = q.q;
  
  const optionsDiv = document.getElementById('quiz-options');
  optionsDiv.innerHTML = q.options.map((opt, idx) => `
    <button class="btn" style="justify-content:flex-start; text-align:left; padding:12px;" onclick="window.submitQuizAnswer(${idx})">${String.fromCharCode(65 + idx)}. ${opt}</button>
  `).join('');

  document.getElementById('quiz-feedback').style.display = 'none';
  document.getElementById('quiz-next').style.display = 'none';
  document.getElementById('quiz-modal').classList.add('active');
}

window.submitQuizAnswer = function(selectedIdx) {
  const q = currentQuizIsland.quiz[currentQuizIndex];
  const isCorrect = selectedIdx === q.answer;
  if (isCorrect) currentQuizScore++;

  const feedbackDiv = document.getElementById('quiz-feedback');
  feedbackDiv.style.display = 'block';
  feedbackDiv.style.background = isCorrect ? '#d4edda' : '#f8d7da';
  feedbackDiv.style.color = isCorrect ? '#155724' : '#721c24';
  feedbackDiv.innerHTML = `<b>${isCorrect ? '✅ 回答正確！' : '❌ 回答錯誤！'}</b><br>${q.explanation}`;

  // 鎖定選項按鈕
  const buttons = document.querySelectorAll('#quiz-options button');
  buttons.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === q.answer) btn.style.borderColor = '#28a745';
    else if (idx === selectedIdx && !isCorrect) btn.style.borderColor = '#dc3545';
  });

  document.getElementById('quiz-next').style.display = 'block';
};

document.getElementById('quiz-next').onclick = () => {
  currentQuizIndex++;
  showQuizQuestion();
};

function finishQuiz() {
  document.getElementById('quiz-modal').classList.remove('active');
  const passed = currentQuizScore >= 2;
  if (passed) {
    gameState.exp += contentData.rpgRules.firstCorrect * currentQuizScore;
    if (!gameState.clearedIslands.includes(currentQuizIsland.id)) {
      gameState.clearedIslands.push(currentQuizIsland.id);
      gameState.exp += contentData.rpgRules.firstClear;
    }
    saveGameState();
    alert(`🎉 恭喜通過 ${currentQuizIsland.name} 挑戰！答對 ${currentQuizScore}/3 題，獲得 EXP 獎勵！`);
  } else {
    alert(`💪 答對 ${currentQuizScore}/3 題，未達 2 題門檻，請再接再厲重新挑戰！`);
  }
}

// 最終挑戰與證書
window.startFinalQuiz = function() {
  // 抽 5 題測驗
  currentQuizIsland = {
    name: '中央島最終挑戰',
    quiz: contentData.islands.flatMap(i => i.quiz).sort(() => 0.5 - Math.random()).slice(0, 5)
  };
  currentQuizIndex = 0;
  currentQuizScore = 0;
  closeSideModal();
  showQuizQuestion();
};

window.openCertificate = function() {
  document.getElementById('cert-name').innerText = gameState.playerName;
  document.getElementById('cert-modal').classList.add('active');
};

document.getElementById('cert-download').onclick = () => {
  alert('證書截圖下載功能已就緒！');
};

document.getElementById('cert-print').onclick = () => {
  window.print();
};

// ==========================================
// 晝夜切換與背景音樂 (Web Audio API)
// ==========================================
let dayNightState = 0; // 0: 日光, 1: 黃昏, 2: 夜晚
function toggleDayNight() {
  dayNightState = (dayNightState + 1) % 3;
  if (dayNightState === 0) {
    gameState.timeMode = 'day';
    document.getElementById('btn-daynight').innerText = '☀️ 白天';
    scene.background.setHex(0xe7f5f0);
    scene.fog.color.setHex(0xe7f5f0);
    ambientLight.intensity = 0.6;
    dirLight.intensity = 1.2;
    dirLight.color.setHex(0xffffff);
  } else if (dayNightState === 1) {
    gameState.timeMode = 'dusk';
    document.getElementById('btn-daynight').innerText = '🌇 黃昏';
    scene.background.setHex(0xfde2e4);
    scene.fog.color.setHex(0xfde2e4);
    ambientLight.intensity = 0.5;
    dirLight.intensity = 0.8;
    dirLight.color.setHex(0xff7043);
  } else {
    gameState.timeMode = 'night';
    document.getElementById('btn-daynight').innerText = '🌙 夜晚';
    scene.background.setHex(0x1e2426);
    scene.fog.color.setHex(0x1e2426);
    ambientLight.intensity = 0.2;
    dirLight.intensity = 0.3;
    dirLight.color.setHex(0x90caf9);
  }
  saveGameState();
}

function toggleAudio() {
  gameState.audioOn = !gameState.audioOn;
  const btn = document.getElementById('btn-audio');
  if (gameState.audioOn) {
    btn.innerText = '🎵 BGM: 開啟';
    startBGM();
  } else {
    btn.innerText = '🎵 BGM: 關閉';
    stopBGM();
  }
  saveGameState();
}

function startBGM() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // 柔和和弦循環播放
  const notes = [261.63, 329.63, 392.00, 523.25]; // C major chord
  bgmInterval = setInterval(() => {
    if (!gameState.audioOn || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(notes[Math.floor(Math.random() * notes.length)], audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 3);
  }, 3500);
}

function stopBGM() {
  if (bgmInterval) clearInterval(bgmInterval);
}

// 啟動
window.addEventListener('DOMContentLoaded', init);
