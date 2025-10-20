const counterDOM = document.getElementById("counter");
const endDOM = document.getElementById("end");

const scene = new THREE.Scene();

const distance = 500;          // camera distance
const zoom = 2;
const chickenSize = 15;
const positionWidth = 42;
const columns = 17;
const boardWidth = positionWidth * columns;
const stepTime = 200;

let renderer, camera;
let initialCameraPositionY, initialCameraPositionX;
let hemiLight, dirLight, backLight;

let lanes, currentLane, currentColumn;
let previousTimestamp, startMoving, moves, stepStartTimestamp;

/* ------------ helper: build / resize camera & renderer ----------- */
function setupRendererAndCamera() {
  // Create or re-use renderer
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const w = window.innerWidth;
  const h = window.innerHeight;

  // (Re)create orthographic camera sized to the viewport
  if (!camera) {
    camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 10000);
    camera.rotation.order = "XYZ";
  } else {
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  }

  camera.rotation.x = (50 * Math.PI) / 180;
  camera.rotation.y = (20 * Math.PI) / 180;
  camera.rotation.z = (10 * Math.PI) / 180;

  // Recompute “isometric” offset to keep scene framed on any aspect
  initialCameraPositionY = -Math.tan(camera.rotation.x) * distance;
  initialCameraPositionX =
    Math.tan(camera.rotation.y) *
    Math.sqrt(distance ** 2 + initialCameraPositionY ** 2);

  camera.position.set(initialCameraPositionX, initialCameraPositionY, distance);

  // Lights (create once; update positions each resize)
  if (!hemiLight) {
    hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    const d = 500;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    backLight = new THREE.DirectionalLight(0x000000, 0.4);
    backLight.castShadow = true;
    backLight.position.set(200, 200, 50);
    scene.add(backLight);
  }
  dirLight.position.set(-100 + initialCameraPositionX, -100 + initialCameraPositionY, 200);
}
setupRendererAndCamera();
window.addEventListener("resize", () => {
  setupRendererAndCamera();
  // keep chicken & camera aligned after a rotation/resize
  if (typeof currentLane === "number") {
    const positionY = currentLane * positionWidth * zoom;
    camera.position.y = initialCameraPositionY + positionY;
    dirLight.position.y = -100 + initialCameraPositionY + positionY;
    const positionX =
      (currentColumn * positionWidth + positionWidth / 2) * zoom -
      (boardWidth * zoom) / 2;
    camera.position.x = initialCameraPositionX + positionX;
    dirLight.position.x = -100 + initialCameraPositionX + positionX;
  }
});

/* ----------------- textures ------------------ */
function Texture(width, height, rects) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(0,0,0,0.6)";
  rects.forEach(r => context.fillRect(r.x, r.y, r.w, r.h));
  return new THREE.CanvasTexture(canvas);
}

const carFrontTexture = new Texture(40, 80, [{ x: 0, y: 10, w: 30, h: 60 }]);
const carBackTexture = new Texture(40, 80, [{ x: 10, y: 10, w: 30, h: 60 }]);
const carRightSideTexture = new Texture(110, 40, [
  { x: 10, y: 0, w: 50, h: 30 }, { x: 70, y: 0, w: 30, h: 30 },
]);
const carLeftSideTexture = new Texture(110, 40, [
  { x: 10, y: 10, w: 50, h: 30 }, { x: 70, y: 10, w: 30, h: 30 },
]);

const truckFrontTexture = new Texture(30, 30, [{ x: 15, y: 0, w: 10, h: 30 }]);
const truckRightSideTexture = new Texture(25, 30, [{ x: 0, y: 15, w: 10, h: 10 }]);
const truckLeftSideTexture = new Texture(25, 30, [{ x: 0, y: 5, w: 10, h: 10 }]);

/* ---------------- world builders -------------- */
function Wheel() {
  const m = new THREE.Mesh(
    new THREE.BoxBufferGeometry(12 * zoom, 33 * zoom, 12 * zoom),
    new THREE.MeshLambertMaterial({ color: 0x333333, flatShading: true })
  );
  m.position.z = 6 * zoom; return m;
}

function Car() {
  const g = new THREE.Group();
  const color = [0xa52523, 0xbdb638, 0x78b14b][Math.floor(Math.random() * 3)];
  const body = new THREE.Mesh(
    new THREE.BoxBufferGeometry(60 * zoom, 30 * zoom, 15 * zoom),
    new THREE.MeshPhongMaterial({ color, flatShading: true })
  );
  body.position.z = 12 * zoom; body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxBufferGeometry(33 * zoom, 24 * zoom, 12 * zoom),
    [
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carBackTexture }),
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carFrontTexture }),
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carRightSideTexture }),
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carLeftSideTexture }),
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }),
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }),
    ]
  );
  cabin.position.set(6 * zoom, 0, 25.5 * zoom);
  cabin.castShadow = true; cabin.receiveShadow = true; g.add(cabin);

  const w1 = new Wheel(); w1.position.x = -18 * zoom; g.add(w1);
  const w2 = new Wheel(); w2.position.x = 18 * zoom; g.add(w2);

  g.castShadow = true; g.receiveShadow = false;
  return g;
}

function Truck() {
  const t = new THREE.Group();
  const color = [0xa52523, 0xbdb638, 0x78b14b][Math.floor(Math.random() * 3)];

  const base = new THREE.Mesh(
    new THREE.BoxBufferGeometry(100 * zoom, 25 * zoom, 5 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xb4c6fc, flatShading: true })
  );
  base.position.z = 10 * zoom; t.add(base);

  const cargo = new THREE.Mesh(
    new THREE.BoxBufferGeometry(75 * zoom, 35 * zoom, 40 * zoom),
    new THREE.MeshPhongMaterial({ color: 0xb4c6fc, flatShading: true })
  );
  cargo.position.set(15 * zoom, 0, 30 * zoom);
  cargo.castShadow = true; cargo.receiveShadow = true; t.add(cargo);

  const cabin = new THREE.Mesh(
    new THREE.BoxBufferGeometry(25 * zoom, 30 * zoom, 30 * zoom),
    [
      new THREE.MeshPhongMaterial({ color, flatShading: true }),
      new THREE.MeshPhongMaterial({ color, flatShading: true, map: truckFrontTexture }),
      new THREE.MeshPhongMaterial({ color, flatShading: true, map: truckRightSideTexture }),
      new THREE.MeshPhongMaterial({ color, flatShading: true, map: truckLeftSideTexture }),
      new THREE.MeshPhongMaterial({ color, flatShading: true }),
      new THREE.MeshPhongMaterial({ color, flatShading: true }),
    ]
  );
  cabin.position.set(-40 * zoom, 0, 20 * zoom); cabin.castShadow = true; cabin.receiveShadow = true; t.add(cabin);

  const w1 = new Wheel(); w1.position.x = -38 * zoom; t.add(w1);
  const w2 = new Wheel(); w2.position.x = -10 * zoom; t.add(w2);
  const w3 = new Wheel(); w3.position.x = 30 * zoom; t.add(w3);
  return t;
}

const threeHeights = [20, 45, 60];
function Three() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.BoxBufferGeometry(15 * zoom, 15 * zoom, 20 * zoom),
    new THREE.MeshPhongMaterial({ color: 0x4d2926, flatShading: true })
  );
  trunk.position.z = 10 * zoom; trunk.castShadow = true; trunk.receiveShadow = true; g.add(trunk);

  const h = threeHeights[Math.floor(Math.random() * threeHeights.length)];
  const crown = new THREE.Mesh(
    new THREE.BoxBufferGeometry(30 * zoom, 30 * zoom, h * zoom),
    new THREE.MeshLambertMaterial({ color: 0x7aa21d, flatShading: true })
  );
  crown.position.z = (h / 2 + 20) * zoom; crown.castShadow = true; g.add(crown);
  return g;
}

function Chicken() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxBufferGeometry(chickenSize * zoom, chickenSize * zoom, 20 * zoom),
    new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true })
  );
  body.position.z = 10 * zoom; body.castShadow = true; body.receiveShadow = true; g.add(body);

  const rowel = new THREE.Mesh(
    new THREE.BoxBufferGeometry(2 * zoom, 4 * zoom, 2 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xf0619a, flatShading: true })
  );
  rowel.position.z = 21 * zoom; g.add(rowel);
  return g;
}

function Road() {
  const road = new THREE.Group();
  const section = color => new THREE.Mesh(
    new THREE.PlaneBufferGeometry(boardWidth * zoom, positionWidth * zoom),
    new THREE.MeshPhongMaterial({ color })
  );
  const m = section(0x454a59); m.receiveShadow = true; road.add(m);
  const l = section(0x393d49); l.position.x = -boardWidth * zoom; road.add(l);
  const r = section(0x393d49); r.position.x = boardWidth * zoom; road.add(r);
  return road;
}

function Grass() {
  const g = new THREE.Group();
  const section = color => new THREE.Mesh(
    new THREE.BoxBufferGeometry(boardWidth * zoom, positionWidth * zoom, 3 * zoom),
    new THREE.MeshPhongMaterial({ color })
  );
  const m = section(0xbaf455); m.receiveShadow = true; g.add(m);
  const l = section(0x99c846); l.position.x = -boardWidth * zoom; g.add(l);
  const r = section(0x99c846); r.position.x = boardWidth * zoom; g.add(r);
  g.position.z = 1.5 * zoom; return g;
}

/* ---------------- lanes ---------------- */
const laneTypes = ["car", "truck", "forest"];
const laneSpeeds = [2, 2.5, 3];

function Lane(index) {
  this.index = index;
  this.type = index <= 0 ? "field" : laneTypes[Math.floor(Math.random() * laneTypes.length)];
  switch (this.type) {
    case "field":
      this.mesh = new Grass(); break;

    case "forest":
      this.mesh = new Grass();
      this.occupiedPositions = new Set();
      this.trees = [1, 2, 3, 4].map(() => {
        const t = new Three(); let p;
        do { p = Math.floor(Math.random() * columns); }
        while (this.occupiedPositions.has(p));
        this.occupiedPositions.add(p);
        t.position.x = (p * positionWidth + positionWidth / 2) * zoom - (boardWidth * zoom) / 2;
        this.mesh.add(t); return t;
      });
      break;

    case "car":
      this.mesh = new Road(); this.direction = Math.random() >= 0.5;
      const occ1 = new Set();
      this.vechicles = [1, 2, 3].map(() => {
        const v = new Car(); let p;
        do { p = Math.floor((Math.random() * columns) / 2); } while (occ1.has(p));
        occ1.add(p);
        v.position.x = (p * positionWidth * 2 + positionWidth / 2) * zoom - (boardWidth * zoom) / 2;
        if (!this.direction) v.rotation.z = Math.PI;
        this.mesh.add(v); return v;
      });
      this.speed = laneSpeeds[Math.floor(Math.random() * laneSpeeds.length)];
      break;

    case "truck":
      this.mesh = new Road(); this.direction = Math.random() >= 0.5;
      const occ2 = new Set();
      this.vechicles = [1, 2].map(() => {
        const v = new Truck(); let p;
        do { p = Math.floor((Math.random() * columns) / 3); } while (occ2.has(p));
        occ2.add(p);
        v.position.x = (p * positionWidth * 3 + positionWidth / 2) * zoom - (boardWidth * zoom) / 2;
        if (!this.direction) v.rotation.z = Math.PI;
        this.mesh.add(v); return v;
      });
      this.speed = laneSpeeds[Math.floor(Math.random() * laneSpeeds.length)];
      break;
  }
}

const generateLanes = () =>
  [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map(i => {
      const lane = new Lane(i);
      lane.mesh.position.y = i * positionWidth * zoom;
      scene.add(lane.mesh); return lane;
    })
    .filter(l => l.index >= 0);

const addLane = () => {
  const index = lanes.length;
  const lane = new Lane(index);
  lane.mesh.position.y = index * positionWidth * zoom;
  scene.add(lane.mesh); lanes.push(lane);
};

/* --------------- game state init --------------- */
const chicken = new Chicken(); scene.add(chicken);

function initialiseValues() {
  lanes = generateLanes();
  currentLane = 0;
  currentColumn = Math.floor(columns / 2);
  previousTimestamp = null;
  startMoving = false;
  moves = [];
  stepStartTimestamp = null;

  chicken.position.set(0, 0, 0);

  camera.position.y = initialCameraPositionY;
  camera.position.x = initialCameraPositionX;
  dirLight.target = chicken;
  dirLight.position.set(-100 + initialCameraPositionX, -100 + initialCameraPositionY, 200);
}
initialiseValues();

/* ---------------- controls ---------------- */
document.querySelector("#retry").addEventListener("click", () => {
  lanes.forEach(l => scene.remove(l.mesh));
  initialiseValues();
  endDOM.style.visibility = "hidden";
});

document.getElementById("forward").addEventListener("click", () => move("forward"));
document.getElementById("backward").addEventListener("click", () => move("backward"));
document.getElementById("left").addEventListener("click", () => move("left"));
document.getElementById("right").addEventListener("click", () => move("right"));

/* Keyboard */
window.addEventListener("keydown", (e) => {
  if (e.code === "ArrowUp") move("forward");
  else if (e.code === "ArrowDown") move("backward");
  else if (e.code === "ArrowLeft") move("left");
  else if (e.code === "ArrowRight") move("right");
});

/* Single-finger swipe (optional mobile gesture) */
let touchStart = null;
window.addEventListener("touchstart", e => {
  if (e.touches.length !== 1) return;
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
window.addEventListener("touchend", e => {
  if (!touchStart) return;
  const dx = (e.changedTouches[0].clientX - touchStart.x);
  const dy = (e.changedTouches[0].clientY - touchStart.y);
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 10) move("right"); else if (dx < -10) move("left");
  } else {
    if (dy < -10) move("forward"); else if (dy > 10) move("backward");
  }
  touchStart = null;
}, { passive: true });

/* ---------------- movement ---------------- */
function move(direction) {
  const final = moves.reduce((p, m) => {
    if (m === "forward") return { lane: p.lane + 1, column: p.column };
    if (m === "backward") return { lane: p.lane - 1, column: p.column };
    if (m === "left") return { lane: p.lane, column: p.column - 1 };
    if (m === "right") return { lane: p.lane, column: p.column + 1 };
  }, { lane: currentLane, column: currentColumn });

  if (direction === "forward") {
    if (lanes[final.lane + 1].type === "forest" &&
      lanes[final.lane + 1].occupiedPositions.has(final.column)) return;
    if (!stepStartTimestamp) startMoving = true; addLane();
  } else if (direction === "backward") {
    if (final.lane === 0) return;
    if (lanes[final.lane - 1].type === "forest" &&
      lanes[final.lane - 1].occupiedPositions.has(final.column)) return;
    if (!stepStartTimestamp) startMoving = true;
  } else if (direction === "left") {
    if (final.column === 0) return;
    if (lanes[final.lane].type === "forest" &&
      lanes[final.lane].occupiedPositions.has(final.column - 1)) return;
    if (!stepStartTimestamp) startMoving = true;
  } else if (direction === "right") {
    if (final.column === columns - 1) return;
    if (lanes[final.lane].type === "forest" &&
      lanes[final.lane].occupiedPositions.has(final.column + 1)) return;
    if (!stepStartTimestamp) startMoving = true;
  }
  moves.push(direction);
}

/* ------------------ main loop ------------------ */
function animate(timestamp) {
  requestAnimationFrame(animate);

  if (!previousTimestamp) previousTimestamp = timestamp;
  const delta = timestamp - previousTimestamp;
  previousTimestamp = timestamp;

  // move vehicles
  lanes.forEach(lane => {
    if (lane.type === "car" || lane.type === "truck") {
      const leftEdge = (-boardWidth * zoom) / 2 - positionWidth * 2 * zoom;
      const rightEdge = (boardWidth * zoom) / 2 + positionWidth * 2 * zoom;
      lane.vechicles.forEach(v => {
        if (lane.direction) {
          v.position.x = v.position.x < leftEdge
            ? rightEdge
            : (v.position.x -= (lane.speed / 16) * delta);
        } else {
          v.position.x = v.position.x > rightEdge
            ? leftEdge
            : (v.position.x += (lane.speed / 16) * delta);
        }
      });
    }
  });

  if (startMoving) { stepStartTimestamp = timestamp; startMoving = false; }

  if (stepStartTimestamp) {
    const t = timestamp - stepStartTimestamp;
    const dist = Math.min(t / stepTime, 1) * positionWidth * zoom;
    const jump = Math.sin(Math.min(t / stepTime, 1) * Math.PI) * 8 * zoom;

    switch (moves[0]) {
      case "forward": {
        const y = currentLane * positionWidth * zoom + dist;
        camera.position.y = initialCameraPositionY + y;
        dirLight.position.y = -100 + initialCameraPositionY + y;
        chicken.position.y = y; chicken.position.z = jump; break;
      }
      case "backward": {
        const y = currentLane * positionWidth * zoom - dist;
        camera.position.y = initialCameraPositionY + y;
        dirLight.position.y = -100 + initialCameraPositionY + y;
        chicken.position.y = y; chicken.position.z = jump; break;
      }
      case "left": {
        const x = (currentColumn * positionWidth + positionWidth / 2) * zoom
          - (boardWidth * zoom) / 2 - dist;
        camera.position.x = initialCameraPositionX + x;
        dirLight.position.x = -100 + initialCameraPositionX + x;
        chicken.position.x = x; chicken.position.z = jump; break;
      }
      case "right": {
        const x = (currentColumn * positionWidth + positionWidth / 2) * zoom
          - (boardWidth * zoom) / 2 + dist;
        camera.position.x = initialCameraPositionX + x;
        dirLight.position.x = -100 + initialCameraPositionX + x;
        chicken.position.x = x; chicken.position.z = jump; break;
      }
    }

    if (t > stepTime) {
      switch (moves[0]) {
        case "forward": currentLane++; counterDOM.textContent = currentLane; break;
        case "backward": currentLane--; counterDOM.textContent = currentLane; break;
        case "left": currentColumn--; break;
        case "right": currentColumn++; break;
      }
      moves.shift();
      stepStartTimestamp = moves.length ? timestamp : null;
    }
  }

  // collision
  if (lanes[currentLane].type === "car" || lanes[currentLane].type === "truck") {
    const minX = chicken.position.x - (chickenSize * zoom) / 2;
    const maxX = chicken.position.x + (chickenSize * zoom) / 2;
    const length = { car: 60, truck: 105 }[lanes[currentLane].type];
    lanes[currentLane].vechicles.forEach(v => {
      const vMin = v.position.x - (length * zoom) / 2;
      const vMax = v.position.x + (length * zoom) / 2;
      if (maxX > vMin && minX < vMax) endDOM.style.visibility = "visible";
    });
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
