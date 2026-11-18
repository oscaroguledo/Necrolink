/**
 * The 3D graveyard behind Necrolink (three.js, no React).
 *
 * Moonlit hills of headstones, crosses, dead trees and an iron fence;
 * floating ghosts with rippling skirts that light the stones around them;
 * bats circling the moon; will-o'-the-wisps; rolling fog; a zombie hand
 * that claws out of the ground now and then; and distant lightning.
 * The camera follows the pointer and walks into the graveyard as the page
 * scrolls.
 *
 * Everything is generated in code (no model or texture downloads) from a
 * seeded random generator, so the scene looks the same on every visit.
 */

import * as THREE from 'three';

export interface SceneOptions {
  /** Draw one still frame: no animation, no lightning. */
  reducedMotion: boolean;
  /** Phones and weak GPUs: fewer objects, no ghost lights, lower resolution. */
  lowPower: boolean;
  /** Called at each lightning strike, so the page can flash too. */
  onLightning?: () => void;
}

export interface SceneHandle {
  /** Pointer position, -1..1 on each axis. */
  setPointer(x: number, y: number): void;
  /** Scroll progress through the page, 0..1. */
  setScroll(progress: number): void;
  resize(width: number, height: number): void;
  /** Stop or resume rendering (e.g. while the tab is hidden). */
  setRunning(running: boolean): void;
  dispose(): void;
}

/** mulberry32: small seeded PRNG so the layout is stable between visits. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Soft round glow, drawn on a canvas (used for the moon halo, wisps, fog). */
function glowTexture(
  inner: string,
  outer: string,
  size = 128
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Full moon with craters, drawn on a canvas. */
function moonTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const disc = ctx.createRadialGradient(c * 0.8, c * 0.75, 0, c, c, c);
  disc.addColorStop(0, '#f8fafc');
  disc.addColorStop(0.6, '#e2e8f0');
  disc.addColorStop(0.95, '#a7b3c3');
  disc.addColorStop(1, 'rgba(167,179,195,0)');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.98, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(100,116,139,0.35)';
  for (const [x, y, r] of [
    [0.62, 0.32, 0.1],
    [0.35, 0.62, 0.13],
    [0.68, 0.68, 0.07],
    [0.45, 0.3, 0.05],
    [0.28, 0.42, 0.04],
  ]) {
    ctx.beginPath();
    ctx.arc(x! * size, y! * size, r! * size, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A lumpy cloud of overlapping soft blobs, for fog banks. */
function fogTexture(random: () => number, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 24; i++) {
    const x = size * (0.2 + random() * 0.6);
    const y = size * (0.35 + random() * 0.3);
    const r = size * (0.12 + random() * 0.18);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Rounded-top headstone outline, extruded. */
function headstoneGeometry(
  width: number,
  height: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const r = width / 2;
  shape.moveTo(-r, 0);
  shape.lineTo(-r, height - r);
  shape.absarc(0, height - r, r, Math.PI, 0, true);
  shape.lineTo(r, 0);
  shape.lineTo(-r, 0);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 12,
  });
}

/** Ghost body: a dome that flares into a skirt (lathe), plus its rest positions. */
function ghostGeometry(): {
  geometry: THREE.LatheGeometry;
  rest: Float32Array;
} {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    // Dome: quarter circle from the top down to the shoulders
    const a = (i / 12) * (Math.PI / 2);
    points.push(
      new THREE.Vector2(Math.sin(a) * 0.45, 1.1 + Math.cos(a) * 0.45)
    );
  }
  for (let i = 1; i <= 10; i++) {
    // Body widening into the skirt
    const t = i / 10;
    points.push(new THREE.Vector2(0.45 + t * t * 0.22, 1.1 - t * 1.1));
  }
  const geometry = new THREE.LatheGeometry(points, 28);
  const rest = Float32Array.from(
    geometry.attributes.position!.array as ArrayLike<number>
  );
  return { geometry, rest };
}

/** Branching dead tree made of tapered cylinders. */
function deadTree(random: () => number, material: THREE.Material): THREE.Group {
  const tree = new THREE.Group();
  const branch = (
    parent: THREE.Object3D,
    length: number,
    radius: number,
    depth: number
  ) => {
    const geometry = new THREE.CylinderGeometry(
      radius * 0.6,
      radius,
      length,
      6
    );
    geometry.translate(0, length / 2, 0);
    const mesh = new THREE.Mesh(geometry, material);
    parent.add(mesh);
    if (depth === 0) return;
    const children = 2 + Math.floor(random() * 2);
    for (let i = 0; i < children; i++) {
      const pivot = new THREE.Object3D();
      pivot.position.y = length * (0.55 + random() * 0.4);
      pivot.rotation.z = (random() - 0.5) * 1.6;
      pivot.rotation.y = random() * Math.PI * 2;
      mesh.add(pivot);
      branch(pivot, length * (0.55 + random() * 0.2), radius * 0.6, depth - 1);
    }
  };
  branch(tree, 2.4, 0.22, 4);
  return tree;
}

/** A bat: tiny body and two flapping wings. */
function makeBat(material: THREE.Material): {
  bat: THREE.Group;
  left: THREE.Mesh;
  right: THREE.Mesh;
} {
  const bat = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), material);
  body.scale.set(1, 0.8, 1.6);
  bat.add(body);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(0.55, 0.18);
  wingShape.lineTo(0.48, 0.02);
  wingShape.lineTo(0.38, 0.08);
  wingShape.lineTo(0.3, -0.04);
  wingShape.lineTo(0.18, 0.04);
  wingShape.lineTo(0, -0.08);
  const wingGeometry = new THREE.ShapeGeometry(wingShape);
  wingGeometry.rotateX(-Math.PI / 2);
  const left = new THREE.Mesh(wingGeometry, material);
  const right = new THREE.Mesh(wingGeometry, material);
  right.scale.x = -1;
  bat.add(left, right);
  return { bat, left, right };
}

/** A rotting hand: forearm, palm, four fingers and a thumb. */
function makeHand(material: THREE.Material): {
  hand: THREE.Group;
  fingers: THREE.Object3D[];
} {
  const hand = new THREE.Group();
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.14, 1.3, 8),
    material
  );
  arm.position.y = 0.65;
  hand.add(arm);
  const palm = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.36, 0.12),
    material
  );
  palm.position.y = 1.45;
  hand.add(palm);
  const fingers: THREE.Object3D[] = [];
  [-0.12, -0.04, 0.04, 0.12].forEach((x, i) => {
    const pivot = new THREE.Object3D();
    pivot.position.set(x, 1.63, 0);
    const length = [0.28, 0.34, 0.32, 0.24][i]!;
    const finger = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.035, length, 6),
      material
    );
    finger.position.y = length / 2;
    pivot.add(finger);
    hand.add(pivot);
    fingers.push(pivot);
  });
  const thumb = new THREE.Object3D();
  thumb.position.set(-0.18, 1.4, 0.02);
  thumb.rotation.z = 0.9;
  const thumbMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.04, 0.22, 6),
    material
  );
  thumbMesh.position.y = 0.11;
  thumb.add(thumbMesh);
  hand.add(thumb);
  fingers.push(thumb);
  return { hand, fingers };
}

export function createGraveyardScene(
  canvas: HTMLCanvasElement,
  options: SceneOptions
): SceneHandle {
  const { reducedMotion, lowPower } = options;
  const random = seeded(1031);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !lowPower,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75)
  );
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color('#0c1416');
  scene.fog = new THREE.FogExp2(fogColor, 0.05);
  scene.background = fogColor;

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  const cameraBase = new THREE.Vector3(0, 2.3, 9);
  camera.position.copy(cameraBase);

  // ---------- Sky ----------
  const skyUniforms = {
    top: { value: new THREE.Color('#05080f') },
    horizon: { value: new THREE.Color('#163028') },
    flash: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      uniforms: skyUniforms,
      vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform float flash; varying vec3 vPos;
        void main() {
          float h = clamp(normalize(vPos).y * 1.8, 0.0, 1.0);
          vec3 color = mix(horizon, top, pow(h, 0.6));
          color += vec3(0.55, 0.62, 0.8) * flash * (1.0 - h * 0.5);
          gl_FragColor = vec4(color, 1.0);
        }`,
    })
  );
  scene.add(sky);

  // ---------- Moon ----------
  const moonPosition = new THREE.Vector3(30, 22, -48);
  const moonScreen = new THREE.Vector2(0.78, 0.74);
  const moonDirection = new THREE.Vector3();
  // A billboard, so the wide-angle lens never stretches it at the screen edge
  const moon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: moonTexture(),
      fog: false,
      depthWrite: false,
      // Keep the craters: tone mapping would wash the disc out to white
      toneMapped: false,
      color: '#d8e0ea',
    })
  );
  moon.scale.setScalar(5.4);
  moon.position.copy(moonPosition);
  scene.add(moon);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(220,230,245,0.55)', 'rgba(220,230,245,0)'),
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.position.copy(moonPosition);
  halo.scale.setScalar(16);
  scene.add(halo);

  const moonlight = new THREE.DirectionalLight('#a8bce0', 1.4);
  moonlight.position.copy(moonPosition);
  scene.add(moonlight);
  const hemisphere = new THREE.HemisphereLight('#41557a', '#0b1d12', 0.6);
  scene.add(hemisphere);

  // ---------- Ground ----------
  const groundGeometry = new THREE.PlaneGeometry(
    140,
    140,
    lowPower ? 60 : 120,
    lowPower ? 60 : 120
  );
  groundGeometry.rotateX(-Math.PI / 2);
  const groundPositions = groundGeometry.attributes.position!;
  const heightAt = (x: number, z: number) =>
    Math.sin(x * 0.18) * 0.35 +
    Math.cos(z * 0.22) * 0.3 +
    Math.sin((x + z) * 0.07) * 0.6 * Math.min(1, Math.abs(z) / 12);
  for (let i = 0; i < groundPositions.count; i++) {
    groundPositions.setY(
      i,
      heightAt(groundPositions.getX(i), groundPositions.getZ(i))
    );
  }
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(
    groundGeometry,
    new THREE.MeshStandardMaterial({ color: '#122019', roughness: 1 })
  );
  scene.add(ground);

  // ---------- Headstones and crosses ----------
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: '#69727d',
    roughness: 0.95,
    metalness: 0.02,
  });
  const darkStoneMaterial = new THREE.MeshStandardMaterial({
    color: '#4a535d',
    roughness: 1,
  });
  const stoneShapes = [
    headstoneGeometry(0.9, 1.4),
    headstoneGeometry(0.7, 1.1),
    headstoneGeometry(1.1, 1.7),
  ];
  const slab = new THREE.BoxGeometry(0.8, 1.0, 0.2);
  const crossVertical = new THREE.BoxGeometry(0.16, 1.5, 0.16);
  const crossHorizontal = new THREE.BoxGeometry(0.8, 0.16, 0.16);

  const stoneCount = lowPower ? 32 : 56;
  for (let i = 0; i < stoneCount; i++) {
    const row = Math.floor(i / 8);
    const z = 1.5 - row * 3.2 - random() * 1.6;
    let x = (random() - 0.5) * 26;
    // Keep a clear lane in front of the camera so the moon and ghosts show
    if (Math.abs(x) < 1.6 && z > -6) x += x < 0 ? -2 : 2;
    const kind = random();
    let stone: THREE.Object3D;
    if (kind < 0.62) {
      stone = new THREE.Mesh(
        stoneShapes[Math.floor(random() * stoneShapes.length)]!,
        random() < 0.5 ? stoneMaterial : darkStoneMaterial
      );
    } else if (kind < 0.82) {
      stone = new THREE.Mesh(slab, darkStoneMaterial);
      stone.position.y = 0.5;
    } else {
      stone = new THREE.Group();
      const v = new THREE.Mesh(crossVertical, stoneMaterial);
      v.position.y = 0.75;
      const h = new THREE.Mesh(crossHorizontal, stoneMaterial);
      h.position.y = 1.05;
      stone.add(v, h);
    }
    const holder = new THREE.Group();
    holder.add(stone);
    holder.position.set(x, heightAt(x, z) - 0.05, z);
    holder.rotation.set(
      (random() - 0.5) * 0.18,
      (random() - 0.5) * 0.6,
      (random() - 0.5) * 0.22
    );
    const scale = 0.8 + random() * 0.5;
    holder.scale.setScalar(scale);
    scene.add(holder);
  }

  // ---------- Dead trees ----------
  const barkMaterial = new THREE.MeshStandardMaterial({
    color: '#0f1110',
    roughness: 1,
  });
  [
    [-7.5, -7],
    [9, -12],
    [-13, -19],
    [15, -26],
  ].forEach(([x, z], i) => {
    if (lowPower && i > 1) return;
    const tree = deadTree(random, barkMaterial);
    tree.position.set(x!, heightAt(x!, z!) - 0.1, z!);
    tree.scale.setScalar(1.1 + random() * 0.5);
    scene.add(tree);
  });

  // ---------- Iron fence ----------
  const ironMaterial = new THREE.MeshStandardMaterial({
    color: '#16191c',
    roughness: 0.6,
    metalness: 0.6,
  });
  const postCount = 26;
  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6),
    ironMaterial,
    postCount
  );
  const spikes = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.07, 0.22, 6),
    ironMaterial,
    postCount
  );
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < postCount; i++) {
    const x = -16 + i * 0.42;
    const z = -2.5 - i * 0.05;
    const y = heightAt(x, z);
    matrix.makeTranslation(x, y + 0.75, z);
    posts.setMatrixAt(i, matrix);
    matrix.makeTranslation(x, y + 1.6, z);
    spikes.setMatrixAt(i, matrix);
  }
  scene.add(posts, spikes);
  [0.45, 1.25].forEach((height) => {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(postCount * 0.42, 0.05, 0.05),
      ironMaterial
    );
    rail.position.set(
      -16 + (postCount * 0.42) / 2,
      heightAt(-11, -3) + height,
      -3.15
    );
    rail.rotation.y = 0.12;
    scene.add(rail);
  });

  // ---------- Fog banks ----------
  const fogMap = fogTexture(random);
  const fogBanks: { sprite: THREE.Sprite; speed: number }[] = [];
  for (let i = 0; i < (lowPower ? 10 : 18); i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: fogMap,
        color: '#a9bdb6',
        transparent: true,
        opacity: 0.2 + random() * 0.18,
        depthWrite: false,
      })
    );
    sprite.position.set(
      (random() - 0.5) * 34,
      0.4 + random() * 1.1,
      4 - random() * 30
    );
    sprite.scale.set(10 + random() * 8, 3 + random() * 2, 1);
    scene.add(sprite);
    fogBanks.push({ sprite, speed: 0.15 + random() * 0.25 });
  }

  // ---------- Will-o'-the-wisps ----------
  const wispCount = lowPower ? 36 : 80;
  const wispPositions = new Float32Array(wispCount * 3);
  const wispSeeds = new Float32Array(wispCount);
  for (let i = 0; i < wispCount; i++) {
    wispPositions[i * 3] = (random() - 0.5) * 30;
    wispPositions[i * 3 + 1] = random() * 3.5;
    wispPositions[i * 3 + 2] = 5 - random() * 30;
    wispSeeds[i] = random() * 100;
  }
  const wispGeometry = new THREE.BufferGeometry();
  wispGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(wispPositions, 3)
  );
  const wispMaterial = new THREE.PointsMaterial({
    size: 0.22,
    map: glowTexture('rgba(190,255,220,1)', 'rgba(110,231,183,0)', 64),
    color: '#9df5c9',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const wisps = new THREE.Points(wispGeometry, wispMaterial);
  scene.add(wisps);

  // ---------- Ghosts ----------
  const { geometry: ghostBody, rest: ghostRest } = ghostGeometry();
  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: '#e8f0ff',
    emissive: '#7fa6ff',
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.78,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#05070a' });
  const ghostPaths = [
    { cx: -3.5, cz: -4, r: 3.2, speed: 0.32, y: 1.7, phase: 0 },
    { cx: 4.5, cz: -9, r: 4.5, speed: -0.22, y: 2.4, phase: 2 },
    { cx: -1, cz: -16, r: 6, speed: 0.16, y: 3, phase: 4 },
  ].slice(0, lowPower ? 2 : 3);
  const ghosts = ghostPaths.map((path, i) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(ghostBody.clone(), ghostMaterial);
    group.add(body);
    const eyeGeometry = new THREE.SphereGeometry(0.07, 8, 8);
    [-0.15, 0.15].forEach((x) => {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.scale.set(1, 1.5, 0.6);
      eye.position.set(x, 1.22, 0.42);
      group.add(eye);
    });
    const mouth = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      eyeMaterial
    );
    mouth.scale.set(0.9, 1.4, 0.5);
    mouth.position.set(0, 0.98, 0.44);
    group.add(mouth);
    if (!lowPower && i < 2) {
      const light = new THREE.PointLight('#9ec5ff', 2.2, 7, 1.6);
      light.position.y = 1;
      group.add(light);
    }
    group.scale.setScalar(0.9);
    scene.add(group);
    return { group, body, path };
  });

  // ---------- Bats ----------
  const batMaterial = new THREE.MeshBasicMaterial({
    color: '#030405',
    side: THREE.DoubleSide,
    fog: false,
  });
  const bats = Array.from({ length: lowPower ? 4 : 8 }, () => {
    const { bat, left, right } = makeBat(batMaterial);
    bat.scale.setScalar(1.4 + random());
    scene.add(bat);
    return {
      bat,
      left,
      right,
      radius: 5 + random() * 7,
      height: 9 + random() * 6,
      speed: (0.25 + random() * 0.3) * (random() < 0.5 ? -1 : 1),
      phase: random() * Math.PI * 2,
      flap: 14 + random() * 8,
    };
  });
  const batCenter = new THREE.Vector3(18, 0, -34);

  // ---------- Zombie hand ----------
  const fleshMaterial = new THREE.MeshStandardMaterial({
    color: '#6f8452',
    roughness: 0.9,
  });
  const { hand, fingers } = makeHand(fleshMaterial);
  const handSpot = new THREE.Vector3(3.1, heightAt(3.1, 3.4), 3.4);
  hand.position.set(handSpot.x, handSpot.y - 2.2, handSpot.z);
  hand.rotation.set(-0.15, -0.5, 0.12);
  hand.scale.setScalar(0.85);
  scene.add(hand);

  const dirtCount = 40;
  const dirtPositions = new Float32Array(dirtCount * 3);
  const dirtVelocity = new Float32Array(dirtCount * 3);
  const dirtGeometry = new THREE.BufferGeometry();
  dirtGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(dirtPositions, 3)
  );
  const dirt = new THREE.Points(
    dirtGeometry,
    new THREE.PointsMaterial({ color: '#3b2f22', size: 0.07 })
  );
  dirt.visible = false;
  scene.add(dirt);
  const burstDirt = () => {
    for (let i = 0; i < dirtCount; i++) {
      dirtPositions[i * 3] = handSpot.x + (random() - 0.5) * 0.3;
      dirtPositions[i * 3 + 1] = handSpot.y + 0.05;
      dirtPositions[i * 3 + 2] = handSpot.z + (random() - 0.5) * 0.3;
      dirtVelocity[i * 3] = (random() - 0.5) * 1.6;
      dirtVelocity[i * 3 + 1] = 1.5 + random() * 2.2;
      dirtVelocity[i * 3 + 2] = (random() - 0.5) * 1.6;
    }
    dirt.visible = true;
  };

  // ---------- Interaction ----------
  const pointer = new THREE.Vector2();
  const pointerSmooth = new THREE.Vector2();
  let scroll = 0;
  let scrollSmooth = 0;
  const lookTarget = new THREE.Vector3(0, 1.6, -4);

  // ---------- Lightning ----------
  let nextStrike = 6 + random() * 8;
  let strikeTime = -10;

  // Scene time in seconds (own timer: pauses cleanly while the tab is hidden)
  let elapsed = 0;
  let last = 0;
  let running = false;
  let handCycleStart = 4;
  let handBurst = false;

  const frame = () => {
    const now = performance.now() / 1000;
    const delta = running && last > 0 ? Math.min(now - last, 0.05) : 0;
    last = now;
    elapsed += delta;
    const t = elapsed;

    // Camera: drift, follow the pointer, walk forward as the page scrolls
    pointerSmooth.lerp(pointer, 0.04);
    scrollSmooth += (scroll - scrollSmooth) * 0.05;
    camera.position.set(
      cameraBase.x + pointerSmooth.x * 1.2 + Math.sin(t * 0.13) * 0.4,
      cameraBase.y +
        pointerSmooth.y * 0.5 -
        scrollSmooth * 0.9 +
        Math.sin(t * 0.21) * 0.08,
      cameraBase.z - scrollSmooth * 7
    );
    lookTarget.set(
      pointerSmooth.x * 0.8,
      1.6 + pointerSmooth.y * 0.3,
      -4 - scrollSmooth * 7
    );
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld();
    // Pin the moon to a fixed spot on screen, far behind the graves
    moonDirection
      .set(moonScreen.x, moonScreen.y, 0.5)
      .unproject(camera)
      .sub(camera.position)
      .normalize();
    moonPosition.copy(camera.position).addScaledVector(moonDirection, 55);
    moon.position.copy(moonPosition);
    halo.position.copy(moonPosition);
    moonlight.position.copy(moonPosition);
    batCenter.set(moonPosition.x * 0.6, 0, -34);

    // Fog drifts sideways and wraps around
    for (const bank of fogBanks) {
      bank.sprite.position.x += bank.speed * delta;
      if (bank.sprite.position.x > 20) bank.sprite.position.x = -20;
    }

    // Wisps rise, wobble and respawn
    for (let i = 0; i < wispCount; i++) {
      const s = wispSeeds[i]!;
      wispPositions[i * 3 + 1]! += delta * (0.12 + (s % 1) * 0.2);
      wispPositions[i * 3]! += Math.sin(t * 0.8 + s) * delta * 0.25;
      if (wispPositions[i * 3 + 1]! > 4) wispPositions[i * 3 + 1] = 0;
    }
    wispGeometry.attributes.position!.needsUpdate = true;
    wispMaterial.opacity = 0.75 + Math.sin(t * 3) * 0.2;

    // Ghosts float along their paths; skirts ripple
    for (const { group, body, path } of ghosts) {
      const a = t * path.speed + path.phase;
      group.position.set(
        path.cx + Math.cos(a) * path.r,
        path.y + Math.sin(t * 1.4 + path.phase) * 0.3,
        path.cz + Math.sin(a) * path.r
      );
      // Face the direction of travel
      group.rotation.y = -a + (path.speed > 0 ? Math.PI : 0);
      group.rotation.z = Math.sin(t * 1.1 + path.phase) * 0.12;
      const positions = body.geometry.attributes.position!;
      for (let v = 0; v < positions.count; v++) {
        const y = ghostRest[v * 3 + 1]!;
        if (y > 0.6) continue;
        const x = ghostRest[v * 3]!;
        const z = ghostRest[v * 3 + 2]!;
        const angle = Math.atan2(z, x);
        const wave =
          1 + Math.sin(angle * 7 + t * 4 + path.phase) * 0.12 * (1 - y / 0.6);
        positions.setXYZ(
          v,
          x * wave,
          y + Math.sin(angle * 5 - t * 3) * 0.04 * (1 - y / 0.6),
          z * wave
        );
      }
      positions.needsUpdate = true;
    }

    // Bats circle the moon side of the sky
    for (const b of bats) {
      const a = t * b.speed + b.phase;
      b.bat.position.set(
        batCenter.x + Math.cos(a) * b.radius,
        b.height + Math.sin(t * 1.7 + b.phase) * 0.6,
        batCenter.z + Math.sin(a) * b.radius * 0.6
      );
      b.bat.rotation.y = -a + (b.speed > 0 ? 0 : Math.PI);
      const flap = Math.sin(t * b.flap) * 0.9;
      b.left.rotation.z = flap;
      b.right.rotation.z = -flap;
    }

    // Zombie hand: rises, claws at the air, sinks, waits (18 s cycle)
    const cycle = (t - handCycleStart) % 18;
    let rise = 0;
    if (t > handCycleStart) {
      if (cycle < 1.6) rise = THREE.MathUtils.smoothstep(cycle, 0, 1.6);
      else if (cycle < 5.5) rise = 1;
      else if (cycle < 7.5)
        rise = 1 - THREE.MathUtils.smoothstep(cycle, 5.5, 7.5);
      if (cycle < 0.2 && !handBurst) {
        burstDirt();
        handBurst = true;
      }
      if (cycle > 1) handBurst = false;
    }
    hand.position.y = handSpot.y - 2.2 + rise * 2.0;
    hand.rotation.z = 0.12 + Math.sin(t * 2.3) * 0.12 * rise;
    fingers.forEach((finger, i) => {
      finger.rotation.x = (0.3 + Math.sin(t * 6 + i * 0.9) * 0.5) * rise;
    });
    if (dirt.visible) {
      let airborne = false;
      for (let i = 0; i < dirtCount; i++) {
        dirtVelocity[i * 3 + 1]! -= 9.8 * delta;
        dirtPositions[i * 3]! += dirtVelocity[i * 3]! * delta;
        dirtPositions[i * 3 + 1]! += dirtVelocity[i * 3 + 1]! * delta;
        dirtPositions[i * 3 + 2]! += dirtVelocity[i * 3 + 2]! * delta;
        if (dirtPositions[i * 3 + 1]! > handSpot.y - 0.2) airborne = true;
      }
      dirtGeometry.attributes.position!.needsUpdate = true;
      dirt.visible = airborne;
    }

    // Lightning: a double flash every 8-20 s (never more than 2 flashes a second)
    if (t > nextStrike) {
      strikeTime = t;
      nextStrike = t + 8 + random() * 12;
      options.onLightning?.();
    }
    const since = t - strikeTime;
    const flash = since < 0.12 ? 1 : since > 0.55 && since < 0.65 ? 0.6 : 0;
    skyUniforms.flash.value = flash * 0.5;
    hemisphere.intensity = 0.6 + flash * 2.2;

    renderer.render(scene, camera);
  };

  const handle: SceneHandle = {
    setPointer(x, y) {
      pointer.set(x, y);
    },
    setScroll(progress) {
      scroll = THREE.MathUtils.clamp(progress, 0, 1);
      if (reducedMotion) {
        scrollSmooth = scroll;
        frame();
      }
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      // Portrait screens: widen the view so the moon and graves still fit
      camera.fov = camera.aspect < 0.8 ? 72 : 55;
      // Moon: top-right on landscape screens, top corner above the title on portrait
      moonScreen.set(
        camera.aspect < 1 ? 0.74 : 0.78,
        camera.aspect < 1 ? 0.9 : 0.74
      );
      moon.scale.setScalar(camera.aspect < 1 ? 4.2 : 5.4);
      camera.updateProjectionMatrix();
      if (!running) frame();
    },
    setRunning(next) {
      if (reducedMotion || next === running) return;
      running = next;
      if (running) {
        last = 0;
        renderer.setAnimationLoop(frame);
      } else {
        renderer.setAnimationLoop(null);
      }
    },
    dispose() {
      renderer.setAnimationLoop(null);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [];
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
      });
      renderer.dispose();
    },
  };

  if (reducedMotion) {
    // A still scene: ghosts and the hand posed mid-haunt, no lightning
    handCycleStart = -3;
    elapsed = 3;
    frame();
  } else {
    handle.setRunning(true);
  }
  return handle;
}
