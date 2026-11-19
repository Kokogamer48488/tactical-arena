import * as THREE from '/three/three.module.js';

const $ = id => document.getElementById(id);

let effects = [];
let scene, camera, renderer;
let clock = new THREE.Clock();
let playing = false, mode = 'bots', onlineAction = 'create';
let socket = null, myId = null, team = 0, map = 'OUTPOST';
let yaw = 0, pitch = 0, x = -12, z = 0, vy = 0, height = 1.7;
let ammo = 60, weapon = 0, reloading = false, shooting = false;
let lastShot = 0, health = 100, deadUntil = 0, scores = [0, 0];
let remaining = 180, entities = [], walls = [], keys = {};
let joy = {x: 0, y: 0}, lookTouch = null, moveTouch = null;
let lastMove = 0, matchOver = false, roundStart = 0;

const weapons = [
  {name: 'PULSE RIFLE', max: 60, interval: 100, damage: 34},
  {name: 'ARC BLASTER', max: 20, interval: 350, damage: 60}
];
function makeRobloxTexture(style, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f1f5f7';
  ctx.fillRect(0, 0, 128, 128);

  function stud(x, y) {
    ctx.fillStyle = '#aab8c0';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - .7, y - .7, .7, 0, Math.PI * 2);
    ctx.fill();
  }

  if (style === 'floor') {
    for (let y = 0; y < 128; y += 32) {
      for (let x = 0; x < 128; x += 32) {
        ctx.fillStyle = ((x + y) / 32) % 2 ? '#e7edf0' : '#f8fafb';
        ctx.fillRect(x + 1, y + 1, 30, 30);
        ctx.strokeStyle = '#b9c6cd';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1.5, y + 1.5, 29, 29);
        stud(x + 5, y + 5);
        stud(x + 27, y + 5);
        stud(x + 5, y + 27);
        stud(x + 27, y + 27);
      }
    }
  } else if (style === 'wall') {
    for (let y = 0; y < 128; y += 64) {
      for (let x = 0; x < 128; x += 64) {
        ctx.fillStyle = '#f7f9fa';
        ctx.fillRect(x + 3, y + 3, 58, 58);
        ctx.strokeStyle = '#aab9c1';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 4.5, y + 4.5, 55, 55);
        ctx.fillStyle = '#e1e9ed';
        ctx.fillRect(x + 10, y + 10, 44, 44);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 12, y + 12, 40, 5);
        stud(x + 8, y + 8);
        stud(x + 56, y + 8);
        stud(x + 8, y + 56);
        stud(x + 56, y + 56);
      }
    }
  } else {
    ctx.fillStyle = '#f7f9fa';
    ctx.fillRect(5, 5, 118, 118);
    ctx.strokeStyle = '#aebdc5';
    ctx.lineWidth = 4;
    ctx.strokeRect(7, 7, 114, 114);
    ctx.fillStyle = '#e4ebef';
    ctx.fillRect(14, 14, 100, 100);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(17, 17, 94, 12);
    ctx.fillStyle = '#d0dce2';
    ctx.fillRect(17, 99, 94, 12);
    stud(12, 12);
    stud(116, 12);
    stud(12, 116);
    stud(116, 116);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 2;
  return texture;
}

const mats = {
  floor: new THREE.MeshStandardMaterial({
    color: 0x8299a8, map: makeRobloxTexture('floor', 8, 8),
    roughness: .62, metalness: .02
  }),
  wall: new THREE.MeshStandardMaterial({
    color: 0x8da7b6, map: makeRobloxTexture('wall', 2, 2),
    roughness: .42, metalness: .03
  }),
  dark: new THREE.MeshStandardMaterial({
    color: 0x243747, map: makeRobloxTexture('wall'),
    roughness: .38, metalness: .02
  }),
  blue: new THREE.MeshStandardMaterial({
    color: 0x2187cf, map: makeRobloxTexture('armor'),
    roughness: .32, metalness: .01
  }),
  red: new THREE.MeshStandardMaterial({
    color: 0xc84056, map: makeRobloxTexture('armor'),
    roughness: .32, metalness: .01
  }),
  glow: new THREE.MeshBasicMaterial({color: 0x58cfff}),
  white: new THREE.MeshStandardMaterial({
    color: 0xe6eef2, map: makeRobloxTexture('armor'),
    roughness: .34, metalness: .01
  })
};

function cover(X, Z, w, d, h = 2.5) {
  box(w, h, d, mats.wall, X, h / 2, Z);
  box(w + .03, .06, d + .03, mats.glow, X, h - .06, Z);
  walls.push({x: X, z: Z, w: w / 2 + .45, d: d / 2 + .45});
}

function buildWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080f1a);
  scene.fog = new THREE.Fog(0x080f1a, 26, 75);

  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .1, 100);
  camera.rotation.order = 'YXZ';

  renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance'
  });

  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('game').appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0x8cc9ef, 0x18202d, 2));
  let sun = new THREE.DirectionalLight(0x9fd7ff, 2);
  sun.position.set(5, 15, 8);
  scene.add(sun);

  box(52, 1, 52, mats.floor, 0, -.5, 0);

  for (let i = -24; i <= 24; i += 4) {
    box(.025, .015, 50, mats.dark, i, .01, 0);
    box(50, .015, .025, mats.dark, 0, .01, i);
  }

  for (let i = -1; i <= 1; i += 2) {
    box(1, 7, 52, mats.dark, i * 26, 3.5, 0);
    box(52, 7, 1, mats.dark, 0, 3.5, i * 26);
    box(.12, .15, 50, i < 0 ? mats.blue : mats.red, i * 25.4, 5, 0);
    box(50, .15, .12, mats.glow, 0, 5, i * 25.4);
  }

  if (map === 'OUTPOST') {
    [
      [-7,-8,3,6], [7,8,3,6], [-7,9,4,3], [7,-9,4,3],
      [0,0,4,4], [-16,0,3,5], [16,0,3,5], [0,-17,6,2], [0,17,6,2]
    ].forEach(a => cover(...a));
  } else {
    [
      [-10,-10,5,3], [10,10,5,3], [-10,10,3,5], [10,-10,3,5],
      [0,-7,7,2], [0,7,7,2], [-4,0,2,4], [4,0,2,4]
    ].forEach(a => cover(...a));

    let ring = new THREE.Mesh(
      new THREE.TorusGeometry(4, .16, 8, 32), mats.glow
    );
    ring.position.set(0, 8, 0);
    scene.add(ring);
  }

  for (let i = -20; i <= 20; i += 10) {
    box(1, 9, 1, mats.dark, i, 4.5, -25);
    box(.1, 5, .1, mats.glow, i, 5, -24.4);
    box(1, 9, 1, mats.dark, i, 4.5, 25);
  }

  let gun = new THREE.Group();

  let body = new THREE.Mesh(new THREE.BoxGeometry(.25, .25, .75), mats.dark);
  body.position.set(.34, -.3, -.65);
  gun.add(body);

  let barrel = new THREE.Mesh(new THREE.BoxGeometry(.09, .09, .45), mats.white);
  barrel.position.set(.34, -.25, -1.15);
  gun.add(barrel);

  let strip = new THREE.Mesh(new THREE.BoxGeometry(.15, .025, .35), mats.glow);
  strip.position.set(.34, -.165, -.62);
  gun.add(strip);

  camera.add(gun);
  scene.add(camera);
}

function makeEntity(id, t, name) {
  let g = new THREE.Group();
  let armor = t === 0 ? mats.blue : mats.red;

  const mesh = (geo, mat, X, Y, Z) => {
    let m = new THREE.Mesh(geo, mat);
    m.position.set(X, Y, Z);
    g.add(m);
    return m;
  };

  mesh(new THREE.CapsuleGeometry(.30, .52, 4, 8), mats.dark, 0, 1.27, 0);
  mesh(new THREE.BoxGeometry(.68, .60, .33), armor, 0, 1.45, -.10);
  mesh(new THREE.BoxGeometry(.42, .25, .36), mats.white, 0, 1.70, -.08);
  mesh(new THREE.CapsuleGeometry(.27, .12, 4, 10), mats.dark, 0, 2.01, 0);
  mesh(new THREE.BoxGeometry(.42, .13, .10), t === 0 ? mats.glow : mats.red, 0, 2.03, -.25);
  mesh(new THREE.BoxGeometry(.45, .12, .14), armor, 0, 2.24, 0);
  mesh(new THREE.BoxGeometry(.56, .22, .34), mats.dark, 0, .91, 0);

  for (let side of [-1, 1]) {
    let shoulder = mesh(new THREE.SphereGeometry(.20, 8, 6), armor, side * .48, 1.65, 0);
    shoulder.scale.set(1.2, .8, 1);
    mesh(new THREE.CapsuleGeometry(.12, .36, 3, 6), mats.dark, side * .49, 1.32, 0);
    mesh(new THREE.CapsuleGeometry(.11, .33, 3, 6), armor, side * .50, .98, -.04);
    mesh(new THREE.SphereGeometry(.10, 8, 6), mats.white, side * .50, .76, -.04);
    mesh(new THREE.CapsuleGeometry(.15, .38, 3, 6), armor, side * .22, .65, 0);
    mesh(new THREE.CapsuleGeometry(.12, .30, 3, 6), mats.dark, side * .22, .30, 0);
    mesh(new THREE.BoxGeometry(.27, .13, .42), mats.white, side * .22, .10, -.08);
  }

  mesh(new THREE.BoxGeometry(.55, .10, .13), mats.dark, .32, 1.25, -.42);
  mesh(new THREE.BoxGeometry(.10, .09, .52), mats.white, .48, 1.26, -.56);

  scene.add(g);

  let e = {
    id, team: t, name, mesh: g,
    x: t === 0 ? -12 : 12,
    z: (Math.random() - .5) * 20,
    hp: 100, dead: false, respawn: 0, attack: 0,
    dir: Math.random() * 6.28, change: 0
  };

  entities.push(e);
  return e;
}

function clearWorld() {
  for (const e of effects) {
    e.mesh.geometry.dispose();
    e.mesh.material.dispose();
  }
  effects = [];

  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
  }

  entities = [];
  walls = [];
}

function blocked(nx, nz) {
  return Math.abs(nx) > 24.5 || Math.abs(nz) > 24.5 ||
    walls.some(w => Math.abs(nx - w.x) < w.w && Math.abs(nz - w.z) < w.d);
}

function move(dx, dz) {
  if (!blocked(x + dx, z)) x += dx;
  if (!blocked(x, z + dz)) z += dz;
}

function reset() {
  x = team === 0 ? -12 : 12;
  z = 0;
  yaw = team === 0 ? -Math.PI / 2 : Math.PI / 2;
  pitch = 0;
  height = 1.7;
  vy = 0;
  health = 100;
  ammo = 60;
  weapon = 0;
  deadUntil = 0;
  matchOver = false;
  scores = [0, 0];
  remaining = 180;
  roundStart = performance.now();
  updateHUD();
}

function updateHUD() {
  $('blueScore').textContent = scores[0];
  $('redScore').textContent = scores[1];
  $('timer').textContent = mode === 'training'
    ? '∞'
    : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;

  $('hp').textContent = Math.max(0, health);
  $('hpbar').style.width = Math.max(0, health) + '%';
  $('ammo').textContent = ammo;
  $('weaponName').textContent = weapons[weapon].name;
}

function showMessage(t) {
  $('message').textContent = t;
}

function feed(t) {
  $('feed').textContent = t;
  setTimeout(() => {
    if ($('feed').textContent === t) $('feed').textContent = '';
  }, 3500);
}

function hit() {
  let el = $('hitmarker');
  el.style.opacity = 1;
  setTimeout(() => el.style.opacity = 0, 120);
}

function respawn() {
  x = team === 0 ? -12 : 12;
  z = (Math.random() - .5) * 12;
  health = 100;
  ammo = weapons[weapon].max;
  deadUntil = 0;
  showMessage('');
  updateHUD();
}

function tracer(from, direction, color = 0x70d8ff, range = 30) {
  let end = from.clone().addScaledVector(direction, range);
  let ray = new THREE.Raycaster(from, direction, 0, range);

  let blocks = ray.intersectObjects(
    scene.children.filter(o => o.isMesh && o.geometry.type === 'BoxGeometry'),
    false
  );

  if (blocks.length) end.copy(blocks[0].point);

  let delta = end.clone().sub(from);
  let mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(.018, .018, delta.length(), 5),
    new THREE.MeshBasicMaterial({color, transparent: true, opacity: .9})
  );

  mesh.position.copy(from).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  scene.add(mesh);
  effects.push({mesh, until: performance.now() + 100});
}

function shoot() {
  let now = performance.now(), w = weapons[weapon];

  if (!playing || deadUntil || matchOver || reloading ||
      now - lastShot < w.interval || ammo <= 0) return;

  lastShot = now;

  let shotDirection = new THREE.Vector3();
  camera.getWorldDirection(shotDirection);
  tracer(
    camera.position.clone().add(new THREE.Vector3(0, -.12, 0)),
    shotDirection,
    weapon === 2 ? 0xffa65a : 0x72ddff,
    w.range
  );

  if (mode === 'online') {
    if (socket?.readyState === 1) {
      socket.send(JSON.stringify({type: 'fire', weapon}));
    }
    return;
  }

    ammo--;
  magazines[weapon] = ammo;
  updateHUD();

  let dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let origin = camera.position.clone();
  let ray = new THREE.Raycaster(origin, dir, 0, w.range);
    let targets = entities.filter(e => e.team !== team && !e.dead);
  let hits = ray.intersectObjects(targets.map(e => e.mesh), true);

  if (hits.length) {
    let target = targets.find(e => {
      let o = hits[0].object;
      while (o && o !== e.mesh) o = o.parent;
      return !!o;
    });

    if (target) {
      let distance = hits[0].distance;
      let obstruction = ray.intersectObjects(
        scene.children.filter(o => o.isMesh && o.geometry.type === 'BoxGeometry'),
        false
      ).some(h => h.distance < distance);

      if (!obstruction) {
        target.hp -= w.damage;
        hit();

        if (target.hp <= 0) {
          target.dead = true;
          target.mesh.visible = false;
          target.respawn = now + 3000;
          scores[team]++;
          feed('DU → ' + target.name);
          updateHUD();
        }
      }
    }
  }
}

function reload() {
  if (reloading || ammo === weapons[weapon].max || deadUntil) return;
  reloading = true;
  showMessage('NACHLADEN');

  setTimeout(() => {
    if (!playing) return;
    reloading = false;
    ammo = weapons[weapon].max;

    if (mode === 'online' && socket?.readyState === 1) {
      socket.send(JSON.stringify({type: 'reload'}));
    }

    showMessage('');
    updateHUD();
  }, 900);
}

function switchWeapon() {
  if (mode === 'online') {
    feed('ONLINE: PULSE RIFLE');
    return;
  }

  if (deadUntil || reloading) return;
  weapon = 1 - weapon;
  ammo = weapons[weapon].max;
  updateHUD();
}

function bots(dt, now) {
  for (let e of entities) {
    if (e.dead) {
      if (now > e.respawn) {
        e.dead = false;
        e.hp = 100;
        e.x = e.team === 0 ? -12 : 12;
        e.z = (Math.random() - .5) * 18;
        e.mesh.visible = true;
      }
      continue;
    }

    if (now > e.change) {
      e.change = now + 1000 + Math.random() * 2200;
      e.dir = Math.random() * Math.PI * 2;
    }

    let speed = 2 * dt;
    let nx = e.x + Math.sin(e.dir) * speed;
    let nz = e.z + Math.cos(e.dir) * speed;

    if (!blocked(nx, nz)) {
      e.x = nx;
      e.z = nz;
    } else {
      e.dir += 1.8;
    }

    e.mesh.position.set(e.x, 0, e.z);
    e.mesh.rotation.y = e.dir;

    let dist = Math.hypot(x - e.x, z - e.z);

    if (e.team !== team && mode !== 'training' && !deadUntil &&
        dist < 16 && now > e.attack) {
      e.attack = now + 800 + Math.random() * 1000;

      let from = new THREE.Vector3(e.x, 1.5, e.z);
      let direction = new THREE.Vector3(
        x - e.x, height - 1.5, z - e.z
      ).normalize();

      tracer(from, direction, 0xff526c);

      if (Math.random() < .45) {
        health -= 10;

        if (health <= 0) {
          health = 0;
          deadUntil = now + 3000;
          scores[e.team]++;
          feed(e.name + ' → DU');
          showMessage('RESPAWN IN 3 SEKUNDEN');
        }

        updateHUD();
      }
    }
  }
}

function startLocal() {
  team = 0;
  reset();
  buildWorld();

  if (mode === 'training') {
    for (let i = 0; i < 4; i++) {
      makeEntity('bot' + i, 1, 'ZIEL ' + (i + 1));
    }
  } else {
    for (let i = 0; i < 3; i++) {
      makeEntity('red' + i, 1, 'BOT ROT ' + (i + 1));
    }
    for (let i = 0; i < 2; i++) {
      makeEntity('blue' + i, 0, 'BOT BLAU ' + (i + 1));
    }
  }

  begin();
}

function begin() {
  playing = true;
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');

  $('hudMode').textContent =
    mode === 'training' ? 'TRAINING' :
    mode === 'online' ? 'ONLINE TDM' : 'TEAM DEATHMATCH';

  $('mapDisplay').textContent =
    map === 'OUTPOST' ? 'OUTPOST 07' : 'NEXUS CORE';

  $('roomDisplay').textContent = '';
  $('invite').classList.toggle('hidden', mode !== 'online');
  showMessage('');
  clock.getDelta();
}
async function startOnline() {
  try {
    let resp = await fetch('/api/session', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: onlineAction,
        code: $('code').value,
        name: $('name').value,
        map
      })
    });

    let data = await resp.json();
    if (!resp.ok) throw Error(data.error);

    map = data.map;
    socket = new WebSocket(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
    );

    socket.onopen = () => {
      socket.send(JSON.stringify({type: 'auth', token: data.token}));
    };

    socket.onmessage = ev => {
      let m = JSON.parse(ev.data);

      if (m.type === 'welcome') {
        myId = m.id;
        team = m.team;
        reset();
        buildWorld();
        begin();

        $('roomDisplay').textContent =
          'RAUM: ' + m.code + ' · ' + (team === 0 ? 'BLAU' : 'ROT');

        $('invite').dataset.code = m.code;
      }

      if (m.type === 'state') {
        scores = m.scores;
        remaining = m.time;

        let self = m.players.find(p => p.id === myId);

        if (self) {
          health = Math.max(0, self.hp);

          if (self.dead) {
            deadUntil = performance.now() + 200;
            showMessage('RESPAWN ...');
          } else if (deadUntil) {
            deadUntil = 0;
            x = self.x;
            z = self.z;
            showMessage('');
          }
        }

        let others = m.players.filter(p => p.id !== myId);

        for (let p of others) {
          let e = entities.find(e => e.id === p.id) ||
            makeEntity(p.id, p.team, p.name);

          e.mesh.visible = !p.dead;
          e.mesh.position.set(p.x, 0, p.z);
          e.mesh.rotation.y = p.yaw;
        }

        for (let e of [...entities]) {
          if (!others.some(p => p.id === e.id)) {
            scene.remove(e.mesh);
            entities.splice(entities.indexOf(e), 1);
          }
        }

        if (!remaining && !matchOver) {
          matchOver = true;
          showMessage(
            'MATCH BEENDET · ' +
            (scores[0] === scores[1]
              ? 'UNENTSCHIEDEN'
              : scores[0] > scores[1]
                ? 'BLAU GEWINNT'
                : 'ROT GEWINNT')
          );
        }

        updateHUD();
      }

            if (m.type === 'ammo') {
        if (Number.isInteger(m.weapon) && magazines[m.weapon] !== undefined) {
          magazines[m.weapon] = m.ammo;
          if (weapon === m.weapon) ammo = m.ammo;
        }
        updateHUD();
      }

      if (m.type === 'hit') hit();
      if (m.type === 'feed') feed(m.text);
    };

    socket.onclose = () => {
      if (playing && mode === 'online') {
        showMessage('VERBINDUNG GETRENNT');
      }
    };

    socket.onerror = () => {
      $('error').textContent = 'Verbindung zum Server fehlgeschlagen.';
    };
  } catch (e) {
    $('error').textContent = e.message;
  }
}

function stop() {
  playing = false;
  shooting = false;
  keys = {};
  joy = {x: 0, y: 0};

  if (socket) {
    socket.close();
    socket = null;
  }

  if (document.pointerLockElement) document.exitPointerLock();

  clearWorld();
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
}
function frame() {
  requestAnimationFrame(frame);
  if (!playing) return;

  let dt = Math.min(clock.getDelta(), .05);
  let now = performance.now();

  if (mode !== 'online' && mode !== 'training' && !matchOver) {
    remaining = Math.max(0, 180 - Math.floor((now - roundStart) / 1000));

    if (!remaining) {
      matchOver = true;
      showMessage(
        'MATCH BEENDET · ' +
        (scores[0] === scores[1]
          ? 'UNENTSCHIEDEN'
          : scores[0] > scores[1]
            ? 'BLAU GEWINNT'
            : 'ROT GEWINNT')
      );
    }

    updateHUD();
  }

  if (mode !== 'online' && deadUntil && now >= deadUntil) respawn();

  if (!deadUntil && !matchOver) {
    let forward =
      (keys.KeyW || keys.ArrowUp ? 1 : 0) -
      (keys.KeyS || keys.ArrowDown ? 1 : 0) -
      joy.y;

    let side =
      (keys.KeyD || keys.ArrowRight ? 1 : 0) -
      (keys.KeyA || keys.ArrowLeft ? 1 : 0) +
      joy.x;

    let len = Math.hypot(forward, side);

    if (len > 1) {
      forward /= len;
      side /= len;
    }

    let speed = 6 * dt;

    move(
      (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed,
      (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * speed
    );

    vy -= 15 * dt;
    height += vy * dt;

    if (height < 1.7) {
      height = 1.7;
      vy = 0;
    }

    if (shooting) shoot();
  }

  camera.position.set(x, height, z);
  camera.rotation.set(pitch, yaw, 0);

  if (mode !== 'online') {
    bots(dt, now);
  } else if (socket?.readyState === 1 && now - lastMove > 80) {
    lastMove = now;
    socket.send(JSON.stringify({type: 'move', x, z, yaw, pitch}));
  }

  for (let i = effects.length - 1; i >= 0; i--) {
    if (now > effects[i].until) {
      let e = effects.splice(i, 1)[0];
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    }
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(frame);

for (let b of document.querySelectorAll('.mode')) {
  b.onclick = () => {
    document.querySelectorAll('.mode').forEach(
      x => x.classList.remove('selected')
    );
    b.classList.add('selected');
    mode = b.dataset.mode;
    $('onlineOptions').classList.toggle('hidden', mode !== 'online');
  };
}

$('create').onclick = () => {
  onlineAction = 'create';
  $('create').classList.add('active');
  $('join').classList.remove('active');
  $('code').classList.add('hidden');
};

$('join').onclick = () => {
  onlineAction = 'join';
  $('join').classList.add('active');
  $('create').classList.remove('active');
  $('code').classList.remove('hidden');
};

$('start').onclick = () => {
  $('error').textContent = '';
  map = $('map').value;
  mode === 'online' ? startOnline() : startLocal();
};

$('exit').onclick = stop;

window.addEventListener('resize', () => {
  if (renderer) {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
});

document.addEventListener('keydown', e => {
  if (!playing) return;
  keys[e.code] = true;

  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }

  if (e.code === 'KeyR') reload();
  if (e.code === 'Digit1' || e.code === 'Digit2') switchWeapon();
  if (e.code === 'Space' && height <= 1.71) vy = 6;
  if (e.code === 'Escape' && matchOver) stop();
});

document.addEventListener('keyup', e => {
  keys[e.code] = false;
});

document.addEventListener('mousemove', e => {
  if (playing && document.pointerLockElement === renderer.domElement) {
    yaw -= e.movementX * .0025;
    pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * .0025));
  }
});

document.addEventListener('mousedown', e => {
  if (!playing || e.target.closest('button')) return;

  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
  } else if (e.button === 0) {
    shooting = true;
  }
});

document.addEventListener('mouseup', () => {
  shooting = false;
});
let joystick = $('joystick');

function joystickMove(e) {
  let r = joystick.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2);
  let dy = e.clientY - (r.top + r.height / 2);
  let len = Math.hypot(dx, dy);
  let max = 35;

  if (len > max) {
    dx *= max / len;
    dy *= max / len;
  }

  joy = {x: dx / max, y: dy / max};
  $('stick').style.transform = `translate(${dx}px,${dy}px)`;
}

joystick.addEventListener('pointerdown', e => {
  e.preventDefault();
  moveTouch = e.pointerId;
  joystick.setPointerCapture(e.pointerId);
  joystickMove(e);
});

joystick.addEventListener('pointermove', e => {
  if (e.pointerId === moveTouch) joystickMove(e);
});

function joyEnd(e) {
  if (e.pointerId === moveTouch) {
    moveTouch = null;
    joy = {x: 0, y: 0};
    $('stick').style.transform = '';
  }
}

joystick.addEventListener('pointerup', joyEnd);
joystick.addEventListener('pointercancel', joyEnd);

let look = $('lookZone');

look.addEventListener('pointerdown', e => {
  e.preventDefault();
  lookTouch = {id: e.pointerId, x: e.clientX, y: e.clientY};
  look.setPointerCapture(e.pointerId);
});

look.addEventListener('pointermove', e => {
  if (lookTouch?.id === e.pointerId) {
    yaw -= (e.clientX - lookTouch.x) * .005;
    pitch = Math.max(
      -1.4,
      Math.min(1.4, pitch - (e.clientY - lookTouch.y) * .005)
    );

    lookTouch.x = e.clientX;
    lookTouch.y = e.clientY;
  }
});

look.addEventListener('pointerup', () => lookTouch = null);
look.addEventListener('pointercancel', () => lookTouch = null);

$('shoot').addEventListener('pointerdown', e => {
  e.preventDefault();
  shooting = true;
  e.target.setPointerCapture(e.pointerId);
});

for (let ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('shoot').addEventListener(ev, () => shooting = false);
}

$('reload').addEventListener('pointerdown', e => {
  e.preventDefault();
  reload();
});

$('jump').addEventListener('pointerdown', e => {
  e.preventDefault();
  if (height <= 1.71) vy = 6;
});

$('switch').addEventListener('pointerdown', e => {
  e.preventDefault();
  switchWeapon();
});

$('invite').onclick = async () => {
  let u = new URL(location.href);
  u.search = '';
  u.searchParams.set('room', $('invite').dataset.code);

  try {
    await navigator.clipboard.writeText(u.href);
    feed('EINLADUNGSLINK KOPIERT');
  } catch {
    window.prompt('Einladungslink kopieren:', u.href);
  }
};

const inviteCode = new URLSearchParams(location.search).get('room');

if (inviteCode && /^[a-f0-9]{6}$/i.test(inviteCode)) {
  document.querySelector('[data-mode="online"]').click();
  $('join').click();
  $('code').value = inviteCode.toUpperCase();
}
function animateCharacters(time) {
  requestAnimationFrame(animateCharacters);
  if (!playing) return;

  for (const character of entities) {
    const model = character.mesh;
    if (!model.visible) continue;

    const current = model.position;

    if (!character.lastAnimationPosition) {
      character.lastAnimationPosition = current.clone();
    }

    const distance = current.distanceTo(character.lastAnimationPosition);
    character.lastAnimationPosition.copy(current);

    const moving = distance > 0.001;
    const swing = moving ? Math.sin(time * 0.012) * 0.12 : 0;
    const children = model.children;

    // Arme und Beine bewegen sich gegengleich.
    if (children.length >= 22) {
      children[9].position.z = swing;
      children[10].position.z = swing - .04;
      children[11].position.z = swing - .04;

      children[16].position.z = -swing;
      children[17].position.z = -swing - .04;
      children[18].position.z = -swing - .04;

      children[12].position.z = -swing;
      children[13].position.z = -swing;
      children[14].position.z = -swing - .08;

      children[19].position.z = swing;
      children[20].position.z = swing;
      children[21].position.z = swing - .08;
    }

    model.position.y = moving
      ? Math.abs(Math.sin(time * 0.012)) * 0.035
      : Math.sin(time * 0.002) * 0.008;
  }
}

requestAnimationFrame(animateCharacters);
// Neue Waffen und kleinere Magazine im Einzelspieler
weapons[0].max = 24;
weapons[1].max = 8;

weapons.push(
  {name: 'SCOUT CARBINE', max: 12, interval: 240, damage: 50},
  {name: 'BURST SMG', max: 20, interval: 80, damage: 22}
);

// Beim Start die passende Magazingröße setzen.
// Online bleibt zunächst bei 60, bis der Server angepasst ist.
const originalReset = reset;
reset = function () {
  weapons[0].max = mode === 'online' ? 60 : 24;
  originalReset();
  ammo = weapons[0].max;
  updateHUD();
};

// Durch alle Waffen wechseln
switchWeapon = function () {
  if (mode === 'online') {
    feed('ONLINE: PULSE RIFLE');
    return;
  }

  if (deadUntil || reloading) return;

  weapon = (weapon + 1) % weapons.length;
  ammo = weapons[weapon].max;
  updateHUD();
  feed(weapons[weapon].name);
};

// Zusätzliche Details für die Rüstung
const originalMakeEntity = makeEntity;
makeEntity = function (id, teamColor, name) {
  const character = originalMakeEntity(id, teamColor, name);
  const armor = teamColor === 0 ? mats.blue : mats.red;

  function addDetail(width, height, depth, material, x, y, z) {
    const detail = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );
    detail.position.set(x, y, z);
    character.mesh.add(detail);
  }

  // Brustpanzer, Gürtel und Rückenmodul
  addDetail(.46, .30, .09, mats.dark, 0, 1.42, -.29);
  addDetail(.34, .05, .10, armor, 0, 1.45, -.35);
  addDetail(.58, .10, .38, mats.white, 0, .91, 0);
  addDetail(.38, .52, .20, mats.dark, 0, 1.43, .28);

  // Zusätzliche Helmpanzerung
  addDetail(.50, .08, .38, armor, 0, 2.21, 0);

  return character;
};
// Die drei neuen Waffen
weapons.splice(0, weapons.length,
  {name:'SNIPER', max:6, damage:20, range:45, interval:700},
  {name:'MASCHINENGEWEHR', max:30, damage:10, range:25, interval:110},
  {name:'SHOTGUN', max:2, damage:50, range:10, interval:650}
);

let magazines = weapons.map(w => w.max);

// Beim Start und Respawn Magazine zurücksetzen
reset = function () {
  originalReset();
  magazines = weapons.map(w => w.max);
  weapon = 0;
  ammo = magazines[0];
  reloading = false;
  updateHUD();
};

respawn = function () {
  x = team === 0 ? -12 : 12;
  z = (Math.random() - .5) * 12;
  health = 100;
  magazines = weapons.map(w => w.max);
  ammo = magazines[weapon];
  deadUntil = 0;
  showMessage('');
  updateHUD();
};

// Waffen wechseln
switchWeapon = function () {
  if (deadUntil || reloading) return;
  magazines[weapon] = ammo;
  weapon = (weapon + 1) % weapons.length;
  ammo = magazines[weapon];
  updateHUD();
  feed(weapons[weapon].name);
};

// Nachladen
reload = function () {
  if (reloading || deadUntil || ammo === weapons[weapon].max) return;

  reloading = true;
  const selected = weapon;
  showMessage('NACHLADEN');

  setTimeout(() => {
    if (!playing) {
      reloading = false;
      return;
    }

    magazines[selected] = weapons[selected].max;
    if (weapon === selected) ammo = magazines[selected];

    if (mode === 'online' && socket?.readyState === 1) {
      socket.send(JSON.stringify({type:'reload', weapon:selected}));
    }

    reloading = false;
    showMessage('');
    updateHUD();
  }, 900);
};
