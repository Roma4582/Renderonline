import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 1. Ініціалізація сцени, камери та рендерера
const container = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222226);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// 2. Освітлення та сітка (Grid)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const gridHelper = new THREE.GridHelper(20, 20, 0x555555, 0x333333);
scene.add(gridHelper);

// 3. Керування камерою та об'єктами (Gizmo)
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.addEventListener('dragging-changed', (event) => {
  orbit.enabled = !event.value; // Вимикаємо обертання камери, коли тягнемо стрілки об'єкта
});
scene.add(transformControls.getHelper());

// Група для об'єктів користувача (щоб не експортувати сітку та стрілки)
const userObjectsGroup = new THREE.Group();
scene.add(userObjectsGroup);

let selectedObject = null;
let currentFileHandle = null; // Для швидкого перезбереження файлу

// 4. Вибір об'єктів кліком миші (Raycaster)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (transformControls.dragging) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(userObjectsGroup.children, true);

  if (intersects.length > 0) {
    // Знаходимо кореневий об'єкт у групі користувача
    let target = intersects[0].object;
    while (target.parent && target.parent !== userObjectsGroup) {
      target = target.parent;
    }
    selectObject(target);
  } else {
    deselectObject();
  }
});

function selectObject(obj) {
  selectedObject = obj;
  transformControls.attach(obj);
  if (obj.material && obj.material.color) {
    document.getElementById('color-picker').value = '#' + obj.material.color.getHexString();
  }
}

function deselectObject() {
  selectedObject = null;
  transformControls.detach();
}

// 5. Додавання фігур та інструменти
function addMesh(geometry) {
  const material = new THREE.MeshStandardMaterial({
    color: document.getElementById('color-picker').value,
    roughness: 0.4,
    metalness: 0.1
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.5;
  userObjectsGroup.add(mesh);
  selectObject(mesh);
}

document.getElementById('btn-add-cube').onclick = () => addMesh(new THREE.BoxGeometry(1, 1, 1));
document.getElementById('btn-add-sphere').onclick = () => addMesh(new THREE.SphereGeometry(0.6, 32, 32));

document.getElementById('color-picker').oninput = (e) => {
  if (selectedObject && selectedObject.material) {
    selectedObject.material.color.set(e.target.value);
  }
};

document.getElementById('btn-delete').onclick = () => {
  if (selectedObject) {
    userObjectsGroup.remove(selectedObject);
    deselectObject();
  }
};

// Перемикання режимів трансформації (W, E, R)
const setMode = (mode, btnId) => {
  transformControls.setMode(mode);
  document.querySelectorAll('#toolbar button').forEach(b => b.classList.remove('active'));
  document.getElementById(btnId).classList.add('active');
};

document.getElementById('btn-mode-translate').onclick = () => setMode('translate', 'btn-mode-translate');
document.getElementById('btn-mode-rotate').onclick = () => setMode('rotate', 'btn-mode-rotate');
document.getElementById('btn-mode-scale').onclick = () => setMode('scale', 'btn-mode-scale');

window.addEventListener('keydown', (e) => {
  if (e.key === 'w' || e.key === 'ц') setMode('translate', 'btn-mode-translate');
  if (e.key === 'e' || e.key === 'у') setMode('rotate', 'btn-mode-rotate');
  if (e.key === 'r' || e.key === 'к') setMode('scale', 'btn-mode-scale');
  if (e.key === 'Delete' && selectedObject) {
    userObjectsGroup.remove(selectedObject);
    deselectObject();
  }
});

// 6. Збереження проєкту на ПК (File System Access API + GLTFExporter)
document.getElementById('btn-save').onclick = async () => {
  deselectObject(); // Ховаємо стрілки перед експортом
  const exporter = new GLTFExporter();

  exporter.parse(
    userObjectsGroup,
    async (glbBuffer) => {
      try {
        if ('showSaveFilePicker' in window) {
          if (!currentFileHandle) {
            currentFileHandle = await window.showSaveFilePicker({
              suggestedName: 'scene.glb',
              types: [{ description: '3D Scene (GLB)', accept: { 'model/gltf-binary': ['.glb'] } }]
            });
          }
          const writable = await currentFileHandle.createWritable();
          await writable.write(glbBuffer);
          await writable.close();
          alert('Файл успішно збережено на ПК!');
        } else {
          // Резервне завантаження для Firefox/Safari
          const blob = new Blob([glbBuffer], { type: 'application/octet-stream' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'scene.glb';
          a.click();
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    },
    (err) => console.error('Помилка експорту:', err),
    { binary: true }
  );
};

// 7. Відкриття файлу з ПК
document.getElementById('btn-open').onclick = async () => {
  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: '3D Models', accept: { 'model/gltf-binary': ['.glb', '.gltf'] } }]
    });
    currentFileHandle = fileHandle;
    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();

    const loader = new GLTFLoader();
    loader.parse(arrayBuffer, '', (gltf) => {
      deselectObject();
      userObjectsGroup.clear();
      userObjectsGroup.add(...gltf.scene.children);
    });
  } catch (err) {
    if (err.name !== 'AbortError') console.error(err);
  }
};

// 8. Цикл рендерингу та адаптація під розмір вікна
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene, camera);
}
animate();
