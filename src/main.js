import './style.css'
import * as THREE from 'three'
import { Body, HelioVector, MakeTime } from 'astronomy-engine'

// --- App shell ---
document.querySelector('#app').innerHTML = `
  <div id="hud">
    <div class="title">
      <div class="name">UNIVERSE SIM</div>
      <div class="sub">Real-time Solar System • powered by Astronomy Engine</div>
    </div>

    <div class="controls">
      <div class="row">
        <label>Time scale</label>
        <input id="timeScale" type="range" min="-20000" max="20000" step="10" value="600" />
        <span id="timeScaleLabel">×600</span>
      </div>
      <div class="row">
        <button id="btnNow">Now</button>
        <button id="btnPause">Pause</button>
        <button id="btnTrails">Trails: On</button>
      </div>
    </div>

    <div id="info" class="info">
      <div class="hint">Click a planet</div>
    </div>

    <div class="footer">
      Tip: scroll to zoom • drag to rotate • right-drag to pan
    </div>
  </div>
  <canvas id="c"></canvas>
`

// --- Basic scene ---
const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x04060c, 0.00065)

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20000)
camera.position.set(0, 350, 900)

const ambient = new THREE.AmbientLight(0x9bb7ff, 0.35)
scene.add(ambient)

const sunLight = new THREE.PointLight(0xffffff, 2.2, 0, 2)
sunLight.position.set(0, 0, 0)
scene.add(sunLight)

// starfield
{
  const starGeo = new THREE.BufferGeometry()
  const N = 8000
  const positions = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const r = 8000 + Math.random() * 8000
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.cos(phi)
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const starMat = new THREE.PointsMaterial({ color: 0xbfd6ff, size: 1.5, sizeAttenuation: true })
  scene.add(new THREE.Points(starGeo, starMat))
}

// --- Orbit controls (minimal, no external dependency) ---
let isDragging = false
let isRightDragging = false
let lastX = 0
let lastY = 0
let yaw = 0.6
let pitch = 0.35
let distance = 900
let target = new THREE.Vector3(0, 0, 0)

function updateCamera() {
  const x = target.x + distance * Math.cos(pitch) * Math.cos(yaw)
  const z = target.z + distance * Math.cos(pitch) * Math.sin(yaw)
  const y = target.y + distance * Math.sin(pitch)
  camera.position.set(x, y, z)
  camera.lookAt(target)
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault())
canvas.addEventListener('pointerdown', (e) => {
  isDragging = true
  isRightDragging = e.button === 2
  lastX = e.clientX
  lastY = e.clientY
  canvas.setPointerCapture(e.pointerId)
})
canvas.addEventListener('pointerup', (e) => {
  isDragging = false
  isRightDragging = false
  canvas.releasePointerCapture(e.pointerId)
})
canvas.addEventListener('pointermove', (e) => {
  if (!isDragging) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  lastX = e.clientX
  lastY = e.clientY

  if (isRightDragging) {
    // pan
    const panSpeed = distance / 1200
    const right = new THREE.Vector3()
    camera.getWorldDirection(right)
    right.cross(camera.up).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    target.addScaledVector(right, -dx * panSpeed)
    target.addScaledVector(up, dy * panSpeed)
  } else {
    // orbit
    yaw -= dx * 0.005
    pitch -= dy * 0.005
    pitch = Math.max(-1.25, Math.min(1.25, pitch))
  }
})
canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  const delta = Math.sign(e.deltaY)
  distance *= (1 + delta * 0.08)
  distance = Math.max(50, Math.min(12000, distance))
}, { passive: false })

// --- Bodies ---
// Note: scale is for visualization (not real radii). Distances are in AU from Astronomy Engine.
const AU_TO_UNITS = 220 // 1 AU -> 220 scene units

const bodies = [
  { key: 'Mercury', body: Body.Mercury, color: 0xbab3a6, size: 3.2, desc: 'Small, fast, cratered.' },
  { key: 'Venus', body: Body.Venus, color: 0xe6c48c, size: 6.2, desc: 'Thick atmosphere, hottest surface.' },
  { key: 'Earth', body: Body.Earth, color: 0x4fa3ff, size: 6.4, desc: 'Home. 1 AU baseline.' },
  { key: 'Mars', body: Body.Mars, color: 0xe36a3b, size: 4.2, desc: 'Red planet, thin atmosphere.' },
  { key: 'Jupiter', body: Body.Jupiter, color: 0xd9b38c, size: 14.0, desc: 'Gas giant, many moons.' },
  { key: 'Saturn', body: Body.Saturn, color: 0xf2d39c, size: 12.0, desc: 'Rings, low density.' },
  { key: 'Uranus', body: Body.Uranus, color: 0x8fe7ff, size: 9.5, desc: 'Ice giant, extreme tilt.' },
  { key: 'Neptune', body: Body.Neptune, color: 0x3a6bff, size: 9.2, desc: 'Ice giant, strong winds.' },
]

const orbitLines = []
const planetMeshes = []
const trails = new Map() // key -> line

// Sun
{
  const sunGeo = new THREE.SphereGeometry(22, 32, 32)
  const sunMat = new THREE.MeshStandardMaterial({
    emissive: new THREE.Color(0xfff2c6),
    emissiveIntensity: 2.4,
    color: 0xffc766,
    roughness: 0.4,
    metalness: 0.0,
  })
  const sun = new THREE.Mesh(sunGeo, sunMat)
  sun.name = 'Sun'
  scene.add(sun)
}

function makePlanetMesh(p) {
  const geo = new THREE.SphereGeometry(p.size, 24, 24)
  const mat = new THREE.MeshStandardMaterial({
    color: p.color,
    roughness: 0.65,
    metalness: 0.15,
    emissive: new THREE.Color(p.color).multiplyScalar(0.08),
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = p.key
  mesh.userData = p
  return mesh
}

function makeOrbitLine(points) {
  const geo = new THREE.BufferGeometry().setFromPoints(points)
  const mat = new THREE.LineBasicMaterial({ color: 0x254a9a, transparent: true, opacity: 0.35 })
  return new THREE.LineLoop(geo, mat)
}

function computeHelioPos(body, time) {
  // returns in AU, J2000 ecliptic-ish coordinates from Astronomy Engine
  const v = HelioVector(body, time)
  return new THREE.Vector3(v.x, v.z, v.y) // swap axes for nicer orientation
}

function buildOrbits(time) {
  // precompute simple orbit paths around the Sun (one period sample). We'll sample 360 points.
  for (const line of orbitLines) scene.remove(line)
  orbitLines.length = 0

  const samples = 360
  for (const p of bodies) {
    const pts = []
    // sample across ~1 sidereal year for inner planets isn't perfect, but looks right.
    // We'll sample +/- 365 days around current time.
    for (let i = 0; i < samples; i++) {
      const dtDays = (i / samples) * 365.25
      const t = MakeTime(time.ut + dtDays)
      const au = computeHelioPos(p.body, t)
      pts.push(au.multiplyScalar(AU_TO_UNITS))
    }
    const orbit = makeOrbitLine(pts)
    orbit.name = `${p.key}-orbit`
    orbitLines.push(orbit)
    scene.add(orbit)
  }
}

for (const p of bodies) {
  const mesh = makePlanetMesh(p)
  planetMeshes.push(mesh)
  scene.add(mesh)

  // trail
  const trailGeo = new THREE.BufferGeometry()
  const maxPts = 220
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPts * 3), 3))
  trailGeo.setDrawRange(0, 0)
  const trailMat = new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.35 })
  const trail = new THREE.Line(trailGeo, trailMat)
  trails.set(p.key, { line: trail, maxPts, count: 0 })
  scene.add(trail)
}

// --- Picking ---
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let selected = null

function setInfo(p, helioAU, date) {
  const el = document.getElementById('info')
  if (!p) {
    el.innerHTML = `<div class="hint">Click a planet</div>`
    return
  }
  const distAU = helioAU.length()
  el.innerHTML = `
    <div class="h">${p.key}</div>
    <div class="k">${p.desc}</div>
    <div class="grid">
      <div>Heliocentric distance</div><div>${distAU.toFixed(3)} AU</div>
      <div>X/Y/Z (AU)</div><div>${helioAU.x.toFixed(3)}, ${helioAU.y.toFixed(3)}, ${helioAU.z.toFixed(3)}</div>
      <div>Simulation time</div><div>${date.toISOString().replace('T',' ').slice(0,19)}Z</div>
    </div>
  `
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(planetMeshes, false)
  if (hits.length) {
    selected = hits[0].object.userData
  } else {
    selected = null
    setInfo(null)
  }
})

// --- Time control ---
let simTime = MakeTime(new Date())
let paused = false
let timeScale = 600 // seconds of sim per second real
let showTrails = true

const timeScaleInput = document.getElementById('timeScale')
const timeScaleLabel = document.getElementById('timeScaleLabel')
const btnNow = document.getElementById('btnNow')
const btnPause = document.getElementById('btnPause')
const btnTrails = document.getElementById('btnTrails')

function syncTimeScaleLabel() {
  timeScaleLabel.textContent = `×${Number(timeScale).toLocaleString()}`
}

timeScaleInput.addEventListener('input', () => {
  timeScale = Number(timeScaleInput.value)
  if (timeScale === 0) timeScale = 1
  syncTimeScaleLabel()
})

btnNow.addEventListener('click', () => {
  simTime = MakeTime(new Date())
  resetTrails()
  buildOrbits(simTime)
})

btnPause.addEventListener('click', () => {
  paused = !paused
  btnPause.textContent = paused ? 'Resume' : 'Pause'
})

btnTrails.addEventListener('click', () => {
  showTrails = !showTrails
  btnTrails.textContent = showTrails ? 'Trails: On' : 'Trails: Off'
  for (const { line } of trails.values()) line.visible = showTrails
})

syncTimeScaleLabel()

function resetTrails() {
  for (const t of trails.values()) {
    t.count = 0
    t.line.geometry.setDrawRange(0, 0)
  }
}

// --- Resize ---
function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()
updateCamera()

// initial orbit preview
buildOrbits(simTime)

// --- Animation loop ---
let last = performance.now()

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  if (!paused) {
    // Astronomy Engine time uses UT days internally; MakeTime can accept UT in days.
    // simTime.ut is days since J2000? In astronomy-engine, Time.ut is days since 2000-01-01.
    // Advance by dt * timeScale seconds -> convert to days.
    simTime = MakeTime(simTime.ut + (dt * timeScale) / 86400)
  }

  // update planet positions
  let selectedAU = null
  for (let i = 0; i < bodies.length; i++) {
    const p = bodies[i]
    const au = computeHelioPos(p.body, simTime)
    const pos = au.clone().multiplyScalar(AU_TO_UNITS)
    planetMeshes[i].position.copy(pos)

    // trails
    const tr = trails.get(p.key)
    if (showTrails) {
      const arr = tr.line.geometry.attributes.position.array
      const idx = tr.count % tr.maxPts
      arr[idx * 3 + 0] = pos.x
      arr[idx * 3 + 1] = pos.y
      arr[idx * 3 + 2] = pos.z
      tr.count++
      tr.line.geometry.attributes.position.needsUpdate = true
      tr.line.geometry.setDrawRange(0, Math.min(tr.maxPts, tr.count))
    }

    if (selected && selected.key === p.key) selectedAU = au
  }

  // camera
  updateCamera()

  // info
  if (selected && selectedAU) {
    // Convert simTime to JS date (approx): simTime.date is provided by library.
    const date = simTime.date
    setInfo(selected, selectedAU, date)
  }

  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}

requestAnimationFrame(tick)
