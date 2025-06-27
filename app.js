import * as THREE from './libs/three/three.module.js';
import { GLTFLoader } from './libs/three/jsm/GLTFLoader.js';
import { DRACOLoader } from './libs/three/jsm/DRACOLoader.js';
import { RGBELoader } from './libs/three/jsm/RGBELoader.js';
import { Stats } from './libs/stats.module.js';
import { LoadingBar } from './libs/LoadingBar.js';
import { VRButton } from './libs/VRButton.js';
import { CanvasUI } from './libs/CanvasUI.js';
import { GazeController } from './libs/GazeController.js';
import { XRControllerModelFactory } from './libs/three/jsm/XRControllerModelFactory.js';

class App {
	constructor() {
		const container = document.createElement('div');
		document.body.appendChild(container);

		this.assetsPath = './assets/';

		this.listener = new THREE.AudioListener();
		this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 500);
		this.camera.position.set(0, 1.6, 0);
		this.camera.add(this.listener);

		this.dolly = new THREE.Object3D();
		this.dolly.position.set(0, 0, 10);
		this.dolly.add(this.camera);
		this.dummyCam = new THREE.Object3D();
		this.camera.add(this.dummyCam);

		this.scene = new THREE.Scene();
		this.scene.add(this.dolly);

		const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
		this.scene.add(ambient);

		this.spotLight = new THREE.SpotLight(0xffffff, 0.5);
		this.spotLight.position.set(5, 10, 5);
		this.spotLight.angle = Math.PI / 6;
		this.spotLight.penumbra = 0.3;
		this.spotLight.visible = true;
		this.scene.add(this.spotLight);

		this.ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
		this.scene.add(this.ambientLight);

		window.addEventListener('keydown', (e) => {
			if (e.key === 'l' || e.key === 'L') this.toggleLight();
		});

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.outputEncoding = THREE.sRGBEncoding;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 0.8;
		container.appendChild(this.renderer.domElement);

		this.renderer.domElement.setAttribute('tabindex', '0');
		this.renderer.domElement.style.outline = 'none';
		this.renderer.domElement.focus();

		this.setEnvironment();
		this.loadAudio();

		window.addEventListener('resize', this.resize.bind(this));

		this.clock = new THREE.Clock();
		this.up = new THREE.Vector3(0, 1, 0);
		this.origin = new THREE.Vector3();
		this.workingVec3 = new THREE.Vector3();
		this.workingQuaternion = new THREE.Quaternion();
		this.raycaster = new THREE.Raycaster();

		this.stats = new Stats();
		container.appendChild(this.stats.dom);

		this.loadingBar = new LoadingBar();

		this.loadCollege();
		this.immersive = false;

		fetch('./college.json')
			.then(response => response.json())
			.then(obj => {
				this.boardShown = '';
				this.boardData = obj;
			});

		window.addEventListener('click', () => {
			if (this.ambientSound?.context.state !== 'running') {
				this.ambientSound.context.resume();
				this.ambientSound.play();
			}
		}, { once: true });
	}

	toggleLight() {
		this.spotLight.visible = !this.spotLight.visible;
		console.log(`Light is now ${this.spotLight.visible ? 'ON' : 'OFF'}`);
	}

	loadAudio() {
		const audioLoader = new THREE.AudioLoader();

		this.ambientSound = new THREE.Audio(this.listener);
		audioLoader.load('./assets/audio/Aimbient.mp3', (buffer) => {
			this.ambientSound.setBuffer(buffer);
			this.ambientSound.setLoop(true);
			this.ambientSound.setVolume(0.3);
		});

		this.footstepSound = new THREE.Audio(this.listener);
		audioLoader.load('./assets/audio/footstep.mp3', (buffer) => {
			this.footstepSound.setBuffer(buffer);
			this.footstepSound.setLoop(false);
			this.footstepSound.setVolume(0.5);
		});
	}

	setEnvironment() {
		const loader = new RGBELoader().setDataType(THREE.UnsignedByteType);
		const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
		pmremGenerator.compileEquirectangularShader();

		loader.load('./assets/hdr/cobblestone_street_night.hdr', (texture) => {
			const envMap = pmremGenerator.fromEquirectangular(texture).texture;
			this.scene.environment = envMap;

			this.scene.traverse((child) => {
				if (child.isMesh && child.material && child.material.envMapIntensity !== undefined) {
					child.material.envMapIntensity = 0.4;
				}
			});

			pmremGenerator.dispose();
		}, undefined, (err) => {
			console.error('An error occurred setting the environment');
		});
	}

	resize() {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
	}

	loadCollege() {
		const loader = new GLTFLoader().setPath(this.assetsPath);
		const dracoLoader = new DRACOLoader();
		dracoLoader.setDecoderPath('./libs/three/js/draco/');
		loader.setDRACOLoader(dracoLoader);

		loader.load('college.glb', (gltf) => {
			const college = gltf.scene.children[0];
			this.scene.add(college);

			college.traverse((child) => {
				if (child.isMesh) {
					if (child.name.includes("Wall") || child.material.name.includes("Wall")) {
						child.material = new THREE.MeshStandardMaterial({ color: 0xadd8e6 });
					}
					if (child.name.includes("Floor") || child.material.name.includes("Floor")) {
						child.material = new THREE.MeshStandardMaterial({ color: 0xdddddd });
					}
					if (child.name.includes("Stair") || child.material.name.includes("Stair")) {
						child.material = new THREE.MeshStandardMaterial({ color: 0xcd853f });
					}
					if (child.name.indexOf("PROXY") !== -1) {
						child.material.visible = false;
						this.proxy = child;
					} else if (child.material.name.indexOf('Glass') !== -1) {
						child.material.opacity = 0.1;
						child.material.transparent = true;
					} else if (child.material.name.indexOf("SkyBox") !== -1) {
						const mat1 = child.material;
						const mat2 = new THREE.MeshBasicMaterial({ map: mat1.map });
						child.material = mat2;
						mat1.dispose();
					}
				}
			});

			const door1 = college.getObjectByName("LobbyShop_Door__1_");
			const door2 = college.getObjectByName("LobbyShop_Door__2_");
			const pos = door1.position.clone().sub(door2.position).multiplyScalar(0.5).add(door2.position);
			const obj = new THREE.Object3D();
			obj.name = "LobbyShop";
			obj.position.copy(pos);
			college.add(obj);

			this.loadingBar.visible = false;
			this.setupXR();
		});
	}

	setupXR() {
		this.renderer.xr.enabled = true;
		new VRButton(this.renderer);

		const timeoutId = setTimeout(() => {
			this.useGaze = true;
			this.gazeController = new GazeController(this.scene, this.dummyCam);
		}, 2000);

		this.controllers = this.buildControllers(this.dolly);

		this.controllers.forEach(controller => {
			controller.addEventListener('selectstart', () => controller.userData.selectPressed = true);
			controller.addEventListener('selectend', () => controller.userData.selectPressed = false);
			controller.addEventListener('connected', () => clearTimeout(timeoutId));
		});

		const config = {
			panelSize: { height: 0.5 },
			height: 256,
			name: { fontSize: 50, height: 70 },
			info: { position: { top: 70, backgroundColor: "#ccc", fontColor: "#000" } }
		};
		const content = { name: "name", info: "info" };
		this.ui = new CanvasUI(content, config);
		this.scene.add(this.ui.mesh);

		this.renderer.setAnimationLoop(this.render.bind(this));
	}

	buildControllers(parent = this.scene) {
		const controllerModelFactory = new XRControllerModelFactory();
		const geometry = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(0, 0, 0),
			new THREE.Vector3(0, 0, -1)
		]);
		const line = new THREE.Line(geometry);
		line.scale.z = 0;

		const controllers = [];

		for (let i = 0; i <= 1; i++) {
			const controller = this.renderer.xr.getController(i);
			controller.add(line.clone());
			controller.userData.selectPressed = false;
			parent.add(controller);
			controllers.push(controller);

			const grip = this.renderer.xr.getControllerGrip(i);
			grip.add(controllerModelFactory.createControllerModel(grip));
			parent.add(grip);
		}
		return controllers;
	}

	moveDolly(dt) {
		if (!this.proxy) return;

		const wallLimit = 1.3;
		const speed = 2;
		let pos = this.dolly.position.clone();
		pos.y += 1;

		const quaternion = this.dolly.quaternion.clone();
		this.dolly.quaternion.copy(this.dummyCam.getWorldQuaternion(this.workingQuaternion));

		let dir = new THREE.Vector3();
		this.dolly.getWorldDirection(dir);
		dir.negate();
		this.raycaster.set(pos, dir);

		let blocked = false;
		let intersect = this.raycaster.intersectObject(this.proxy);
		if (intersect.length > 0 && intersect[0].distance < wallLimit) blocked = true;

		if (!blocked) {
			this.dolly.translateZ(-dt * speed);
			pos = this.dolly.getWorldPosition(this.origin);
			if (this.footstepSound && !this.footstepSound.isPlaying) this.footstepSound.play();
		}

		dir.set(-1, 0, 0).applyMatrix4(this.dolly.matrix).normalize();
		this.raycaster.set(pos, dir);
		intersect = this.raycaster.intersectObject(this.proxy);
		if (intersect.length > 0 && intersect[0].distance < wallLimit)
			this.dolly.translateX(wallLimit - intersect[0].distance);

		dir.set(1, 0, 0).applyMatrix4(this.dolly.matrix).normalize();
		this.raycaster.set(pos, dir);
		intersect = this.raycaster.intersectObject(this.proxy);
		if (intersect.length > 0 && intersect[0].distance < wallLimit)
			this.dolly.translateX(intersect[0].distance - wallLimit);

		dir.set(0, -1, 0);
		pos.y += 1.5;
		this.raycaster.set(pos, dir);
		intersect = this.raycaster.intersectObject(this.proxy);
		if (intersect.length > 0) this.dolly.position.copy(intersect[0].point);

		this.dolly.quaternion.copy(quaternion);
	}

	get selectPressed() {
		return this.controllers?.some(ctrl => ctrl.userData.selectPressed);
	}

	showInfoboard(name, info, pos) {
		if (!this.ui) return;
		this.ui.position.copy(pos).add(this.workingVec3.set(0, 1.3, 0));
		const camPos = this.dummyCam.getWorldPosition(this.workingVec3);
		this.ui.updateElement('name', info.name);
		this.ui.updateElement('info', info.info);
		this.ui.update();
		this.ui.lookAt(camPos);
		this.ui.visible = true;
		this.boardShown = name;
	}

	render(timestamp, frame) {
		const dt = this.clock.getDelta();
		if (this.renderer.xr.isPresenting) {
			let moveGaze = false;
			if (this.useGaze && this.gazeController) {
				this.gazeController.update();
				moveGaze = this.gazeController.mode === GazeController.Modes.MOVE;
			}
			if (this.selectPressed || moveGaze) {
				this.moveDolly(dt);
				if (this.boardData) {
					const dollyPos = this.dolly.getWorldPosition(new THREE.Vector3());
					let boardFound = false;
					for (const [name, info] of Object.entries(this.boardData)) {
						const obj = this.scene.getObjectByName(name);
						if (obj) {
							const pos = obj.getWorldPosition(new THREE.Vector3());
							if (dollyPos.distanceTo(pos) < 3) {
								boardFound = true;
								if (this.boardShown !== name) this.showInfoboard(name, info, pos);
							}
						}
					}
					if (!boardFound) {
						this.boardShown = '';
						this.ui.visible = false;
					}
				}
			}
		}
		if (this.immersive !== this.renderer.xr.isPresenting) {
			this.resize();
			this.immersive = this.renderer.xr.isPresenting;
		}
		this.stats.update();
		this.renderer.render(this.scene, this.camera);
	}
}

export { App };
