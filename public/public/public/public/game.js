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

const mats = {
  floor: new THREE.MeshStandardMaterial({color: 0x111d29, roughness: .85, metalness: .35}),
  wall: new THREE.MeshStandardMaterial({color: 0x263b4b, roughness: .65, metalness: .35}),
  dark: new THREE.MeshStandardMaterial({color: 0x182936, metalness: .5, roughness: .5}),
  blue: new THREE.MeshStandardMaterial({color: 0x147bba, emissive: 0x075887, emissiveIntensity: .7}),
  red: new THREE.MeshStandardMaterial({color: 0xa62b43, emissive: 0x8c142b, emissiveIntensity: .7}),
  glow: new THREE.MeshBasicMaterial({color: 0x3ebcff}),
  white: new THREE.MeshStandardMaterial({color: 0xa5bac7, metalness: .7, roughness: .35})
};

function box(w, h, d, mat, X, Y, Z) {
  let m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(X, Y, Z);
  scene.add(m);
  return m;
}

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

function tracer(from, direction, color = 0x70d8ff) {
  let end = from.clone().addScaledVector(direction, 30);
  let ray = new THREE.Raycaster(from, direction, 0, 30);

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
  ammo--;
  updateHUD();

  let shotDirection = new THREE.Vector3();
  camera.getWorldDirection(shotDirection);
  tracer(
    camera.position.clone().add(new THREE.Vector3(0, -.12, 0)),
    shotDirection,
    weapon === 0 ? 0x72ddff : 0xffa65a
  );

  if (mode === 'online') {
    if (socket?.readyState === 1) socket.send(JSON.stringify({type: 'fire'}));
    return;
  }

  let dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let origin = camera.position.clone();
  let ray = new THREE.Raycaster(origin, dir, 0, 45);
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
        ammo = m.ammo;
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
