import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// --- START SIMPLEX NOISE ---
// Simplex Noise 算法实现, 用于给核心增加“质感”
// 来源: https://github.com/jwagner/simplex-noise.js
function createNoise3D() {
    const F3 = 1.0 / 3.0, G3 = 1.0 / 6.0;
    const p = new Uint8Array(256);
    for(let i=0; i<256; i++) p[i] = Math.random()*256;
    const perm = new Uint8Array(512);
    const permMod12 = new Uint8Array(512);
    for(let i=0; i<512; i++) {
        perm[i] = p[i & 255];
        permMod12[i] = perm[i] % 12;
    }
    return function(x, y, z) {
        let n0, n1, n2, n3;
        const s = (x + y + z) * F3;
        const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
        const t = (i + j + k) * G3;
        const X0 = i - t, Y0 = j - t, Z0 = k - t;
        const x0 = x - X0, y0 = y - Y0, z0 = z - Z0;
        let i1, j1, k1, i2, j2, k2;
        if(x0 >= y0) {
            if(y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
            else if(x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
            else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
        } else {
            if(y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
            else if(x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
            else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
        }
        const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
        const x2 = x0 - i2 + 2.0 * G3, y2 = y0 - j2 + 2.0 * G3, z2 = z0 - k2 + 2.0 * G3;
        const x3 = x0 - 1.0 + 3.0 * G3, y3 = y0 - 1.0 + 3.0 * G3, z3 = z0 - 1.0 + 3.0 * G3;
        const ii = i & 255, jj = j & 255, kk = k & 255;
        let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0; if(t0 < 0) n0 = 0.0; else { const g = permMod12[ii+perm[jj+perm[kk]]]; t0 *= t0; n0 = t0 * t0 * ( (g%2===0?x0:-x0) + (g%3===0?y0:-y0) + (g%4===0?z0:-z0) ); }
        let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1; if(t1 < 0) n1 = 0.0; else { const g = permMod12[ii+i1+perm[jj+j1+perm[kk+k1]]]; t1 *= t1; n1 = t1 * t1 * ( (g%2===0?x1:-x1) + (g%3===0?y1:-y1) + (g%4===0?z1:-z1) ); }
        let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2; if(t2 < 0) n2 = 0.0; else { const g = permMod12[ii+i2+perm[jj+j2+perm[kk+k2]]]; t2 *= t2; n2 = t2 * t2 * ( (g%2===0?x2:-x2) + (g%3===0?y2:-y2) + (g%4===0?z2:-z2) ); }
        let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3; if(t3 < 0) n3 = 0.0; else { const g = permMod12[ii+1+perm[jj+1+perm[kk+1]]]; t3 *= t3; n3 = t3 * t3 * ( (g%2===0?x3:-x3) + (g%3===0?y3:-y3) + (g%4===0?z3:-z3) ); }
        return 32.0 * (n0 + n1 + n2 + n3);
    };
}
const noise3D = createNoise3D();
// --- END SIMPLEX NOISE ---

// --- 全局变量和状态管理 ---
let scene, camera, renderer, controls, composer;
let saturn, coreMaterial, ringMaterial, pointLight;
let ringParticles = [], coreParticles = [];
let ringGeometry, coreGeometry;
// 存储手势相关的状态
const handState = {
    openness: 0,            // 手掌原始开合度 (0-1)
    smoothedOpenness: 0,    // 平滑处理后的开合度，用于动画
    targetRotationY: 0,     // 根据手的位置计算出的目标旋转速度
    smoothedRotationY: 0,   // 平滑处理后的旋转速度
};
const initialCameraZ = 20; // 相机初始Z轴位置

// --- 缓动函数, 用于营造 "过程感" ---
function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// --- MediaPipe 手势处理逻辑 ---
function onResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const wrist = landmarks[0];

        // --- 开合度/缩放逻辑 ---
        // 通过计算手腕到四个指尖的平均距离来判断开合程度
        const fingerTips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
        let totalDistance = 0;
        fingerTips.forEach(tip => totalDistance += Math.sqrt(Math.pow(wrist.x - tip.x, 2) + Math.pow(wrist.y - tip.y, 2)));
        const avgDistance = totalDistance / fingerTips.length;
        // 将物理距离映射到 0-1 的开合度值
        const minFistDist = 0.1, maxPalmDist = 0.35;
        handState.openness = THREE.MathUtils.clamp(THREE.MathUtils.inverseLerp(minFistDist, maxPalmDist, avgDistance), 0, 1);
        
        // --- 旋转逻辑 ---
        const handX = wrist.x; // 使用手腕的X轴位置 (0.0 to 1.0)
        const deadZone = 0.15; // 中心不触发旋转的区域大小 (左右各15%)
        const maxRotSpeed = 0.02; // 最大旋转速度
        if (handX > 0.5 + deadZone) {
            // 手在右侧
            const normalizedX = (handX - (0.5 + deadZone)) / (0.5 - deadZone);
            handState.targetRotationY = -THREE.MathUtils.clamp(normalizedX, 0, 1) * maxRotSpeed;
        } else if (handX < 0.5 - deadZone) {
            // 手在左侧
            const normalizedX = ((0.5 - deadZone) - handX) / (0.5 - deadZone);
            handState.targetRotationY = THREE.MathUtils.clamp(normalizedX, 0, 1) * maxRotSpeed;
        } else {
            // 手在中间死区
            handState.targetRotationY = 0;
        }

    } else {
        // 未检测到手，重置所有状态
        handState.openness = 0;
        handState.targetRotationY = 0;
    }
}

// --- 初始化函数 ---
function init() {
    // 场景
    scene = new THREE.Scene();
    // 相机
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = initialCameraZ;

    // 渲染器
    const canvas = document.querySelector('#bg');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000);
    renderer.toneMapping = THREE.ReinhardToneMapping; // 色调映射，使辉光效果更柔和

    // 轨道控制器 (用于鼠标交互)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // --- 后期处理: 简化并精调的辉光效果 ---
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.25; // 亮度阈值，只有高于此值的像素才会发光
    bloomPass.strength = 0.7;   // 辉光强度
    bloomPass.radius = 0.3;     // 辉光半径

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    
    // --- 场景对象 ---
    pointLight = new THREE.PointLight(0xffa95c, 1.0, 200);
    scene.add(pointLight);
    saturn = new THREE.Group();
    scene.add(saturn);
    
    // 粒子材质
    const particleTexture = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png');
    coreMaterial = new THREE.PointsMaterial({
        color: 0xff9933, size: 0.2, map: particleTexture, blending: THREE.AdditiveBlending,
        transparent: true, depthWrite: false
    });
    ringMaterial = new THREE.PointsMaterial({
        size: 0.06, map: particleTexture, blending: THREE.AdditiveBlending, transparent: true,
        depthWrite: false, vertexColors: true // 启用顶点颜色
    });

    // 创建核心 (带“质感”效果)
    coreGeometry = new THREE.BufferGeometry();
    const corePositions = [];
    for (let i = 0; i < 8000; i++) {
        const r = Math.pow(Math.random(), 0.7) * 2.5; // 让粒子更集中于中心
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        corePositions.push(x, y, z);
        coreParticles.push({ initialPos: new THREE.Vector3(x, y, z), noiseSpeed: Math.random() * 0.1 + 0.05 });
    }
    coreGeometry.setAttribute('position', new THREE.Float32BufferAttribute(corePositions, 3));
    const saturnCore = new THREE.Points(coreGeometry, coreMaterial);
    saturn.add(saturnCore);

    // 创建环带 (带颜色变化)
    ringGeometry = new THREE.BufferGeometry();
    const ringPositions = [], ringColors = [];
    const ringInnerRadius = 3.5, ringOuterRadius = 8, baseSpeed = 0.005;
    const ringColor1 = new THREE.Color(0xad9e87), ringColor2 = new THREE.Color(0x756b5c);

    for (let i = 0; i < 40000; i++) {
        const radius = Math.random() * (ringOuterRadius - ringInnerRadius) + ringInnerRadius;
        const angle = Math.random() * 2 * Math.PI;
        ringPositions.push(radius * Math.cos(angle), (Math.random() - 0.5) * 0.15, radius * Math.sin(angle));
        
        // 随机混合两种颜色，并存入颜色属性
        const color = new THREE.Color().lerpColors(ringColor1, ringColor2, Math.random());
        ringColors.push(color.r, color.g, color.b);

        // 开普勒定律简化: 越远的粒子速度越慢
        const speed = baseSpeed / Math.pow(radius, 1.5);
        ringParticles.push({ radius, angle, speed, initialY: (Math.random() - 0.5) * 0.15 });
    }
    ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ringPositions, 3));
    ringGeometry.setAttribute('color', new THREE.Float32BufferAttribute(ringColors, 3));
    const saturnRings = new THREE.Points(ringGeometry, ringMaterial);
    saturnRings.rotation.x = -0.4 * Math.PI;
    saturn.add(saturnRings);

    // --- 启动 MediaPipe ---
    const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    hands.onResults(onResults);
    const videoElement = document.getElementById('input_video');
    const cameraHelper = new Camera(videoElement, { onFrame: async () => await hands.send({ image: videoElement }), width: 1280, height: 720 });
    cameraHelper.start();

    // --- UI 事件监听 ---
    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); } 
        else { if (document.exitFullscreen) { document.exitFullscreen(); } }
    });
    window.addEventListener('resize', onWindowResize, false);
    
    animate();
}

// --- 窗口大小调整处理 ---
function onWindowResize() {
    const width = window.innerWidth, height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
}

// --- 动画循环 ---
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // 平滑处理手势输入值
    handState.smoothedOpenness += (handState.openness - handState.smoothedOpenness) * 0.05;
    const easedS = easeInOutCubic(handState.smoothedOpenness); // 应用缓动函数，使动画更自然
    
    // --- 1. “过程感” - 动画缩放与相机推近 ---
    const currentScale = THREE.MathUtils.lerp(0.5, 1.5, easedS);
    saturn.scale.set(currentScale, currentScale, currentScale);
    camera.position.z = THREE.MathUtils.lerp(initialCameraZ, initialCameraZ - 10, easedS);

    // --- 2. 控制光照强度 ---
    pointLight.intensity = THREE.MathUtils.lerp(0.5, 1.5, easedS);
    
    // --- 3. 核心“质感”动画 ---
    const corePosAttr = coreGeometry.attributes.position;
    for (let i = 0; i < coreParticles.length; i++) {
        const p = coreParticles[i];
        // 使用 Simplex Noise 创建缓慢流动的效果
        const noise = noise3D(
            p.initialPos.x * 0.5 + time * p.noiseSpeed,
            p.initialPos.y * 0.5 + time * p.noiseSpeed,
            p.initialPos.z * 0.5 + time * p.noiseSpeed
        );
        corePosAttr.array[i * 3] = p.initialPos.x + noise * 0.1;
        corePosAttr.array[i * 3 + 1] = p.initialPos.y + noise * 0.1;
        corePosAttr.array[i * 3 + 2] = p.initialPos.z + noise * 0.1;
    }
    corePosAttr.needsUpdate = true;
    
    // --- 4. 环带动画与混沌效果 ---
    const ringPosAttr = ringGeometry.attributes.position;
    const chaosFactor = (easedS > 0.9) ? THREE.MathUtils.clamp(THREE.MathUtils.inverseLerp(0.9, 1.0, easedS), 0, 1) : 0;
    const noiseStrength = 5.0;

    for (let i = 0; i < ringParticles.length; i++) {
        const p = ringParticles[i];
        p.angle += p.speed * 60 * delta; // 帧率无关的动画速度
        const i3 = i * 3;
        ringPosAttr.array[i3] = p.radius * Math.cos(p.angle);
        ringPosAttr.array[i3 + 1] = p.initialY;
        ringPosAttr.array[i3 + 2] = p.radius * Math.sin(p.angle);

        // 当手完全张开时，激活混沌效果
        if (chaosFactor > 0) {
            ringPosAttr.array[i3] += (Math.random() - 0.5) * noiseStrength * chaosFactor;
            ringPosAttr.array[i3 + 1] += (Math.random() - 0.5) * noiseStrength * chaosFactor;
            ringPosAttr.array[i3 + 2] += (Math.random() - 0.5) * noiseStrength * chaosFactor;
        }
    }
    ringPosAttr.needsUpdate = true;
    
    // --- 5. 手势旋转 ---
    handState.smoothedRotationY += (handState.targetRotationY - handState.smoothedRotationY) * 0.1;
    saturn.rotation.y += handState.smoothedRotationY;
    
    // 更新控制器并渲染最终画面
    controls.update();
    composer.render();
}

// --- 启动 ---
init();
