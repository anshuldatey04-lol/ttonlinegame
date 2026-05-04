/* ══════════════════════════════════════════════════════════════════════════
   renderer.js — Three.js Scene, Camera, Materials, Meshes
   ══════════════════════════════════════════════════════════════════════════ */

window.Renderer = (function () {

  let scene, camera, renderer, clock;
  let tableMesh, netMesh, ballMesh, floorMesh;
  let racketMeshes    = { red: null, blue: null };
  let playerModels    = { red: null, blue: null };
  let cameraShakeAmt  = 0;
  let splitMode       = false;
  let cameras         = { left: null, right: null };

  // Trail particles
  let trailParticles  = [];
  const TRAIL_MAX     = 18;

  const C = PhysicsEngine.getConstants();

  // ── Materials ────────────────────────────────────────────────────────────
  const MAT = {};

  function _buildMaterials() {
    MAT.table = new THREE.MeshStandardMaterial({
      color: 0x1a6fae, roughness: 0.35, metalness: 0.1
    });
    MAT.tableEdge = new THREE.MeshStandardMaterial({
      color: 0x8B5E3C, roughness: 0.7
    });
    MAT.net = new THREE.MeshStandardMaterial({
      color: 0xffffff, wireframe: true, transparent: true, opacity: 0.8
    });
    MAT.ball = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.3, metalness: 0.05,
      emissive: 0xffffff, emissiveIntensity: 0.15
    });
    MAT.floor = new THREE.MeshStandardMaterial({
      color: 0x6b4423, roughness: 0.9
    });
    MAT.racketRed = new THREE.MeshStandardMaterial({
      color: 0xe63946, roughness: 0.4, metalness: 0.2,
      emissive: 0xe63946, emissiveIntensity: 0.1
    });
    MAT.racketBlue = new THREE.MeshStandardMaterial({
      color: 0x1d8cf8, roughness: 0.4, metalness: 0.2,
      emissive: 0x1d8cf8, emissiveIntensity: 0.1
    });
    MAT.racketHandle = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.8 });
    MAT.body = { red: null, blue: null };
  }

  // ── Scene Builder ────────────────────────────────────────────────────────
  function init(canvas) {
    clock    = new THREE.Clock();
    scene    = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.fog = new THREE.Fog(0x0d1117, 8, 20);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    _buildMaterials();
    _buildScene();
    _buildCamera();
    _buildLights();
    _buildTable();
    _buildNet();
    _buildBall();
    _buildRackets();
    _buildPlayers();
    _buildEnvironment();

    window.addEventListener('resize', _resize);
    _resize();

    return { scene, camera, renderer };
  }

  function _buildCamera() {
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);
    // First-person: positioned at player (red) end, looking toward blue
    camera.position.set(0, C.tableHeight + 0.35, C.tableHalfLen + 0.45);
    camera.lookAt(0, C.tableHeight + 0.08, 0);

    // Split-screen cameras
    cameras.left  = camera.clone();
    cameras.right = camera.clone();
    cameras.right.position.set(0, C.tableHeight + 0.35, -(C.tableHalfLen + 0.45));
    cameras.right.lookAt(0, C.tableHeight + 0.08, 0);
  }

  function _buildLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);

    // Ceiling spotlights
    const spots = [
      { x: -1, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 0 }
    ];
    spots.forEach(({ x, z }) => {
      const spot = new THREE.SpotLight(0xfff5e0, 1.8, 12, Math.PI / 5, 0.5);
      spot.position.set(x, 4.5, z);
      spot.target.position.set(x, 0, z);
      spot.castShadow = true;
      spot.shadow.mapSize.setScalar(1024);
      scene.add(spot, spot.target);

      // Visible bulb
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff5c0 })
      );
      bulb.position.copy(spot.position);
      scene.add(bulb);
    });

    // Rim lights for color ambiance
    const rimR = new THREE.PointLight(0xe63946, 0.6, 5);
    rimR.position.set(-2, 2, C.tableHalfLen);
    scene.add(rimR);
    const rimB = new THREE.PointLight(0x1d8cf8, 0.6, 5);
    rimB.position.set(2, 2, -C.tableHalfLen);
    scene.add(rimB);
  }

  function _buildScene() {
    // nothing extra needed here
  }

  function _buildTable() {
    const tLen = C.tableHalfLen * 2;
    const tWid = C.tableHalfWid * 2;

    // Table surface
    const surf = new THREE.Mesh(
      new THREE.BoxGeometry(tWid, 0.04, tLen),
      MAT.table
    );
    surf.position.y = C.tableHeight - 0.02;
    surf.receiveShadow = true;
    scene.add(surf);
    tableMesh = surf;

    // Table lines (white markings)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    // Center line
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.001, tLen), lineMat);
    cl.position.set(0, C.tableHeight + 0.001, 0);
    scene.add(cl);
    // Side lines
    [-tWid / 2, tWid / 2].forEach(x => {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.001, tLen), lineMat);
      sl.position.set(x, C.tableHeight + 0.001, 0);
      scene.add(sl);
    });
    // End lines
    [-C.tableHalfLen, C.tableHalfLen].forEach(z => {
      const el = new THREE.Mesh(new THREE.BoxGeometry(tWid, 0.001, 0.01), lineMat);
      el.position.set(0, C.tableHeight + 0.001, z);
      scene.add(el);
    });

    // Table edges (wood)
    const edgeMat = MAT.tableEdge;
    const edgeH   = 0.08;
    // Long edges
    [-tWid / 2 - 0.02, tWid / 2 + 0.02].forEach(x => {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.04, edgeH, tLen + 0.04), edgeMat);
      e.position.set(x, C.tableHeight - edgeH / 2, 0);
      scene.add(e);
    });
    // Short edges
    [-C.tableHalfLen - 0.02, C.tableHalfLen + 0.02].forEach(z => {
      const e = new THREE.Mesh(new THREE.BoxGeometry(tWid + 0.04, edgeH, 0.04), edgeMat);
      e.position.set(0, C.tableHeight - edgeH / 2, z);
      scene.add(e);
    });

    // Table legs
    const legGeo  = new THREE.BoxGeometry(0.07, C.tableHeight - 0.06, 0.07);
    const legMat  = MAT.tableEdge;
    const legPos  = [
      [-tWid / 2 + 0.05, C.tableHalfLen - 0.05],
      [ tWid / 2 - 0.05, C.tableHalfLen - 0.05],
      [-tWid / 2 + 0.05, -(C.tableHalfLen - 0.05)],
      [ tWid / 2 - 0.05, -(C.tableHalfLen - 0.05)]
    ];
    legPos.forEach(([x, z]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, (C.tableHeight - 0.06) / 2, z);
      leg.castShadow = true;
      scene.add(leg);
    });
    // _buildNet();
  }

    function _buildNet() {
    // Net is removed as per user request
    return;
    // Net posts
    const postGeo = new THREE.CylinderGeometry(0.015, 0.015, C.netHeight + 0.02, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
    [-C.tableHalfWid - 0.02, C.tableHalfWid + 0.02].forEach(x => {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(x, C.tableHeight + (C.netHeight + 0.02) / 2, 0);
      scene.add(p);
    });

    // Net mesh
    const netGeo = new THREE.PlaneGeometry(C.tableHalfWid * 2 + 0.04, C.netHeight, 20, 10);
    netMesh = new THREE.Mesh(netGeo, MAT.net);
    netMesh.rotation.y = Math.PI / 2;
    netMesh.rotation.x = 0;
    netMesh.position.set(0, C.tableHeight + C.netHeight / 2, 0);
    scene.add(netMesh);

    // Net bottom bar
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(C.tableHalfWid * 2 + 0.04, 0.01, 0.01),
      postMat
    );
    bar.position.set(0, C.tableHeight + 0.005, 0);
    scene.add(bar);
  }

  function _buildBall() {
    ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(C.ballRadius, 16, 16),
      MAT.ball
    );
    ballMesh.castShadow = true;
    scene.add(ballMesh);

    // Ball glow
    const glow = new THREE.PointLight(0xffffff, 0.3, 0.4);
    ballMesh.add(glow);
  }

  function _buildRackets() {
    function makeRacket(side) {
      const group = new THREE.Group();
      // Blade
      const blade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.018, 32),
        side === 'red' ? MAT.racketRed : MAT.racketBlue
      );
      blade.rotation.x = Math.PI / 2;
      group.add(blade);
      // Handle
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.012, 0.13, 12),
        MAT.racketHandle
      );
      handle.position.y = -0.11;
      group.add(handle);
      // Rubber texture detail
      const rubber = new THREE.Mesh(
        new THREE.CylinderGeometry(0.089, 0.089, 0.004, 32),
        new THREE.MeshStandardMaterial({
          color: side === 'red' ? 0xcc1122 : 0x0044cc,
          roughness: 0.9, side: THREE.FrontSide
        })
      );
      rubber.rotation.x = Math.PI / 2;
      rubber.position.z = 0.009;
      group.add(rubber);

      group.castShadow = true;
      scene.add(group);
      return group;
    }

    racketMeshes.red  = makeRacket('red');
    racketMeshes.blue = makeRacket('blue');
  }

  function _buildPlayers() {
    // Simplified humanoid figures
    function makePlayer(color) {
      const group = new THREE.Group();
      const mat   = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
      const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5cba7, roughness: 0.9 });

      // Torso
      group.add(_box(mat, 0.24, 0.32, 0.14, 0, 0.32, 0));
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), skinMat);
      head.position.set(0, 0.58, 0);
      group.add(head);
      // Shorts
      group.add(_box(new THREE.MeshStandardMaterial({ color: color, roughness: 0.9 }), 0.22, 0.2, 0.13, 0, 0.1, 0));
      // Legs
      group.add(_box(skinMat, 0.08, 0.28, 0.08, -0.07, -0.14, 0));
      group.add(_box(skinMat, 0.08, 0.28, 0.08,  0.07, -0.14, 0));
      // Shoes
      group.add(_box(new THREE.MeshStandardMaterial({ color: 0x222222 }), 0.1, 0.05, 0.14, -0.07, -0.3, 0.02));
      group.add(_box(new THREE.MeshStandardMaterial({ color: 0x222222 }), 0.1, 0.05, 0.14,  0.07, -0.3, 0.02));
      // Arms
      group.add(_box(skinMat, 0.07, 0.25, 0.07, -0.18, 0.22, 0));
      group.add(_box(skinMat, 0.07, 0.25, 0.07,  0.18, 0.22, 0));

      scene.add(group);
      return group;
    }

    playerModels.red  = makePlayer(0xcc0000);
    playerModels.blue = makePlayer(0x0055cc);
  }

  function _box(mat, w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  }

  function _buildEnvironment() {
    // Floor (wood)
    floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      MAT.floor
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.95 });
    // Back wall (blue side)
    const bw = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat);
    bw.position.set(0, 3, -6); scene.add(bw);
    // Side walls
    const sw1 = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat);
    sw1.rotation.y = Math.PI / 2; sw1.position.set(-6, 3, 0); scene.add(sw1);
    const sw2 = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat);
    sw2.rotation.y = -Math.PI / 2; sw2.position.set(6, 3, 0); scene.add(sw2);
    // Ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 5.5, 0); scene.add(ceil);

    // Audience bleachers (simple geometry)
    const bleacherMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    for (let row = 0; row < 4; row++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 0.8), bleacherMat);
      bl.position.set(0, 0.15 + row * 0.4, -5.2 - row * 0.6);
      scene.add(bl);
    }

    // Banner strips
    _addBanner(-2, 3.5, -5.9, 0xe63946, 'RED');
    _addBanner( 2, 3.5, -5.9, 0x1d8cf8, 'BLUE');
  }

  function _addBanner(x, y, z, color, text) {
    const canvas  = document.createElement('canvas');
    canvas.width  = 256; canvas.height = 96;
    const ctx     = canvas.getContext('2d');
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 52px Orbitron, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 68);
    const tex  = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.45),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    mesh.position.set(x, y, z);
    scene.add(mesh);
  }

  function _buildTrailParticles() {
    const geo = new THREE.SphereGeometry(0.008, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xaaeeff, transparent: true, opacity: 0.7 });
    for (let i = 0; i < TRAIL_MAX; i++) {
      const p = new THREE.Mesh(geo, mat.clone());
      p.visible = false;
      p.userData.life = 0;
      scene.add(p);
      trailParticles.push(p);
    }
  }

  let _trailIdx = 0;
  function _spawnTrail(x, y, z) {
    const p = trailParticles[_trailIdx % TRAIL_MAX];
    p.position.set(x, y, z);
    p.material.opacity = 0.6;
    p.visible = true;
    p.userData.life = 1;
    _trailIdx++;
  }

  // ── Update ────────────────────────────────────────────────────────────────
  function update(physState, localSide) {
    const dt = clock.getDelta();

    if (!physState) return;
    const { ball, rackets } = physState;

    // Ball
    if (ball) {
      ballMesh.position.set(ball.x, ball.y, ball.z);
      ballMesh.rotation.x += ball.vz * dt * 4;
      ballMesh.rotation.z += ball.vx * dt * 4;
    }

    // Rackets
    for (const [side, rk] of Object.entries(rackets || {})) {
      if (!rk) continue;
      const mesh = racketMeshes[side];
      if (!mesh) continue;
      const zSign = side === 'red' ? 1 : -1;
      mesh.position.set(rk.x, rk.y || (C.tableHeight + 0.06), zSign * (C.tableHalfLen - 0.05));
      
      if (rk.rotation) {
        // Map Euler angles from phone (alpha, beta, gamma) to Three.js
        // Phone: alpha (z), beta (x), gamma (y)
        // Three.js: x, y, z
        const euler = new THREE.Euler(
          THREE.MathUtils.degToRad(rk.rotation.x), // beta (Pitch)
          THREE.MathUtils.degToRad(rk.rotation.z), // alpha (Yaw)
          THREE.MathUtils.degToRad(rk.rotation.y), // gamma (Roll)
          'YXZ'
        );
        mesh.quaternion.setFromEuler(euler);
        
        // Adjust for side
        if (side === 'blue') {
          mesh.rotateY(Math.PI);
        }
      } else {
        mesh.rotation.y = side === 'red' ? 0 : Math.PI;
        // Slight tilt on x based on velocity
        mesh.rotation.z = -rk.vx * 3;
      }
    }

    // Players
    for (const [side, model] of Object.entries(playerModels)) {
      if (!model) continue;
      const rk     = rackets[side];
      const zSign  = side === 'red' ? 1 : -1;
      const baseZ  = zSign * (C.tableHalfLen + 0.35);
      model.position.set(rk ? rk.x * 0.5 : 0, 0, baseZ);
      model.rotation.y = side === 'red' ? Math.PI : 0;
    }

    // Camera shake
    if (cameraShakeAmt > 0) {
      camera.position.x += (Math.random() - 0.5) * cameraShakeAmt;
      camera.position.y += (Math.random() - 0.5) * cameraShakeAmt * 0.5;
      cameraShakeAmt    *= 0.85;
      if (cameraShakeAmt < 0.0005) cameraShakeAmt = 0;
    }

    // Subtle head bob
    const t = Date.now() * 0.001;
    camera.position.y = C.tableHeight + 0.35 + Math.sin(t * 1.2) * 0.003;
  }

  function triggerShake(intensity = 0.015) {
    cameraShakeAmt = intensity;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render(splitMode, physState, localSide) {
    update(physState, localSide);

    if (!splitMode) {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
      renderer.render(scene, camera);
    } else {
      const w = renderer.domElement.width;
      const h = renderer.domElement.height;
      // Left (red)
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, w / 2, h);
      renderer.setScissor(0, 0, w / 2, h);
      renderer.render(scene, cameras.left);
      // Right (blue)
      renderer.setViewport(w / 2, 0, w / 2, h);
      renderer.setScissor(w / 2, 0, w / 2, h);
      cameras.right.position.set(0, C.tableHeight + 0.35, -(C.tableHalfLen + 0.45));
      cameras.right.lookAt(0, C.tableHeight + 0.08, 0);
      renderer.render(scene, cameras.right);
      renderer.setScissorTest(false);
    }
  }

  function _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    cameras.left.aspect  = (w / 2) / h;
    cameras.left.updateProjectionMatrix();
    cameras.right.aspect = (w / 2) / h;
    cameras.right.updateProjectionMatrix();
  }

  function setSplitMode(on) { splitMode = on; }
  function getScene()    { return scene; }
  function getCamera()   { return camera; }
  function getRenderer() { return renderer; }
  function getRacketMeshes() { return racketMeshes; }

  return {
    init, render, triggerShake,
    setSplitMode, getScene, getCamera, getRenderer, getRacketMeshes
  };
})();
