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

		const ambient = new THREE.HemisphereLight(0xffffff, 0xaaaaaa, 0.8);
		this.scene.add(ambient);

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.outputEncoding = THREE.sRGBEncoding;
		container.appendChild(this.renderer.domElement);

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

		const self = this;
		fetch('./college.json')
			.then(response => response.json())
			.then(obj => {
				self.boardShown = '';
				self.boardData = obj;
			});
	}

	loadAudio() {
		const audioLoader = new THREE.AudioLoader();

		this.ambientSound = new THREE.Audio(this.listener);
		audioLoader.load('./assets/audio/Aimbient.mp3', (buffer) => {
			this.ambientSound.setBuffer(buffer);
			this.ambientSound.setLoop(true);
			this.ambientSound.setVolume(0.3);
			this.ambientSound.play();
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

		loader.load('./assets/hdr/Cobblestone Street Night.hdr', (texture) => {
			const envMap = pmremGenerator.fromEquirectangular(texture).texture;
			pmremGenerator.dispose();
			this.scene.environment = envMap;
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

		const self = this;

		loader.load('college.glb', function (gltf) {
			const college = gltf.scene.children[0];
			self.scene.add(college);

			college.traverse(function (child) {
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
						self.proxy = child;
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

			self.loadingBar.visible = false;
			self.setupXR();
		});
	}

	setupXR() {
		this.renderer.xr.enabled = true;
		const btn = new VRButton(this.renderer);

		const self = this;
		const timeoutId = setTimeout(connectionTimeout, 2000);

		function onSelectStart(event) {
			this.userData.selectPressed = true;
		}

		function onSelectEnd(event) {
			this.userData.selectPressed = false;
		}

		function onConnected(event) {
			clearTimeout(timeoutId);
		}

		function connectionTimeout() {
			self.useGaze = true;
			self.gazeController = new GazeController(self.scene, self.dummyCam);
		}

		this.controllers = this.buildControllers(this.dolly);

		this.controllers.forEach((controller) => {
			controller.addEventListener('selectstart', onSelectStart);
			controller.addEventListener('selectend', onSelectEnd);
			controller.addEventListener('connected', onConnected);
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
		if (this.proxy === undefined) return;

		const wallLimit = 1.3;
		const speed = 2;
		let pos = this.dolly.position.clone();
		pos.y += 1;

		let dir = new THREE.Vector3();
		const quaternion = this.dolly.quaternion.clone();
		this.dolly.quaternion.copy(this.dummyCam.getWorldQuaternion(this.workingQuaternion));
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

		// cast left
		dir.set(-1, 0, 0).applyMatrix4(this.dolly.matrix).normalize();
		this.raycaster.set(pos, dir);
		intersect = this.raycaster.intersectObject(this.proxy);
		if (intersect.length > 0 && intersect[0].distance < wallLimit)
			this.dolly.translateX(wallLimit - intersect[0].distance);

		// cast right
		dir.set(1, 0, 0).applyMatrix4(this.dolly.matrix).normalize();
		this.raycaster.set(pos, dir);
		intersect = this.raycaster.intersectObject(this.proxy);
		if (intersect.length > 0 && intersect[0].distance < wallLimit)
			this.dolly.translateX(intersect[0].distance - wallLimit);

		// cast down
		dir.set(0, -1, 0);
		pos.y += 1.5;
		this.raycaster.set(pos, dir);
		intersect = this.raycaster.intersectObject(this.proxy);
		if (intersect.length > 0) this.dolly.position.copy(intersect[0].point);

		this.dolly.quaternion.copy(quaternion);
	}

	get selectPressed() {
		return (
			this.controllers &&
			(this.controllers[0].userData.selectPressed || this.controllers[1].userData.selectPressed)
		);
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
					Object.entries(this.boardData).forEach(([name, info]) => {
						const obj = this.scene.getObjectByName(name);
						if (obj) {
							const pos = obj.getWorldPosition(new THREE.Vector3());
							if (dollyPos.distanceTo(pos) < 3) {
								boardFound = true;
								if (this.boardShown !== name) this.showInfoboard(name, info, pos);
							}
						}
					});
					if (!boardFound) {
						this.boardShown = "";
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
