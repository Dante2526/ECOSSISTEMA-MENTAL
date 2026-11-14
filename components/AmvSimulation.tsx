import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useContext, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls, ContactShadows, Text as DreiText, Box } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { 
  ShieldCheck, AlertTriangle, Train, Power, Moon, Sun, 
  Video, LayoutDashboard, ArrowRightLeft, RadioReceiver, 
  Map as MapIcon, X, Compass, HelpCircle, Layers,
  ChevronDown, ChevronUp, RotateCcw, Gauge, Play, Pause,
  Palette, Check, Paintbrush, SlidersHorizontal, Volume2, VolumeX
} from 'lucide-react';
import { useBackButtonHandler } from '../services/backButtonHandler';

type Direction = 'NORTE_SUL' | 'SUL_NORTE';
type SwitchState = 'NORMAL' | 'REVERSO' | 'FALHA';
type CameraMode = 'ISOMETRIC' | 'TOP' | 'POV';
type SpawnLine = '128' | '1' | '2' | '166' | '167' | '152' | '105A' | '106A' | '107A' | '109' | '122' | '121' | '109A' | '159' | '173' | '22A' | '23A' | '24A' | '201A' | '32' | '28' | '31' | '27' | 'P13A' | 'TP3A' | 'TP2A' | 'TP01' | 'TP05' | 'TP04' | 'TP3B' | 'TP2B' | '158' | '160' | '161' | '162' | '163' | '164' | '165';
type LayoutType = 'freio' | 'freio_02' | 'oficina' | 'oficina_central' | 'abaixo_oficina' | 'reclassificacao' | 'reclassificacao_02' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'passageiro_01' | 'passageiro_02' | 'default';

// Sintetizador de Buzina Pneumática de Locomotiva (1 único toque encorpado)
let sharedHornAudioCtx: AudioContext | null = null;
export function playLocomotiveHorn() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedHornAudioCtx || sharedHornAudioCtx.state === 'closed') {
      sharedHornAudioCtx = new AudioCtx();
    }
    const ctx = sharedHornAudioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    // Frequências reais da buzina ferroviária Nathan K5LA (D#4, F#4, G#4, B4, D#5) + sub-harmônico grave do compressor
    const chimeFreqs = [155.56, 311.13, 369.99, 415.30, 493.88, 622.25];
    const chimeGains = [0.14, 0.24, 0.20, 0.18, 0.22, 0.16];

    // Somente 1 toque contínuo de partida da locomotiva
    const blasts = [
      { start: 0.0, duration: 0.72 },
    ];

    blasts.forEach(({ start, duration }) => {
      const blastStart = now + start;
      const blastEnd = blastStart + duration;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, blastStart);
      // Ataque pneumático progressivo da válvula de ar
      masterGain.gain.exponentialRampToValueAtTime(0.42, blastStart + 0.055);
      masterGain.gain.setValueAtTime(0.42, blastEnd - 0.09);
      // Queda de pressão de ar realista com reverberação natural
      masterGain.gain.exponentialRampToValueAtTime(0.0001, blastEnd + 0.26);

      // Filtro passa-baixa para timbre metálico de corneta ferroviária
      const brassFilter = ctx.createBiquadFilter();
      brassFilter.type = 'lowpass';
      brassFilter.frequency.setValueAtTime(1400, blastStart);
      brassFilter.frequency.linearRampToValueAtTime(1950, blastStart + 0.08);
      brassFilter.frequency.setValueAtTime(1850, blastEnd - 0.08);
      brassFilter.frequency.linearRampToValueAtTime(950, blastEnd + 0.24);
      brassFilter.Q.setValueAtTime(2.2, blastStart);

      brassFilter.connect(masterGain);
      masterGain.connect(ctx.destination);

      chimeFreqs.forEach((freq, idx) => {
        const oscSaw = ctx.createOscillator();
        const oscTri = ctx.createOscillator();
        const voiceGain = ctx.createGain();

        oscSaw.type = 'sawtooth';
        oscTri.type = 'triangle';

        // Leve variação de pressão de ar no ataque (pitch bend sutil)
        const detuneCents = (idx % 2 === 0 ? 1 : -1) * (2.5 + idx * 0.8);
        oscSaw.detune.setValueAtTime(detuneCents, blastStart);
        oscTri.detune.setValueAtTime(-detuneCents * 0.7, blastStart);

        oscSaw.frequency.setValueAtTime(freq * 0.985, blastStart);
        oscSaw.frequency.exponentialRampToValueAtTime(freq, blastStart + 0.045);
        oscSaw.frequency.setValueAtTime(freq, blastEnd - 0.05);
        oscSaw.frequency.exponentialRampToValueAtTime(freq * 0.975, blastEnd + 0.24);

        oscTri.frequency.setValueAtTime(freq, blastStart);

        voiceGain.gain.setValueAtTime(chimeGains[idx], blastStart);

        oscSaw.connect(voiceGain);
        oscTri.connect(voiceGain);
        voiceGain.connect(brassFilter);

        oscSaw.start(blastStart);
        oscTri.start(blastStart);
        oscSaw.stop(blastEnd + 0.28);
        oscTri.stop(blastEnd + 0.28);
      });
    });
  } catch (e) {
    // Ignora caso o navegador bloqueie áudio sem interação prévia
  }
}

export interface PlateColors {
  bg: string;
  text: string;
}

export const POPULAR_BG_COLORS = [
  { label: 'Vermelho', hex: '#ef0000' },
  { label: 'Amarelo', hex: '#ffcc00' },
  { label: 'Azul Real', hex: '#0055ff' },
  { label: 'Verde', hex: '#00aa3e' },
  { label: 'Laranja', hex: '#ff6600' },
  { label: 'Preto', hex: '#05070c' },
  { label: 'Branco', hex: '#ffffff' },
  { label: 'Roxo', hex: '#7c3aed' },
];

export const POPULAR_TEXT_COLORS = [
  { label: 'Branco', hex: '#ffffff' },
  { label: 'Preto', hex: '#000000' },
  { label: 'Amarelo Ouro', hex: '#ffd600' },
  { label: 'Verde Neon', hex: '#00ff66' },
  { label: 'Ciano', hex: '#00e5ff' },
  { label: 'Laranja', hex: '#ffaa00' },
];

export const QUICK_PLATE_PRESETS = [
  { name: 'Laranja & Preto', bg: '#ff6600', text: '#000000' },
  { name: 'Vermelho & Branco', bg: '#ef0000', text: '#ffffff' },
  { name: 'Amarelo & Preto', bg: '#ffcc00', text: '#000000' },
  { name: 'Azul & Branco', bg: '#0055ff', text: '#ffffff' },
  { name: 'Preto & Branco', bg: '#05070c', text: '#ffffff' },
  { name: 'Verde & Branco', bg: '#00aa3e', text: '#ffffff' },
  { name: 'Preto & Ouro', bg: '#05070c', text: '#ffd600' },
  { name: 'Azul & Ouro', bg: '#0a32b2', text: '#ffd600' },
  { name: 'Branco & Preto', bg: '#ffffff', text: '#000000' },
];

export type PlateTheme = 'red_white' | 'yellow_black' | 'black_white' | 'blue_white' | 'green_white' | 'black_gold' | 'blue_gold';

export const PLATE_THEMES: Record<PlateTheme, { name: string; bg: string; border: string; text: string; emissive: string }> = {
  red_white: { name: 'Vermelho & Branco', bg: '#ef0000', border: '#990000', text: '#ffffff', emissive: '#b30000' },
  yellow_black: { name: 'Amarelo & Preto', bg: '#ffcc00', border: '#b38600', text: '#000000', emissive: '#cc9900' },
  black_white: { name: 'Preto & Branco', bg: '#05070c', border: '#ffffff', text: '#ffffff', emissive: '#111420' },
  blue_white: { name: 'Azul & Branco', bg: '#0055ff', border: '#0033cc', text: '#ffffff', emissive: '#0044dd' },
  green_white: { name: 'Verde & Branco', bg: '#00aa3e', border: '#006622', text: '#ffffff', emissive: '#008832' },
  black_gold: { name: 'Preto & Ouro', bg: '#05070c', border: '#ffd600', text: '#ffd600', emissive: '#111420' },
  blue_gold: { name: 'Azul & Ouro', bg: '#0a32b2', border: '#ffd600', text: '#ffd600', emissive: '#0b2688' },
};

interface AmvSimulationProps {
  systemId: string;
  systemName: string;
  onClose: () => void;
  inlineMode?: boolean;
}

const SimHazardContext = React.createContext<{
  hazardAmvs: boolean[];
  isDanger: boolean;
  isWarning: boolean;
  amvs: SwitchState[];
  selectedAmv: number;
  routePulseId: number;
  plateColors: PlateColors;
  setPlateColors: (colors: PlateColors) => void;
}>({
  hazardAmvs: [false, false, false, false],
  isDanger: false,
  isWarning: false,
  amvs: ['NORMAL', 'NORMAL', 'NORMAL', 'NORMAL'],
  selectedAmv: 0,
  routePulseId: 0,
  plateColors: { bg: '#ff6600', text: '#000000' },
  setPlateColors: () => {},
});

class TextErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function Text(props: any) {
  return (
    <TextErrorBoundary>
      <Suspense fallback={null}>
        <DreiText font="/fonts/roboto.woff" {...props} />
      </Suspense>
    </TextErrorBoundary>
  );
}

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    let envMap: THREE.Texture | null = null;
    const timer = window.setTimeout(() => {
      try {
        const pmremGenerator = new THREE.PMREMGenerator(gl);
        pmremGenerator.compileEquirectangularShader();
        const roomEnv = new RoomEnvironment();
        envMap = pmremGenerator.fromScene(roomEnv, 0.04).texture;
        scene.environment = envMap;
        roomEnv.dispose();
        pmremGenerator.dispose();
      } catch (e) {
        console.warn('⚠️ [3D] Fallback de iluminação local ativo:', e);
      }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      if (envMap) envMap.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

function RealisticSkyEnvironment({ nightMode }: { nightMode: boolean }) {
  const cloudsRef = useRef<THREE.Group>(null);

  const skyMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uNight: { value: nightMode ? 1.0 : 0.0 },
        uSunDir: { value: new THREE.Vector3(-0.38, 0.42, -0.82).normalize() },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform float uNight;
        uniform vec3 uSunDir;
        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = clamp(dir.y, 0.0, 1.0);

          // Day sky colors (zenith -> mid -> warm horizon)
          vec3 dayZenith = vec3(0.11, 0.36, 0.78);
          vec3 dayMid = vec3(0.32, 0.64, 0.94);
          vec3 dayHorizon = vec3(0.82, 0.91, 0.98);
          vec3 dayCol = mix(dayHorizon, dayMid, smoothstep(0.0, 0.28, h));
          dayCol = mix(dayCol, dayZenith, smoothstep(0.28, 0.85, h));

          // Subtle solar glow
          float sunAmt = max(dot(dir, uSunDir), 0.0);
          dayCol += vec3(1.0, 0.92, 0.75) * pow(sunAmt, 14.0) * 0.38;
          dayCol += vec3(1.0, 0.97, 0.9) * smoothstep(0.996, 0.9995, sunAmt) * 0.9;

          // Lower hemisphere ground-haze blend (warm sandy earth tone in day)
          if (dir.y < 0.0) {
            dayCol = mix(dayHorizon, vec3(0.58, 0.49, 0.37), clamp(-dir.y * 4.0, 0.0, 1.0));
          }

          // Night sky colors
          vec3 nightZenith = vec3(0.015, 0.025, 0.07);
          vec3 nightHorizon = vec3(0.06, 0.10, 0.20);
          vec3 nightCol = mix(nightHorizon, nightZenith, smoothstep(0.0, 0.55, h));
          if (dir.y < 0.0) {
            nightCol = mix(nightHorizon, vec3(0.05, 0.05, 0.06), clamp(-dir.y * 4.0, 0.0, 1.0));
          }

          vec3 finalCol = mix(dayCol, nightCol, uNight);
          gl_FragColor = vec4(finalCol, 1.0);
        }
      `,
    });
  }, []);

  useEffect(() => {
    skyMaterial.uniforms.uNight.value = nightMode ? 1.0 : 0.0;
  }, [nightMode, skyMaterial]);

  // Textura procedural de areia e terra batida do pátio ferroviário
  const { sandMap, sandBumpMap } = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d')!;

    // Base de areia / terra batida
    ctx.fillStyle = '#b4976e';
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);

    // Manchas orgânicas de areia clara e terra úmida compactada
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 260; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 14 + rand() * 48;
      const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
      const isLightSand = rand() > 0.45;
      grad.addColorStop(0, isLightSand ? 'rgba(214, 188, 148, 0.28)' : 'rgba(132, 104, 70, 0.26)');
      grad.addColorStop(1, 'rgba(180, 151, 110, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Milhares de grãos de areia, pedregulhos e micro-textura mineral
    const sandColors = ['#cfb58c', '#9c7e56', '#d8c29d', '#876b47', '#bfa278', '#755c3c', '#e2cfa9'];
    for (let i = 0; i < 16000; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 1 + rand() * 2.8;
      const h = 1 + rand() * 2.4;
      ctx.fillStyle = sandColors[Math.floor(rand() * sandColors.length)];
      ctx.fillRect(x, y, w, h);

      const bVal = Math.floor(90 + rand() * 145);
      bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      bCtx.fillRect(x, y, w, h);
    }

    // Pequenos seixos/pedrinhas espalhados na areia
    for (let i = 0; i < 950; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 1.2 + rand() * 2.6;
      ctx.fillStyle = rand() > 0.5 ? '#6e655c' : '#8c7d6b';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      bCtx.fillStyle = '#e5e5e5';
      bCtx.beginPath();
      bCtx.arc(x, y, r, 0, Math.PI * 2);
      bCtx.fill();
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(38, 38);
    map.colorSpace = THREE.SRGBColorSpace;

    const bump = new THREE.CanvasTexture(bumpCanvas);
    bump.wrapS = THREE.RepeatWrapping;
    bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(38, 38);

    return { sandMap: map, sandBumpMap: bump };
  }, []);

  const clouds = useMemo(() => [
    { pos: [-55, 34, -85], scale: [6.5, 2.2, 4.5] },
    { pos: [-18, 38, -92], scale: [8.0, 2.5, 5.2] },
    { pos: [28, 35, -88], scale: [7.2, 2.3, 4.8] },
    { pos: [68, 33, -78], scale: [6.0, 2.0, 4.2] },
    { pos: [-78, 31, -40], scale: [6.8, 2.1, 4.6] },
    { pos: [82, 32, -32], scale: [6.4, 2.1, 4.5] },
    { pos: [-42, 36, 48], scale: [7.5, 2.3, 5.0] },
    { pos: [35, 37, 55], scale: [7.0, 2.2, 4.8] },
    { pos: [0, 41, -65], scale: [5.5, 1.8, 3.8] },
    { pos: [-65, 35, 10], scale: [5.8, 1.9, 4.0] },
  ], []);

  const stars = useMemo(() => {
    const arr: [number, number, number, number][] = [];
    for (let i = 0; i < 140; i++) {
      const theta = (i * 2.39996) % (Math.PI * 2);
      const phi = 0.12 + ((i * 0.713) % 1) * 1.15;
      const r = 155;
      arr.push([
        r * Math.cos(phi) * Math.cos(theta),
        r * Math.sin(phi),
        r * Math.cos(phi) * Math.sin(theta),
        0.18 + (i % 4) * 0.07,
      ]);
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (cloudsRef.current && !nightMode) {
      cloudsRef.current.rotation.y += delta * 0.004;
    }
  });

  return (
    <group>
      {/* Domo atmosférico 360° */}
      <mesh material={skyMaterial} scale={[1, 1, 1]}>
        <sphereGeometry args={[170, 40, 28]} />
      </mesh>

      {/* Nuvens volumétricas suaves no Modo Dia */}
      {!nightMode && (
        <group ref={cloudsRef}>
          {clouds.map((c, idx) => (
            <group key={`cloud-${idx}`} position={c.pos as [number, number, number]}>
              <mesh scale={c.scale as [number, number, number]}>
                <sphereGeometry args={[1, 14, 12]} />
                <meshBasicMaterial color="#f8fafc" transparent opacity={0.82} />
              </mesh>
              <mesh position={[c.scale[0] * 0.55, -0.35, 0.4]} scale={[c.scale[0] * 0.7, c.scale[1] * 0.8, c.scale[2] * 0.75]}>
                <sphereGeometry args={[1, 12, 10]} />
                <meshBasicMaterial color="#e2e8f0" transparent opacity={0.75} />
              </mesh>
              <mesh position={[-c.scale[0] * 0.5, -0.25, -0.3]} scale={[c.scale[0] * 0.65, c.scale[1] * 0.75, c.scale[2] * 0.7]}>
                <sphereGeometry args={[1, 12, 10]} />
                <meshBasicMaterial color="#f1f5f9" transparent opacity={0.78} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* Estrelas e Lua no Modo Noite */}
      {nightMode && (
        <group>
          {stars.map((st, idx) => (
            <mesh key={`star-${idx}`} position={[st[0], st[1], st[2]]}>
              <sphereGeometry args={[st[3], 6, 6]} />
              <meshBasicMaterial color="#e0e7ff" toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[-48, 52, -95]}>
            <sphereGeometry args={[3.2, 20, 20]} />
            <meshBasicMaterial color="#fef9c3" toneMapped={false} />
          </mesh>
        </group>
      )}

      {/* Terreno de areia e terra batida do pátio ferroviário */}
      <mesh position={[0, -0.23, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[340, 340]} />
        <meshStandardMaterial
          map={sandMap}
          bumpMap={sandBumpMap}
          bumpScale={0.045}
          color={nightMode ? "#473c2e" : "#e8d5b7"}
          roughness={0.96}
          metalness={0.02}
        />
      </mesh>

      {/* Paisagismo Natural: Rio com Peixes Nadando, Margens Verdes e Árvores 3D */}
      <YardNaturalScenery nightMode={nightMode} />
    </group>
  );
}

// Curva sinuosa do rio lateral ao pátio (afastada de todas as linhas férreas, inclusive L-158 e TP-3A)
function getRiverCenterX(z: number): number {
  return -22.2 + Math.sin(z * 0.055) * 1.35 + Math.cos(z * 0.028) * 0.55;
}

function getRiverTangentAngle(z: number): number {
  const dx = getRiverCenterX(z + 0.5) - getRiverCenterX(z - 0.5);
  return Math.atan2(dx, 1.0);
}

function YardNaturalScenery({ nightMode }: { nightMode: boolean }) {
  const waterTexRef = useRef<THREE.CanvasTexture | null>(null);
  const fishGroupRef = useRef<THREE.Group>(null);
  const tailRefs = useRef<(THREE.Mesh | null)[]>([]);
  const rippleRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Textura procedural de água cristalina com ondulações e cáusticas
  const waterTexture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, 0, size, size);

    let seed = 4242;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Ondas suaves e reflexos de água corrente
    for (let i = 0; i < 180; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 18 + rand() * 45;
      const h = 2 + rand() * 4;
      ctx.fillStyle = rand() > 0.4 ? 'rgba(125, 211, 252, 0.28)' : 'rgba(3, 105, 161, 0.32)';
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, (rand() - 0.5) * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    // Brilhos solares na superfície
    for (let i = 0; i < 90; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 6 + rand() * 14;
      ctx.fillStyle = 'rgba(224, 242, 254, 0.38)';
      ctx.fillRect(x, y, w, 1.5);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 18);
    tex.colorSpace = THREE.SRGBColorSpace;
    waterTexRef.current = tex;
    return tex;
  }, []);

  // Geometrias contínuas para a margem gramada, o leito do rio e a lâmina d'água
  const { bankGeo, bedGeo, waterGeo } = useMemo(() => {
    const buildRibbon = (halfWidth: number, zStart: number, zEnd: number, steps: number) => {
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const z = zStart + (zEnd - zStart) * u;
        const cx = getRiverCenterX(z);
        positions.push(cx - halfWidth, 0, z);
        positions.push(cx + halfWidth, 0, z);
        uvs.push(0, u);
        uvs.push(1, u);
        if (i < steps) {
          const base = i * 2;
          indices.push(base, base + 2, base + 1);
          indices.push(base + 1, base + 2, base + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    };

    return {
      bankGeo: buildRibbon(4.8, -95, 95, 76),
      bedGeo: buildRibbon(3.4, -95, 95, 76),
      waterGeo: buildRibbon(3.0, -95, 95, 76),
    };
  }, []);

  // Cardume de 30 peixes 3D nadando no rio (concentrados na área principal de visão)
  const fishes = useMemo(() => {
    const palette = [
      { body: '#ff5500', fin: '#ff9900' }, // Carpa / Dourado Laranja Vivo
      { body: '#ffaa00', fin: '#fde047' }, // Dourado Sol
      { body: '#ef4444', fin: '#fca5a5' }, // Piraputanga Vermelha
      { body: '#38bdf8', fin: '#bae6fd' }, // Lambari Prata-Azul
      { body: '#ff7700', fin: '#ffffff' }, // Koi Laranja & Branco
    ];
    const list = [];
    for (let i = 0; i < 30; i++) {
      const col = palette[i % palette.length];
      const dir = i % 2 === 0 ? 1 : -1;
      const zStart = -48 + (i / 30) * 96;
      const laneOffset = ((i * 1.618) % 1 - 0.5) * 3.9;
      const speed = 2.2 + (i % 5) * 0.55;
      const scale = 0.85 + (i % 4) * 0.18;
      list.push({
        id: i,
        bodyColor: col.body,
        finColor: col.fin,
        dir,
        zStart,
        laneOffset,
        speed,
        scale,
        phase: i * 1.37,
        jumpPhase: i * 2.15,
      });
    }
    return list;
  }, []);

  // Pedras e vegetação ribeirinha nas duas margens do rio
  const riverProps = useMemo(() => {
    const rocks: { x: number; z: number; s: number; rot: number; col: string }[] = [];
    const reeds: { x: number; z: number; h: number; rot: number }[] = [];
    for (let i = 0; i < 56; i++) {
      const z = -68 + i * 2.45;
      const cx = getRiverCenterX(z);
      const side = i % 2 === 0 ? 1 : -1;
      const bankX = cx + side * (3.1 + (i % 3) * 0.32);
      rocks.push({
        x: bankX,
        z,
        s: 0.28 + (i % 4) * 0.12,
        rot: i * 0.9,
        col: i % 2 === 0 ? '#64748b' : '#78716c',
      });
      if (i % 2 === 0) {
        reeds.push({
          x: cx + side * 2.9,
          z: z + 0.6,
          h: 0.65 + (i % 3) * 0.22,
          rot: (i % 5) * 0.4,
        });
      }
    }
    return { rocks, reeds };
  }, []);

  // Bosque de árvores 3D posicionado fora do gabarito de todas as linhas férreas
  const trees = useMemo(() => {
    const crowns = [
      { main: '#15803d', sec: '#16a34a', top: '#22c55e' }, // Ipê / Jatobá Verde Intenso
      { main: '#166534', sec: '#15803d', top: '#4ade80' }, // Copa Esmeralda
      { main: '#14532d', sec: '#166534', top: '#16a34a' }, // Cedro Escuro
      { main: '#ca8a04', sec: '#eab308', top: '#facc15' }, // Ipê Amarelo Florido
      { main: '#be185d', sec: '#db2777', top: '#f472b6' }, // Ipê Rosa Florido
    ];

    const coords: [number, number, number, number][] = [
      // Margem interna do rio (entre a linha L-158 em x=-11.5 e o rio em x=-22.2, totalmente livre dos trilhos!)
      [-16.8, -38, 1.02, 0],
      [-16.4, -25, 0.95, 1],
      [-17.0, -12, 1.05, 3], // Ipê Amarelo
      [-16.5, 2, 0.98, 0],
      [-16.9, 16, 1.04, 2],
      [-16.3, 29, 0.94, 4], // Ipê Rosa
      [-17.1, 42, 1.06, 1],

      // Margem externa do rio (lado esquerdo além do rio)
      [-28.2, -48, 1.25, 0],
      [-29.5, -38, 1.15, 2],
      [-27.8, -30, 1.30, 3],
      [-30.0, -21, 1.18, 1],
      [-28.4, -12, 1.22, 0],
      [-31.0, -3, 1.35, 4],
      [-28.0, 7, 1.15, 1],
      [-29.8, 17, 1.28, 2],
      [-27.9, 27, 1.20, 0],
      [-30.2, 37, 1.32, 3],
      [-28.5, 48, 1.18, 1],
      [-34.5, -34, 1.40, 2],
      [-36.0, -16, 1.35, 0],
      [-34.8, 4, 1.42, 1],
      [-36.5, 22, 1.30, 2],

      // Lado direito da ferrovia (totalmente afastado da L-165, do galpão azul e da placa de caminho seguro)
      [14.8, -44, 1.12, 1],
      [14.5, -33, 1.06, 3],
      [16.8, -24, 1.20, 0],
      [17.5, -14, 1.15, 2],
      [16.6, -4, 1.22, 4],
      [17.8, 7, 1.16, 1],
      [16.9, 18, 1.24, 0],
      [17.4, 28, 1.14, 3],
      [14.6, 38, 1.18, 2],
      [15.2, 47, 1.12, 0],
      [23.5, -32, 1.36, 2],
      [25.0, -14, 1.30, 0],
      [23.8, 6, 1.38, 1],
      [25.2, 24, 1.32, 2],
    ];

    return coords.map(([x, z, scale, cIdx], idx) => ({
      id: idx,
      x,
      z,
      scale,
      rotY: (idx * 1.7) % (Math.PI * 2),
      crown: crowns[cIdx % crowns.length],
    }));
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Fluxo contínuo da água do rio
    if (waterTexRef.current) {
      waterTexRef.current.offset.y -= delta * 0.22;
    }

    // Animação de nado dos peixes 3D
    if (fishGroupRef.current) {
      const children = fishGroupRef.current.children;
      for (let i = 0; i < fishes.length; i++) {
        const f = fishes[i];
        const fishObj = children[i];
        if (!fishObj) continue;

        // Posição longitudinal ao longo do rio (-52 a +52)
        const span = 104;
        const rawZ = f.zStart + f.dir * t * f.speed;
        const wrappedZ = ((((rawZ + 52) % span) + span) % span) - 52;

        // Oscilação lateral natural de nado + curva do rio
        const swimWave = Math.sin(t * 2.6 + f.phase) * 0.45;
        const worldX = getRiverCenterX(wrappedZ) + f.laneOffset + swimWave;

        // Leve salto ocasional na flor d'água
        const jumpWave = Math.max(0, Math.sin(t * 1.6 + f.jumpPhase) - 0.84) * 1.85;
        const worldY = -0.155 + jumpWave;

        // Ângulo de direção acompanhando a curva do rio e a ondulação do corpo
        const riverAngle = getRiverTangentAngle(wrappedZ);
        const bodyWiggle = Math.cos(t * 2.6 + f.phase) * 0.14 * f.dir;
        const baseHeading = f.dir > 0 ? riverAngle : riverAngle + Math.PI;

        fishObj.position.set(worldX, worldY, wrappedZ);
        fishObj.rotation.set(
          jumpWave > 0.02 ? -0.35 * f.dir : 0,
          baseHeading + bodyWiggle,
          0
        );

        // Movimento rápido da nadadeira caudal (rabo do peixe)
        const tail = tailRefs.current[i];
        if (tail) {
          tail.rotation.y = Math.sin(t * 14 + f.phase) * 0.48;
        }

        // Ondulação circular na água ao redor do peixe
        const ripple = rippleRefs.current[i];
        if (ripple) {
          const pulse = (t * 1.5 + f.phase) % 1;
          const rScale = 0.5 + pulse * 1.2;
          ripple.scale.set(rScale, rScale, 1);
        }
      }
    }
  });

  return (
    <group>
      {/* 1. Margem Gramada Ribeirinha */}
      <mesh geometry={bankGeo} position={[0, -0.218, 0]} receiveShadow>
        <meshStandardMaterial
          color={nightMode ? "#1e3a1f" : "#4d7c3f"}
          roughness={0.92}
        />
      </mesh>

      {/* 2. Leito Escuro do Rio */}
      <mesh geometry={bedGeo} position={[0, -0.208, 0]}>
        <meshStandardMaterial
          color={nightMode ? "#081c24" : "#164e63"}
          roughness={0.85}
        />
      </mesh>

      {/* 3. Superfície de Água Corrente Cristalina */}
      <mesh geometry={waterGeo} position={[0, -0.172, 0]}>
        <meshStandardMaterial
          map={waterTexture}
          color={nightMode ? "#0284c7" : "#38bdf8"}
          emissive={nightMode ? "#0369a1" : "#0284c7"}
          emissiveIntensity={nightMode ? 0.25 : 0.35}
          roughness={0.14}
          metalness={0.15}
          transparent
          opacity={0.78}
        />
      </mesh>

      {/* 4. Pedras e Vegetação nas Margens do Rio */}
      {riverProps.rocks.map((rk, idx) => (
        <mesh
          key={`rrock-${idx}`}
          position={[rk.x, -0.16, rk.z]}
          rotation={[0.2, rk.rot, 0.1]}
          scale={[rk.s * 1.3, rk.s * 0.75, rk.s]}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={rk.col} roughness={0.85} />
        </mesh>
      ))}

      {riverProps.reeds.map((rd, idx) => (
        <group key={`rreed-${idx}`} position={[rd.x, -0.2, rd.z]} rotation={[0, rd.rot, 0]}>
          <mesh position={[0, rd.h * 0.5, 0]} rotation={[0.08, 0, -0.1]}>
            <coneGeometry args={[0.12, rd.h, 5]} />
            <meshStandardMaterial color={nightMode ? "#14532d" : "#16a34a"} roughness={0.75} />
          </mesh>
          <mesh position={[0.12, rd.h * 0.42, 0.08]} rotation={[-0.1, 0, 0.14]}>
            <coneGeometry args={[0.1, rd.h * 0.85, 5]} />
            <meshStandardMaterial color={nightMode ? "#166534" : "#22c55e"} roughness={0.75} />
          </mesh>
        </group>
      ))}

      {/* 5. Cardume de Peixes 3D Animados Nadando no Rio */}
      <group ref={fishGroupRef}>
        {fishes.map((f, idx) => (
          <group key={`fish-${f.id}`} scale={[f.scale, f.scale, f.scale]}>
            {/* Corpo hidrodinâmico do peixe */}
            <mesh scale={[0.26, 0.15, 0.62]}>
              <sphereGeometry args={[1, 12, 10]} />
              <meshBasicMaterial color={f.bodyColor} toneMapped={false} />
            </mesh>
            {/* Nadadeira dorsal superior */}
            <mesh position={[0, 0.14, -0.05]} rotation={[-0.35, 0, 0]}>
              <boxGeometry args={[0.04, 0.16, 0.26]} />
              <meshBasicMaterial color={f.finColor} toneMapped={false} />
            </mesh>
            {/* Nadadeiras peitorais laterais */}
            <mesh position={[0.22, -0.02, 0.12]} rotation={[0, 0.4, -0.2]}>
              <boxGeometry args={[0.22, 0.025, 0.14]} />
              <meshBasicMaterial color={f.finColor} toneMapped={false} />
            </mesh>
            <mesh position={[-0.22, -0.02, 0.12]} rotation={[0, -0.4, 0.2]}>
              <boxGeometry args={[0.22, 0.025, 0.14]} />
              <meshBasicMaterial color={f.finColor} toneMapped={false} />
            </mesh>
            {/* Olhos do peixe */}
            <mesh position={[0.16, 0.04, 0.42]}>
              <sphereGeometry args={[0.045, 6, 6]} />
              <meshBasicMaterial color="#000000" toneMapped={false} />
            </mesh>
            <mesh position={[-0.16, 0.04, 0.42]}>
              <sphereGeometry args={[0.045, 6, 6]} />
              <meshBasicMaterial color="#000000" toneMapped={false} />
            </mesh>
            {/* Nadadeira caudal animada (rabo que balança) */}
            <mesh
              ref={(el) => { tailRefs.current[idx] = el; }}
              position={[0, 0, -0.62]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[0.35, 1, 1.15]}
            >
              <coneGeometry args={[0.24, 0.42, 4]} />
              <meshBasicMaterial color={f.finColor} toneMapped={false} />
            </mesh>
            {/* Anel de ondulação suave na flor d'água */}
            <mesh
              ref={(el) => { rippleRefs.current[idx] = el; }}
              position={[0, 0.06, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[0.35, 0.44, 16]} />
              <meshBasicMaterial color="#e0f2fe" transparent opacity={0.32} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 6. Árvores 3D Compostas (Tronco, Galhos e Copa Multi-Camadas) */}
      {trees.map((tr) => (
        <group
          key={`tree-${tr.id}`}
          position={[tr.x, -0.22, tr.z]}
          rotation={[0, tr.rotY, 0]}
          scale={[tr.scale, tr.scale, tr.scale]}
        >
          {/* Base das raízes e tronco principal */}
          <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.20, 0.36, 2.1, 8]} />
            <meshStandardMaterial color={nightMode ? "#2e1f14" : "#5c4033"} roughness={0.9} />
          </mesh>
          {/* Galhos secundários */}
          <mesh position={[0.32, 1.85, 0.12]} rotation={[0.15, 0, -0.55]} castShadow>
            <cylinderGeometry args={[0.09, 0.15, 1.0, 6]} />
            <meshStandardMaterial color={nightMode ? "#2e1f14" : "#5c4033"} roughness={0.9} />
          </mesh>
          <mesh position={[-0.28, 1.75, -0.15]} rotation={[-0.2, 0, 0.5]} castShadow>
            <cylinderGeometry args={[0.08, 0.14, 0.95, 6]} />
            <meshStandardMaterial color={nightMode ? "#2e1f14" : "#5c4033"} roughness={0.9} />
          </mesh>
          {/* Copa folhosa em 4 volumes orgânicos */}
          <mesh position={[0, 2.75, 0]} scale={[1.45, 1.15, 1.45]} castShadow receiveShadow>
            <dodecahedronGeometry args={[1.05, 1]} />
            <meshStandardMaterial color={tr.crown.main} roughness={0.78} />
          </mesh>
          <mesh position={[-0.72, 2.35, 0.45]} scale={[1.1, 0.95, 1.1]} castShadow receiveShadow>
            <dodecahedronGeometry args={[0.92, 1]} />
            <meshStandardMaterial color={tr.crown.sec} roughness={0.75} />
          </mesh>
          <mesh position={[0.75, 2.42, -0.38]} scale={[1.15, 0.98, 1.12]} castShadow receiveShadow>
            <dodecahedronGeometry args={[0.9, 1]} />
            <meshStandardMaterial color={tr.crown.sec} roughness={0.75} />
          </mesh>
          <mesh position={[0.08, 3.45, 0.12]} scale={[1.05, 0.9, 1.05]} castShadow receiveShadow>
            <dodecahedronGeometry args={[0.85, 1]} />
            <meshStandardMaterial color={tr.crown.top} roughness={0.72} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------
// 3D SCENE SUBCOMPONENTS (React Three Fiber)
// ---------------------------------------------------------

function RailSegment({ start, end, highlight }: { start: [number, number, number], end: [number, number, number], highlight?: boolean }) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.hypot(dx, dz);
  const cx = (start[0] + end[0]) / 2;
  const cy = (start[1] + end[1]) / 2;
  const cz = (start[2] + end[2]) / 2;
  const angleY = Math.atan2(dx, dz);

  return (
    <mesh position={[cx, cy, cz]} rotation={[0, angleY, 0]} receiveShadow>
      <boxGeometry args={[0.08, 0.15, length]} />
      <meshStandardMaterial color={highlight ? "#6366f1" : "#71717a"} metalness={0.8} roughness={0.2} />
    </mesh>
  );
}

function AnimatedPoint({ hinge, tipTargetX, tipZ, amvIndex }: { hinge: [number, number, number], tipTargetX: number, tipZ: number, amvIndex?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const { hazardAmvs, isDanger } = useContext(SimHazardContext);
  const isFail = Math.abs(Math.abs(tipTargetX) - 0.65) < 0.02;
  const isHazard = isFail || (amvIndex !== undefined && Boolean(hazardAmvs[amvIndex]));

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    if (meshRef.current.userData.tipX === undefined) {
      meshRef.current.userData.tipX = tipTargetX;
    }

    meshRef.current.userData.tipX = THREE.MathUtils.lerp(meshRef.current.userData.tipX, tipTargetX, 8 * delta);
    const tipX = meshRef.current.userData.tipX;

    const dx = tipX - hinge[0];
    const dz = tipZ - hinge[2];
    const length = Math.hypot(dx, dz);
    const angleY = Math.atan2(dx, dz);

    meshRef.current.position.set((hinge[0] + tipX) / 2, hinge[1], (hinge[2] + tipZ) / 2);
    meshRef.current.rotation.y = angleY;
    meshRef.current.scale.set(1, 1, length);

    if (matRef.current) {
      if (isHazard) {
        const pulse = (Math.sin(state.clock.elapsedTime * 10) + 1) * 0.5;
        const alertColor = isFail || isDanger ? '#ef4444' : '#f59e0b';
        matRef.current.color.set(alertColor);
        matRef.current.emissive.set(alertColor);
        matRef.current.emissiveIntensity = 0.4 + pulse * 1.8;
      } else {
        matRef.current.color.set('#fbbf24');
        matRef.current.emissive.set('#000000');
        matRef.current.emissiveIntensity = 0;
      }
    }
  });

  return (
    <mesh ref={meshRef} receiveShadow>
      <boxGeometry args={[0.07, 0.17, 1]} />
      <meshStandardMaterial ref={matRef} color="#fbbf24" metalness={0.8} roughness={0.15} toneMapped={false} />
    </mesh>
  );
}

function TieBar({ getLeftTipX, getRightTipX, tipZ, ringOffsetZ = -2.85 }: { getLeftTipX: () => number, getRightTipX: () => number, tipZ: number, amvIndex?: number, ringOffsetZ?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const targetX = useRef({ left: getLeftTipX(), right: getRightTipX() });
  const prevLeftRef = useRef<number>(getLeftTipX());
  const activeTimerRef = useRef<number>(0);
  const { isDanger } = useContext(SimHazardContext);

  useEffect(() => {
    const newLeft = getLeftTipX();
    const newRight = getRightTipX();
    targetX.current = { left: newLeft, right: newRight };

    if (Math.abs(newLeft - prevLeftRef.current) > 0.005) {
      activeTimerRef.current = 1.0;
      prevLeftRef.current = newLeft;
    }
  }, [getLeftTipX, getRightTipX]);

  const isFail = Math.abs(Math.abs(targetX.current.left) - 0.65) < 0.02;

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    if (meshRef.current.userData.lx === undefined) {
      meshRef.current.userData.lx = targetX.current.left;
      meshRef.current.userData.rx = targetX.current.right;
    }

    meshRef.current.userData.lx = THREE.MathUtils.lerp(meshRef.current.userData.lx, targetX.current.left, 8 * delta);
    meshRef.current.userData.rx = THREE.MathUtils.lerp(meshRef.current.userData.rx, targetX.current.right, 8 * delta);
    
    const lx = meshRef.current.userData.lx;
    const rx = meshRef.current.userData.rx;
    const cx = (lx + rx) / 2;
    const width = rx - lx + 0.2;

    meshRef.current.position.set(cx, -0.05, tipZ);
    meshRef.current.scale.set(width, 1, 1);

    if (activeTimerRef.current > 0) {
      activeTimerRef.current = Math.max(0, activeTimerRef.current - delta * 1.85);
    }

    const showRing = isFail || activeTimerRef.current > 0;
    if (ringRef.current && ringMatRef.current) {
      ringRef.current.visible = showRing;
      if (showRing) {
        // Center directly over the yellow switch blades
        ringRef.current.position.set(cx * 0.5, 0.03, tipZ + ringOffsetZ);
        if (activeTimerRef.current > 0) {
          // Single smooth blink: 0 -> 1 -> 0 once
          const progress = 1.0 - activeTimerRef.current;
          const singleBlink = Math.sin(progress * Math.PI);
          const s = 0.92 + progress * 0.28;
          ringRef.current.scale.set(s, s, 1);
          ringMatRef.current.opacity = singleBlink * 0.85;
        } else {
          // Continuous warning pulse only when AMV is in FALHA state
          const pulse = (Math.sin(state.clock.elapsedTime * 6) + 1) * 0.5;
          const s = 0.95 + pulse * 0.22;
          ringRef.current.scale.set(s, s, 1);
          ringMatRef.current.opacity = 0.3 + (1 - pulse) * 0.55;
        }
        ringMatRef.current.color.set(isFail || isDanger ? '#ef4444' : '#f59e0b');
      }
    }
  });

  return (
    <group>
      <mesh ref={meshRef} receiveShadow>
        <boxGeometry args={[1, 0.04, 0.1]} />
        <meshStandardMaterial color="#ef4444" metalness={0.3} roughness={0.7} />
      </mesh>
      <mesh ref={ringRef} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, tipZ - 2.85]}>
        <ringGeometry args={[1.15, 1.5, 32]} />
        <meshBasicMaterial ref={ringMatRef} color="#ef4444" transparent opacity={0.75} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

function SwitchMachine({ getLeftTipX, tipZ, isLeftSide = false, isReverse, offsetX }: { getLeftTipX: () => number, tipZ: number, isLeftSide?: boolean, isReverse?: boolean, offsetX?: number }) {
  const machineRef = useRef<THREE.Group>(null);
  const rodRef = useRef<THREE.Mesh>(null);
  const leverRef = useRef<THREE.Group>(null);
  const flagMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const flagGroupRef = useRef<THREE.Group>(null);
  const targetX = useRef({ left: getLeftTipX() });
  const machinePosX = offsetX !== undefined ? offsetX : (isLeftSide ? -1.8 : 1.8);
  
  useEffect(() => {
    targetX.current = { left: getLeftTipX() };
  }, [getLeftTipX]);

  useFrame((state, delta) => {
    if (!machineRef.current || !rodRef.current || !leverRef.current) return;
    
    if (machineRef.current.userData.lx === undefined) {
      machineRef.current.userData.lx = targetX.current.left;
    }
    
    machineRef.current.userData.lx = THREE.MathUtils.lerp(machineRef.current.userData.lx, targetX.current.left, 8 * delta);
    const lx = machineRef.current.userData.lx;
    
    const machineConnectX = machinePosX + (isLeftSide ? 0.2 : -0.2);
    const tipConnectX = lx;
    const rodLen = Math.abs(machineConnectX - tipConnectX);
    const rodCx = (machineConnectX + tipConnectX) / 2;
    
    rodRef.current.position.set(rodCx, -0.05, 0);
    rodRef.current.scale.set(rodLen, 1, 1);
    
    const progress = (lx - (-0.8)) / 0.3; // 0 to 1
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const targetProgress = isReverse !== undefined ? (isReverse ? 1 : 0) : clampedProgress;
    if (machineRef.current.userData.prog === undefined) {
      machineRef.current.userData.prog = targetProgress;
    }
    machineRef.current.userData.prog = THREE.MathUtils.lerp(machineRef.current.userData.prog, targetProgress, 8 * delta);
    const animProg = machineRef.current.userData.prog;
    leverRef.current.rotation.z = THREE.MathUtils.lerp(-Math.PI / 4, Math.PI / 4, animProg);

    if (flagGroupRef.current) {
      flagGroupRef.current.rotation.y = THREE.MathUtils.lerp(0, Math.PI, animProg);
    }

    if (flagMatRef.current) {
      const reversed = isReverse !== undefined ? isReverse : progress >= 0.5;
      const targetColor = reversed ? '#eab308' : '#16a34a';
      flagMatRef.current.color.lerp(new THREE.Color(targetColor), 8 * delta);
    }
  });

  return (
    <group position={[0, 0, tipZ]}>
      <mesh ref={rodRef} receiveShadow castShadow>
        <boxGeometry args={[1, 0.05, 0.05]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} />
      </mesh>
      
      <group position={[machinePosX, -0.1, 0]} ref={machineRef}>
        <mesh receiveShadow castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.7, 0.2, 0.5]} />
          <meshStandardMaterial color="#475569" metalness={0.4} roughness={0.7} />
        </mesh>
        <mesh receiveShadow castShadow position={[0, 0.12, -0.08]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.7, 16]} />
          <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* Alavanca e Articulação */}
        <group position={[0, 0.1, 0.15]}>
          <group ref={leverRef}>
            {/* Eixo / Dobradiça base */}
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, 0.08]} />
              <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.4} />
            </mesh>
            
            {/* Haste metálica */}
            <mesh position={[0, 0.2, 0]} castShadow>
              <cylinderGeometry args={[0.025, 0.025, 0.4]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
            </mesh>

            {/* Puxador (Grip) vermelho no topo */}
            <mesh position={[0, 0.4, 0]} castShadow>
              <capsuleGeometry args={[0.035, 0.1, 4, 16]} />
              <meshStandardMaterial color="#ef4444" roughness={0.6} />
            </mesh>
          </group>
        </group>
        
        {/* Bandeirola (Target) */}
        <group ref={flagGroupRef} position={[0, 0.3, -0.08]}>
          {/* Mastro da bandeirola */}
          <mesh position={[0, 0.15, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.3]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
          {/* Placa da bandeirola */}
          <mesh position={[0, 0.35, 0]} castShadow>
            <boxGeometry args={[0.4, 0.3, 0.05]} />
            <meshStandardMaterial ref={flagMatRef} color="#15803d" roughness={0.6} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR LINHAS CARGA GERAL 02
// ---------------------------------------------------------

function getCargaGeral02Track1X(z: number) {
  if (z >= 25) return 0;
  if (z <= 5) return -5.0;
  const u = (25 - z) / 20; // 0 to 1
  return -5.0 * (3 * u ** 2 - 2 * u ** 3);
}

function getCargaGeral02Track2X(z: number) {
  if (z >= 10) return 0;
  if (z <= -10) return -2.5;
  const u = (10 - z) / 20; // 0 to 1
  return -2.5 * (3 * u ** 2 - 2 * u ** 3);
}

// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR LINHA DO FREIO
// ---------------------------------------------------------

// AMV 1 (65B) curves right from z=18 to z=-2, reaching x=2.5
function getFreioTrack1X(z: number) {
  if (z >= 18) return 0;
  if (z <= -2) return 2.5;
  const u = (18 - z) / 20; // 0 to 1
  return 2.5 * (3 * u ** 2 - 2 * u ** 3);
}

function getFreioTrack2X(z: number) {
  if (z >= -2) return 2.5;
  if (z <= -22) return 5.0;
  const u = (-2 - z) / 20; // 0 to 1
  return 2.5 + 2.5 * (3 * u ** 2 - 2 * u ** 3);
}

// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR LINHAS DO FREIO 02 (3 AMVs)
// ---------------------------------------------------------
function getFreio02Track1X(z: number, side: 'L' | 'R') {
  if (z >= 25) return 0;
  if (z <= 15) return side === 'L' ? -1.5 : 1.5;
  const u = (25 - z) / 10; // 0 to 1
  const factor = 1.5 * (3 * u ** 2 - 2 * u ** 3);
  return side === 'L' ? -factor : factor;
}

function getFreio02Track2X(z: number, side: 'L' | 'R') {
  if (z >= 10) return -1.5;
  if (z <= -2) return side === 'L' ? -3.0 : -1.0;
  const u = (10 - z) / 12; // 0 to 1
  const t = 3 * u ** 2 - 2 * u ** 3;
  return side === 'L' ? -1.5 - 1.5 * t : -1.5 + 0.5 * t;
}

function getFreio02Track3X(z: number, side: 'L' | 'R') {
  if (z >= 10) return 1.5;
  if (z <= -2) return side === 'L' ? 1.0 : 3.0;
  const u = (10 - z) / 12; // 0 to 1
  const t = 3 * u ** 2 - 2 * u ** 3;
  return side === 'L' ? 1.5 - 0.5 * t : 1.5 + 1.5 * t;
}

// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR OFICINA
// ---------------------------------------------------------
function getOficinaTrack1X(z: number) {
  if (z >= 25) return 0;
  const u = Math.min(1, (25 - z) / 80); // z=25 -> 0, z=-55 -> 1 (continuous curve to the left)
  return -(5.8 * u + 6.2 * u * u + 3.5 * u * u * u);
}

function getOficinaTrack2X(z: number) {
  if (z >= 8) return 0;
  const u = Math.min(1, (8 - z) / 63); // z=8 -> 0, z=-55 -> 1 (continuous curve to the left)
  return -(4.6 * u + 3.8 * u * u + 1.6 * u * u * u);
}

function getOficinaTrack3X(z: number) {
  if (z >= -12) return 0;
  const u = Math.min(1, (-12 - z) / 43); // z=-12 -> 0, z=-55 -> 1 (same continuous left-curve style as L-166)
  return -(3.1 * u + 2.2 * u * u + 1.2 * u * u * u);
}

// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR PN OFICINA
// ---------------------------------------------------------
function getPnOficinaTrack1X(z: number) {
  if (z >= 5) return 0; // Starts curving at z = 5 (closer to 0)
  if (z <= -15) return -2.5; // Ends at x = -2.5 (L-159)
  const u = (5 - z) / 20; // 0 to 1
  return -2.5 * (3 * u ** 2 - 2 * u ** 3);
}

// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR RECLASSIFICACAO
// ---------------------------------------------------------
function getReclassificacaoTrack1X(z: number) {
  if (z >= 25) return 0;
  if (z <= 5) return -5.0;
  const u = (25 - z) / 20; // 0 to 1
  return -5.0 * (3 * u ** 2 - 2 * u ** 3);
}

function getReclassificacaoTrack2X(z: number) {
  if (z >= 5) return -5.0; // starts at the end of track1
  if (z <= -15) return -2.5;
  const u = (5 - z) / 20; // 0 to 1
  return -5.0 + 2.5 * (3 * u ** 2 - 2 * u ** 3);
}

// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR RECLASSIFICACAO 02 (watchSystem15)
// Tracks: L-109A (Foreground Center Trunk, x=0) -> L-109 (Left, x=-3.8), L-122 (Middle-Left Branch, x=-1.9), L-121 (Straight Continuation, x=0)
// 3 AMVs:
// - AMV 1 (z = 15, x = 0): L-109A -> Straight L-121/122 / Reverse Left crossover to L-109
// - AMV 2 (z = -5, x = -3.8): Trailing convergence on L-109 (Left approach trunk vs AMV 1 crossover)
// - AMV 3 (z = -15, x = 0): Upper turnout -> Straight L-121 (x=0) / Reverse Left to L-122 (x=-1.9)
// ---------------------------------------------------------
function getReclassificacao02Crossover109X(z: number) {
  if (z >= 17) return 0;
  if (z <= -8) return -3.8;
  const u = (17 - z) / 25;
  return -3.8 * (3 * u * u - 2 * u * u * u);
}

function getReclassificacao02LeftTrunk109X(z: number) {
  if (z <= 4) return -3.8;
  const w = Math.min(1, (z - 4) / 51);
  return -3.8 - 4.2 * (w * w);
}

function getReclassificacao02UpperBranch122X(z: number) {
  if (z >= -15) return 0;
  if (z <= -32) return -1.9;
  const u = (-15 - z) / 17;
  return -1.9 * (3 * u * u - 2 * u * u * u);
}


// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR PASSAGEIRO 01 (TP-3A, TP-2A, TP-01)
// All 3 tracks curve to the left matching the real yard photo
// ---------------------------------------------------------
function getPassageiro01TrackTP01X(z: number) {
  if (z >= 20) return 0;
  const u = Math.min(1, (20 - z) / 75); // z=20 -> 0, z=-55 -> 1
  return -14.5 * (0.65 * u * u + 0.35 * u * u * u);
}

function getPassageiro01TrackTP2AX(z: number) {
  if (z >= 25) return 0;
  const u = Math.min(1, (25 - z) / 80); // z=25 -> 0, z=-55 -> 1
  return -7.8 * u - 6.2 * u * u - 4.0 * u * u * u;
}

function getPassageiro01TrackTP3AX(z: number) {
  if (z >= 5) return getPassageiro01TrackTP2AX(z);
  const w = Math.min(1, (5 - z) / 60); // z=5 -> 0, z=-55 -> 1
  return getPassageiro01TrackTP2AX(z) - (4.8 * w + 0.4 * w * w);
}

// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR OFICINA CENTRAL (watchSystem12)
// Tracks from left to right: L-158 (5KM), L-160, L-161, L-162, L-163, L-164, L-165
// ---------------------------------------------------------
function getOficinaCentralTrack158X(z: number) {
  if (z >= -5) return -11.5;
  const u = Math.min(1, (-5 - z) / 50);
  return -11.5 - 3.0 * (0.65 * u * u + 0.35 * u * u * u);
}

function getOficinaCentralTrack162X(_z: number) {
  return -1.2;
}

function getOficinaCentralTrack161X(z: number) {
  if (z >= 25) return -1.2;
  if (z <= 5) return -4.0;
  const u = (25 - z) / 20;
  return -1.2 - 2.8 * (3 * u * u - 2 * u * u * u);
}

function getOficinaCentralTrack160X(z: number) {
  if (z >= 5) return getOficinaCentralTrack161X(z);
  if (z <= -15) return -6.8;
  const u = (5 - z) / 20;
  return -4.0 - 2.8 * (3 * u * u - 2 * u * u * u);
}

function getOficinaCentralTrack165X(_z: number) {
  return 7.6;
}

function getOficinaCentralTrack164X(z: number) {
  if (z >= 25) return 7.6;
  if (z <= 5) return 4.8;
  const u = (25 - z) / 20;
  return 7.6 - 2.8 * (3 * u * u - 2 * u * u * u);
}

function getOficinaCentralTrack163X(z: number) {
  if (z >= 5) return getOficinaCentralTrack164X(z);
  if (z <= -15) return 2.0;
  const u = (5 - z) / 20;
  return 4.8 - 2.8 * (3 * u * u - 2 * u * u * u);
}

// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR LINHAS ABAIXO DO GALPÃO DA OFICINA (watchSystem14)
// Tracks from left to right: L-166, L-165, L-164, L-163, L-162, L-161, L-160, L-173 (5KM ABAIXO DA PN)
// ---------------------------------------------------------
function getAbaixoOficinaTrack166X(_z: number) {
  return -10.6;
}


function getAbaixoOficinaTrack165X(z: number) {
  if (z >= 22) return -4.0;
  if (z <= -21) return -10.6;
  const u = (22 - z) / 43;
  const s3 = 3 * u * u - 2 * u * u * u;
  return -4.0 - 6.6 * (0.45 * u + 0.55 * s3);
}

function getAbaixoOficinaTrack162X(_z: number) {
  return 1.6;
}

function getAbaixoOficinaTrack163X(z: number) {
  if (z >= 26) return 1.6;
  if (z <= 6) return -1.2;
  const u = (26 - z) / 20;
  const s3 = 3 * u * u - 2 * u * u * u;
  return 1.6 - 2.8 * (0.32 * u + 0.68 * s3);
}

function getAbaixoOficinaTrack164X(z: number) {
  if (z >= 6) return getAbaixoOficinaTrack163X(z);
  if (z <= -18) return -6.8;
  const u = (6 - z) / 24;
  const s3 = 3 * u * u - 2 * u * u * u;
  return -1.2 - 5.6 * s3;
}

function getAbaixoOficinaTrack173X(z: number) {
  if (z >= 14) return 1.6;
  if (z <= -38) return 10.8;
  const knots = [
    { z: 14, x: 1.60, m: 0.00 },
    { z: 9,  x: 2.12, m: 0.22 },
    { z: 0,  x: 4.85, m: 0.14 },
    { z: -5, x: 5.35, m: 0.18 },
    { z: -13, x: 7.65, m: 0.14 },
    { z: -18, x: 8.15, m: 0.18 },
    { z: -38, x: 10.80, m: 0.00 },
  ];
  for (let i = 0; i < knots.length - 1; i++) {
    const k0 = knots[i];
    const k1 = knots[i + 1];
    if (z <= k0.z && z >= k1.z) {
      const h = k0.z - k1.z;
      const u = (k0.z - z) / h;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      return h00 * k0.x + h10 * (h * k0.m) + h01 * k1.x + h11 * (h * k1.m);
    }
  }
  return 10.8;
}

function getAbaixoOficinaTrack161X(z: number) {
  if (z >= 0) return getAbaixoOficinaTrack173X(z);
  if (z <= -18) return 4.4;
  const xStart = getAbaixoOficinaTrack173X(0);
  const u = (0 - z) / 18;
  const s3 = 3 * u * u - 2 * u * u * u;
  return xStart + (4.4 - xStart) * s3;
}

function getAbaixoOficinaTrack160X(z: number) {
  if (z >= -13) return getAbaixoOficinaTrack173X(z);
  if (z <= -31) return 7.2;
  const xStart = getAbaixoOficinaTrack173X(-13);
  const u = (-13 - z) / 18;
  const s3 = 3 * u * u - 2 * u * u * u;
  return xStart + (7.2 - xStart) * s3;
}

// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR PASSAGEIRO 02 (watchSystem13)
// Tracks from left to right: TP-05, TP-04, TP-3B, TP-2B
// ---------------------------------------------------------
function getPassageiro02TrackTP3BX(_z: number) {
  return -1.2;
}

function getPassageiro02TrackTP04X(z: number) {
  if (z >= 25) return -1.2;
  if (z <= 5) return -4.2;
  const u = (25 - z) / 20;
  return -1.2 - 3.0 * (3 * u * u - 2 * u * u * u);
}

function getPassageiro02TrackTP05X(z: number) {
  if (z >= 5) return getPassageiro02TrackTP04X(z);
  if (z <= -15) return -7.2;
  const u = (5 - z) / 20;
  return -4.2 - 3.0 * (3 * u * u - 2 * u * u * u);
}

function getPassageiro02TrackTP2BX(_z: number) {
  return 2.8;
}

function getPassageiro02CrossoverX(z: number) {
  if (z >= 25) return 2.8;
  if (z <= -10) return -1.2;
  const u = (25 - z) / 35;
  const s3 = 3 * u * u - 2 * u * u * u;
  return 2.8 - 4.0 * (0.65 * u + 0.35 * s3);
}

function Sleepers({ layoutType }: { layoutType: LayoutType }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const ballastRef = useRef<THREE.InstancedMesh>(null);
  const shoulderRef = useRef<THREE.InstancedMesh>(null);
  const stonesRef = useRef<THREE.InstancedMesh>(null);

  // Textura procedural de brita ferroviária (pedra britada de granito/basalto com relevo)
  const { ballastMap, ballastBumpMap } = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d')!;

    ctx.fillStyle = '#44403c';
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#303030';
    bCtx.fillRect(0, 0, size, size);

    let seed = 4242;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const rockPalette = [
      '#78716c', '#57534e', '#a8a29e', '#6b7280',
      '#4b5563', '#8c7f70', '#9ca3af', '#52525b',
      '#7c6855', '#64748b', '#d6d3d1', '#3f3f46',
    ];

    // Desenha milhares de fragmentos angulares de pedra britada
    for (let i = 0; i < 6500; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const rx = 2.2 + rand() * 5.2;
      const ry = 1.8 + rand() * 4.5;
      const rot = rand() * Math.PI * 2;
      const col = rockPalette[Math.floor(rand() * rockPalette.length)];

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);

      // Sombra entre as britas
      ctx.fillStyle = 'rgba(18, 16, 14, 0.55)';
      ctx.fillRect(-rx * 0.55, -ry * 0.55, rx * 1.15, ry * 1.15);

      // Pedra angular
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.5, -ry * 0.3);
      ctx.lineTo(0, -ry * 0.6);
      ctx.lineTo(rx * 0.55, -ry * 0.2);
      ctx.lineTo(rx * 0.4, ry * 0.5);
      ctx.lineTo(-rx * 0.35, ry * 0.55);
      ctx.closePath();
      ctx.fill();

      // Faceta iluminada da brita
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(-rx * 0.25, -ry * 0.3, rx * 0.45, ry * 0.35);
      ctx.restore();

      const bVal = Math.floor(110 + rand() * 145);
      bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      bCtx.fillRect(cx - rx * 0.4, cy - ry * 0.4, rx * 0.85, ry * 0.85);
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2.2, 0.75);
    map.colorSpace = THREE.SRGBColorSpace;

    const bump = new THREE.CanvasTexture(bumpCanvas);
    bump.wrapS = THREE.RepeatWrapping;
    bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(2.2, 0.75);

    return { ballastMap: map, ballastBumpMap: bump };
  }, []);

  const sleepersData = useMemo(() => {
    const list: { x: number; z: number; width: number; rotY: number }[] = [];
    const tw = 1.9;
    const add = (x: number, z: number, width = tw, rotY = 0) => list.push({ x, z, width, rotY });

    if (layoutType === 'freio') {
      for (let z = 55; z > 18; z -= 0.6) {
        add(0, z);
      }
      for (let z = 18; z > -2; z -= 0.6) {
        add(0, z);
        add(getFreioTrack1X(z), z);
      }
      for (let z = -2; z > -22; z -= 0.6) {
        add(0, z);
        add(2.5, z);
        add(getFreioTrack2X(z), z);
      }
      for (let z = -22; z >= -55; z -= 0.6) {
        add(0, z);
        add(2.5, z);
        add(5.0, z);
      }
    } else if (layoutType === 'freio_02') {
      for (let z = 55; z > 25; z -= 0.6) {
        add(0, z);
      }
      for (let z = 25; z > 10; z -= 0.6) {
        add(getFreio02Track1X(z, 'L'), z);
        add(getFreio02Track1X(z, 'R'), z);
      }
      for (let z = 10; z >= -55; z -= 0.6) {
        add(z >= -2 ? getFreio02Track2X(z, 'L') : -3.0, z);
        add(z >= -2 ? getFreio02Track2X(z, 'R') : -1.0, z);
        add(z >= -2 ? getFreio02Track3X(z, 'L') : 1.0, z);
        add(z >= -2 ? getFreio02Track3X(z, 'R') : 3.0, z);
      }
    } else if (layoutType === 'oficina') {
      for (let z = 55; z >= -55; z -= 0.6) {
        add(0, z, tw, 0);
        if (z <= 25) {
          const x1 = getOficinaTrack1X(z);
          const rot1 = Math.atan2(getOficinaTrack1X(z - 0.5) - getOficinaTrack1X(z + 0.5), -1.0);
          add(x1, z, tw, rot1);
        }
        if (z <= 8) {
          const x2 = getOficinaTrack2X(z);
          const rot2 = Math.atan2(getOficinaTrack2X(z - 0.5) - getOficinaTrack2X(z + 0.5), -1.0);
          add(x2, z, tw, rot2);
        }
        if (z <= -12) {
          const x3 = getOficinaTrack3X(z);
          const rot3 = Math.atan2(getOficinaTrack3X(z - 0.5) - getOficinaTrack3X(z + 0.5), -1.0);
          add(x3, z, tw, rot3);
        }
      }
    } else if (layoutType === 'reclassificacao') {
      for (let z = 55; z >= -55; z -= 0.6) add(0, z);
      for (let z = 25; z >= -55; z -= 0.6) add(z >= 5 ? getReclassificacaoTrack1X(z) : -5.0, z);
      for (let z = 5; z >= -55; z -= 0.6) add(z >= -15 ? getReclassificacaoTrack2X(z) : -2.5, z);
    } else if (layoutType === 'carga_geral_02') {
      for (let z = 55; z >= -55; z -= 0.6) add(0, z);
      for (let z = 25; z >= -55; z -= 0.6) add(z >= 5 ? getCargaGeral02Track1X(z) : -5.0, z);
      for (let z = 10; z >= -55; z -= 0.6) add(z >= -10 ? getCargaGeral02Track2X(z) : -2.5, z);
    } else if (layoutType === 'pn_oficina') {
      for (let z = 55; z >= -55; z -= 0.6) add(0, z);
      for (let z = 5; z >= -55; z -= 0.6) add(z >= -15 ? getPnOficinaTrack1X(z) : -2.5, z);
    } else if (layoutType === 'patio_oficina') {
      for (let z = 55; z >= -55; z -= 0.6) add(0, z);
      for (let z = 20; z >= -55; z -= 0.6) add(z >= 0 ? getPatioOficinaTrack1X(z) : 5.0, z);
      for (let z = 0; z >= -55; z -= 0.6) add(z >= -20 ? getPatioOficinaTrack2X(z) : -5.0, z);
      for (let z = -20; z >= -55; z -= 0.6) add(z >= -40 ? getPatioOficinaTrack3X(z) : -5.0, z);
      for (let z = 55; z >= -55; z -= 0.6) add(-10, z);
    } else if (layoutType === 'passageiro_01') {
      for (let z = 55; z > 25; z -= 0.6) {
        add(0, z, tw, 0);
      }
      for (let z = 25; z >= -55; z -= 0.6) {
        const x1 = getPassageiro01TrackTP01X(z);
        const rot1 = Math.atan2(getPassageiro01TrackTP01X(z - 0.5) - getPassageiro01TrackTP01X(z + 0.5), -1.0);
        add(x1, z, tw, rot1);

        const x2 = getPassageiro01TrackTP2AX(z);
        const rot2 = Math.atan2(getPassageiro01TrackTP2AX(z - 0.5) - getPassageiro01TrackTP2AX(z + 0.5), -1.0);
        add(x2, z, tw, rot2);

        if (z <= 5) {
          const x3 = getPassageiro01TrackTP3AX(z);
          const rot3 = Math.atan2(getPassageiro01TrackTP3AX(z - 0.5) - getPassageiro01TrackTP3AX(z + 0.5), -1.0);
          add(x3, z, tw, rot3);
        }
      }
    } else if (layoutType === 'passageiro_02') {
      for (let z = 55; z >= -55; z -= 0.6) {
        // TP-3B (Center-Right Trunk Straight at x = -1.2)
        add(-1.2, z, tw, 0);

        // TP-2B (Far-Right Trunk Straight at x = 2.8)
        add(2.8, z, tw, 0);

        // Diagonal Crossover from AMV TP-2B (z=25, x=2.8) stretched forward to AMV TP-3B (z=-10, x=-1.2)
        if (z <= 25 && z >= -10) {
          const xCross = getPassageiro02CrossoverX(z);
          const rotCross = Math.atan2(getPassageiro02CrossoverX(z - 0.5) - getPassageiro02CrossoverX(z + 0.5), -1.0);
          add(xCross, z, tw, rotCross);
        }

        // TP-04 (Center-Left Branch from AMV 1 at z=25)
        if (z <= 25) {
          const x04 = getPassageiro02TrackTP04X(z);
          const rot04 = Math.atan2(getPassageiro02TrackTP04X(z - 0.5) - getPassageiro02TrackTP04X(z + 0.5), -1.0);
          add(x04, z, tw, rot04);
        }

        // TP-05 (Far-Left Branch from AMV 2 at z=5)
        if (z <= 5) {
          const x05 = getPassageiro02TrackTP05X(z);
          const rot05 = Math.atan2(getPassageiro02TrackTP05X(z - 0.5) - getPassageiro02TrackTP05X(z + 0.5), -1.0);
          add(x05, z, tw, rot05);
        }
      }
    } else if (layoutType === 'oficina_central') {
      for (let z = 55; z >= -55; z -= 0.6) {
        // L-158 (Far Left 5KM)
        const x158 = getOficinaCentralTrack158X(z);
        const rot158 = Math.atan2(getOficinaCentralTrack158X(z - 0.5) - getOficinaCentralTrack158X(z + 0.5), -1.0);
        add(x158, z, tw, rot158);

        // L-162 (Center Trunk Straight)
        add(-1.2, z, tw, 0);

        // L-161 (Center-Left Branch from AMV 1 at z=25)
        if (z <= 25) {
          const x161 = getOficinaCentralTrack161X(z);
          const rot161 = Math.atan2(getOficinaCentralTrack161X(z - 0.5) - getOficinaCentralTrack161X(z + 0.5), -1.0);
          add(x161, z, tw, rot161);
        }

        // L-160 (Outer-Left Branch from AMV 2 at z=5)
        if (z <= 5) {
          const x160 = getOficinaCentralTrack160X(z);
          const rot160 = Math.atan2(getOficinaCentralTrack160X(z - 0.5) - getOficinaCentralTrack160X(z + 0.5), -1.0);
          add(x160, z, tw, rot160);
        }

        // L-165 (Right Trunk Straight)
        add(7.6, z, tw, 0);

        // L-164 (Right-Middle Branch from AMV 3 at z=25)
        if (z <= 25) {
          const x164 = getOficinaCentralTrack164X(z);
          const rot164 = Math.atan2(getOficinaCentralTrack164X(z - 0.5) - getOficinaCentralTrack164X(z + 0.5), -1.0);
          add(x164, z, tw, rot164);
        }

        // L-163 (Right-Inner Branch from AMV 4 at z=5)
        if (z <= 5) {
          const x163 = getOficinaCentralTrack163X(z);
          const rot163 = Math.atan2(getOficinaCentralTrack163X(z - 0.5) - getOficinaCentralTrack163X(z + 0.5), -1.0);
          add(x163, z, tw, rot163);
        }
      }
    } else if (layoutType === 'abaixo_oficina') {
      for (let z = 55; z >= -55; z -= 0.6) {
        // 1. L-166 (Far Left under Blue Canopy at x = -10.6: goes from z = 55 up to z = -21 where it connects to L-165)
        if (z >= -21) {
          add(-10.6, z, tw, 0);
        }

        // 2. L-165 (starts at x = -4.0 from z = 55..22, then curves to -10.6 at z = -21.. -55)
        const x165 = getAbaixoOficinaTrack165X(z);
        const rot165 = Math.atan2(getAbaixoOficinaTrack165X(z - 0.5) - getAbaixoOficinaTrack165X(z + 0.5), -1.0);
        add(x165, z, tw, rot165);

        // 3. Right Trunk: L-162 (straight at x = 1.6) & L-163 (branches left at AMV 1 z=26)
        // Extended sleepers at AMV 1 (z=26..21) and AMV 2 (z=8..3) on the right side for switch stands
        if (z <= 27 && z >= 21) {
          add(2.05, z, tw + 0.9, 0);
        } else {
          add(1.6, z, tw, 0);
        }

        if (z <= 26) {
          const x163 = getAbaixoOficinaTrack163X(z);
          const rot163 = Math.atan2(getAbaixoOficinaTrack163X(z - 0.5) - getAbaixoOficinaTrack163X(z + 0.5), -1.0);
          add(x163, z, tw, rot163);
        }

        // 3B. L-164 (branches left from L-163 at AMV 5 z=6)
        if (z <= 6) {
          const x164 = getAbaixoOficinaTrack164X(z);
          const rot164 = Math.atan2(getAbaixoOficinaTrack164X(z - 0.5) - getAbaixoOficinaTrack164X(z + 0.5), -1.0);
          add(x164, z, tw, rot164);
        }

        // 4. L-173 (grande puxada em curva para a direita a partir do AMV 2 em z=14)
        if (z <= 14) {
          const x173 = getAbaixoOficinaTrack173X(z);
          const rot173 = Math.atan2(getAbaixoOficinaTrack173X(z - 0.5) - getAbaixoOficinaTrack173X(z + 0.5), -1.0);
          add(x173, z, tw, rot173);
        }

        // 5. L-161 (ligada à L-173 no AMV 4 em z=0, fazendo curva para a esquerda)
        if (z <= 0) {
          const x161 = getAbaixoOficinaTrack161X(z);
          const rot161 = Math.atan2(getAbaixoOficinaTrack161X(z - 0.5) - getAbaixoOficinaTrack161X(z + 0.5), -1.0);
          add(x161, z, tw, rot161);
        }

        // 6. L-160 (ligada à L-173 no AMV 6 em z=-13, fazendo curva para a esquerda)
        if (z <= -13) {
          const x160 = getAbaixoOficinaTrack160X(z);
          const rot160 = Math.atan2(getAbaixoOficinaTrack160X(z - 0.5) - getAbaixoOficinaTrack160X(z + 0.5), -1.0);
          add(x160, z, tw, rot160);
        }
      }
    } else if (layoutType === 'reclassificacao_02') {
      for (let z = 55; z >= -55; z -= 0.65) {
        // 1. Tronco Central L-109A -> L-121 (x = 0)
        add(0, z, tw, 0);

        // 2. Ramo Esquerdo e Linha L-109 (vem da esquerda em z=55 até x=-3.8 em z=4 e segue reto até z=-55)
        const x109L = getReclassificacao02LeftTrunk109X(z);
        const rot109L = Math.atan2(getReclassificacao02LeftTrunk109X(z - 0.5) - getReclassificacao02LeftTrunk109X(z + 0.5), -1.0);
        add(x109L, z, tw, rot109L);

        // 3. Travessão diagonal AMV 1 -> AMV 2 (z=17 até z=-8)
        if (z <= 17 && z >= -8) {
          const xCross = getReclassificacao02Crossover109X(z);
          const rotCross = Math.atan2(getReclassificacao02Crossover109X(z - 0.5) - getReclassificacao02Crossover109X(z + 0.5), -1.0);
          add(xCross, z, tw, rotCross);
        }

        // 4. Ramo superior AMV 3 para L-122 (de z=-15 até z=-55 alinhando em x=-1.9)
        if (z <= -15) {
          const xUpper = getReclassificacao02UpperBranch122X(z);
          const rotUpper = Math.atan2(getReclassificacao02UpperBranch122X(z - 0.5) - getReclassificacao02UpperBranch122X(z + 0.5), -1.0);
          add(xUpper, z, tw, rotUpper);
        }
      }
    } else {
      for (let z = 55; z > 5; z -= 0.6) {
        add(0, z);
      }
      for (let z = 5; z >= -10; z -= 0.6) {
        let outerRightX = 0;
        if (z >= 0) {
          outerRightX = 0.8 + (5 - z) * 0.2;
        } else {
          const u = -z / 25;
          const branchCx = -3.4 * (u ** 3) + 2.6 * (u ** 2) + 5.0 * u + 1.0;
          outerRightX = branchCx + 0.8;
        }
        const width = (outerRightX + 0.8) + 0.3;
        const cx = (-0.8 + outerRightX) / 2;
        add(cx, z, width, 0);
      }
      for (let z = -10.6; z >= -55; z -= 0.6) {
        add(0, z);
        const u = -z / 25;
        const branchCx = -3.4 * (u ** 3) + 2.6 * (u ** 2) + 5.0 * u + 1.0;
        const dxdz = (-10.2 * u * u + 5.2 * u + 5.0) / -25;
        add(branchCx, z, tw, Math.atan(dxdz));
      }
    }
    return list;
  }, [layoutType]);

  // Pedras de brita 3D espalhadas nas bordas e entre os dormentes
  const stonesCount = sleepersData.length * 4;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    const ballast = ballastRef.current;
    const shoulder = shoulderRef.current;
    const stones = stonesRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < sleepersData.length; i++) {
      const s = sleepersData[i];
      // Dormente
      dummy.position.set(s.x, -0.145, s.z);
      dummy.rotation.set(0, s.rotY, 0);
      dummy.scale.set(s.width, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Leito superior de brita sob os dormentes
      if (ballast) {
        dummy.position.set(s.x, -0.188, s.z);
        dummy.rotation.set(0, s.rotY, 0);
        dummy.scale.set(s.width + (layoutType === 'abaixo_oficina' ? 0.25 : 0.95), 1, 1);
        dummy.updateMatrix();
        ballast.setMatrixAt(i, dummy.matrix);
      }

      // Base chanfrada (saia de brita) em contato com a areia
      if (shoulder) {
        dummy.position.set(s.x, -0.212, s.z);
        dummy.rotation.set(0, s.rotY, 0);
        dummy.scale.set(s.width + (layoutType === 'abaixo_oficina' ? 0.50 : 1.65), 1, 1);
        dummy.updateMatrix();
        shoulder.setMatrixAt(i, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (ballast) ballast.instanceMatrix.needsUpdate = true;
    if (shoulder) shoulder.instanceMatrix.needsUpdate = true;

    if (stones) {
      let seed = 9001;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      const stoneColors = [
        new THREE.Color('#78716c'),
        new THREE.Color('#57534e'),
        new THREE.Color('#a8a29e'),
        new THREE.Color('#6b7280'),
        new THREE.Color('#8c7a6b'),
        new THREE.Color('#4b5563'),
      ];
      for (let i = 0; i < sleepersData.length; i++) {
        const s = sleepersData[i];
        const halfW = s.width * 0.5;
        for (let k = 0; k < 4; k++) {
          const idx = i * 4 + k;
          // Posiciona pedras de brita 3D nas ombreiras (esquerda/direita) e entre dormentes
          const side = k % 2 === 0 ? -1 : 1;
          const offsetX = k < 2
            ? side * (halfW + 0.15 + rand() * 0.65)
            : (rand() - 0.5) * (s.width + 0.8);
          const offsetZ = (rand() - 0.5) * 0.6;
          const yPos = k < 2 ? -0.195 - rand() * 0.02 : -0.152;
          dummy.position.set(
            s.x + offsetX * Math.cos(s.rotY),
            yPos,
            s.z + offsetZ - offsetX * Math.sin(s.rotY)
          );
          dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
          const sc = 0.7 + rand() * 0.95;
          dummy.scale.set(sc * 1.2, sc * 0.75, sc);
          dummy.updateMatrix();
          stones.setMatrixAt(idx, dummy.matrix);
          stones.setColorAt(idx, stoneColors[Math.floor(rand() * stoneColors.length)]);
        }
      }
      stones.instanceMatrix.needsUpdate = true;
      if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
    }
  }, [sleepersData]);

  return (
    <group>
      {/* Saia inferior do lastro de brita sobre a areia */}
      <instancedMesh
        key={`shoulder-${layoutType}-${sleepersData.length}`}
        ref={shoulderRef}
        args={[undefined, undefined, sleepersData.length]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 0.032, 0.72]} />
        <meshStandardMaterial
          map={ballastMap}
          bumpMap={ballastBumpMap}
          bumpScale={0.06}
          color="#9ca3af"
          roughness={0.95}
          metalness={0.05}
        />
      </instancedMesh>

      {/* Leito principal elevado de brita */}
      <instancedMesh
        key={`ballast-${layoutType}-${sleepersData.length}`}
        ref={ballastRef}
        args={[undefined, undefined, sleepersData.length]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 0.055, 0.66]} />
        <meshStandardMaterial
          map={ballastMap}
          bumpMap={ballastBumpMap}
          bumpScale={0.075}
          color="#b5b0a8"
          roughness={0.92}
          metalness={0.06}
        />
      </instancedMesh>

      {/* Pedras de brita 3D espalhadas no lastro */}
      <instancedMesh
        key={`stones-${layoutType}-${stonesCount}`}
        ref={stonesRef}
        args={[undefined, undefined, stonesCount]}
        receiveShadow
        frustumCulled={false}
      >
        <dodecahedronGeometry args={[0.048, 0]} />
        <meshStandardMaterial roughness={0.9} metalness={0.08} />
      </instancedMesh>

      {/* Dormentes assentados na brita */}
      <instancedMesh
        key={`sleepers-${layoutType}-${sleepersData.length}`}
        ref={meshRef}
        args={[undefined, undefined, sleepersData.length]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 0.09, 0.25]} />
        <meshStandardMaterial color="#3b3530" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

function LedFlow({ layoutType, direction, amvs, spawnLine, routeColor }: { layoutType: LayoutType, direction: Direction, amvs: SwitchState[], spawnLine: SpawnLine, routeColor?: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const time = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const darkColor = useMemo(() => new THREE.Color('#141418'), []);

  const numLeds = 80;
  
  const points = useMemo(() => {
    const pts: { x: number; y: number; z: number; progress: number; side: string; color: string }[] = [];
    let prevPos: [number, number, number] | null = null;
    
    for (let i = 0; i <= numLeds; i++) {
      const progress = i / numLeds; // 0 to 1
      const res = getRoutePosRot(layoutType, direction, amvs, progress, 0, spawnLine);
      
      if (prevPos) {
        const distSq = (res.pos[0] - prevPos[0])**2 + (res.pos[2] - prevPos[2])**2;
        if (distSq < 0.0001) {
          break;
        }
      }
      prevPos = [...res.pos] as [number, number, number];

      const angle = res.rot[1];
      const dx = Math.cos(angle) * 0.8;
      const dz = -Math.sin(angle) * 0.8;

      pts.push({ x: res.pos[0] - dx, y: 0.015, z: res.pos[2] - dz, progress, side: 'L', color: res.color });
      pts.push({ x: res.pos[0] + dx, y: 0.015, z: res.pos[2] + dz, progress, side: 'R', color: res.color });
    }
    return pts;
  }, [layoutType, direction, amvs, spawnLine]);

  useFrame((state, delta) => {
    time.current += delta * 1.5;
    const mesh = meshRef.current;
    if (!mesh || points.length === 0) return;

    const speed = direction === 'NORTE_SUL' ? time.current * -12 : time.current * 12;

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const wave = Math.sin(pt.z * 0.5 - speed) * 0.5 + 0.5;
      const intensity = wave > 0.35 ? (wave - 0.35) / 0.65 : 0;

      dummy.position.set(pt.x, pt.y, pt.z);
      const scale = 0.75 + intensity * 0.55;
      dummy.scale.set(scale, 1 + intensity * 0.8, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const hex = routeColor === '#ef4444' ? '#ef4444' : pt.color;
      tempColor.set(hex).lerp(darkColor, 1 - Math.min(1, intensity * 1.15));
      if (intensity > 0.5) {
        tempColor.multiplyScalar(1 + (intensity - 0.5) * 1.6);
      }
      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (points.length === 0) return null;

  return (
    <instancedMesh
      key={`leds-${layoutType}-${direction}-${points.length}`}
      ref={meshRef}
      args={[undefined, undefined, points.length]}
      frustumCulled={false}
    >
      <boxGeometry args={[0.2, 0.025, 0.2]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function CurveBranch({ layoutType }: { layoutType: LayoutType }) {
  const elements = useMemo(() => {
    const segments = 25;
    const rails: React.ReactNode[] = [];
  
  if (layoutType === 'freio') {
    // -----------------------------------------------------
    // AMV 1 (65B) - Right Curve Stock Rail (18 to -2)
    // -----------------------------------------------------
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      const z1 = 18 - 20 * u1;
      const z2 = 18 - 20 * u2;
      const x1 = getFreioTrack1X(z1);
      const x2 = getFreioTrack1X(z2);
      rails.push(<RailSegment key={`R1-${i}`} start={[x1 + 0.8, 0, z1]} end={[x2 + 0.8, 0, z2]} />);
    }
    
    // Left Curve Closure Rail (13 to -2)
    const closureSegments = 18;
    for (let i = 0; i < closureSegments; i++) {
      const u1 = i / closureSegments;
      const u2 = (i + 1) / closureSegments;
      const z1 = 13 - 15 * u1;
      const z2 = 13 - 15 * u2;
      const x1 = getFreioTrack1X(z1);
      const x2 = getFreioTrack1X(z2);
      rails.push(<RailSegment key={`L1-${i}`} start={[x1 - 0.8, 0, z1]} end={[x2 - 0.8, 0, z2]} />);
    }
    
    // Straight extension for AMV 1 branch from z=-2 to z=-55 (Line 2)
    // Left rail is continuous
    rails.push(<RailSegment key="branch1-L" start={[2.5 - 0.8, 0, -2]} end={[2.5 - 0.8, 0, -55]} />);
    // Right rail has a gap for AMV 2 (65A) between -2 and -7 (suas agulhas móveis)
    rails.push(<RailSegment key="branch1-R2" start={[2.5 + 0.8, 0, -7]} end={[2.5 + 0.8, 0, -55]} />);

    // -----------------------------------------------------
    // AMV 2 (65A) - Right Curve Stock Rail (-2 to -22)
    // -----------------------------------------------------
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      const z1 = -2 - 20 * u1;
      const z2 = -2 - 20 * u2;
      const x1 = getFreioTrack2X(z1);
      const x2 = getFreioTrack2X(z2);
      rails.push(<RailSegment key={`R2-stock-${i}`} start={[x1 + 0.8, 0, z1]} end={[x2 + 0.8, 0, z2]} />);
    }
    
    // Left Curve Closure Rail (-7 to -22) (inicia 5 unidades de Z depois da ponta)
    for (let i = 0; i < closureSegments; i++) {
      const u1 = i / closureSegments;
      const u2 = (i + 1) / closureSegments;
      const z1 = -7 - 15 * u1;
      const z2 = -7 - 15 * u2;
      const x1 = getFreioTrack2X(z1);
      const x2 = getFreioTrack2X(z2);
      rails.push(<RailSegment key={`L2-closure-${i}`} start={[x1 - 0.8, 0, z1]} end={[x2 - 0.8, 0, z2]} />);
    }
    
    // Straight extension for AMV 2 branch from z=-22 to z=-55 (Line 3)
    rails.push(<RailSegment key="branch2-L" start={[5.0 - 0.8, 0, -22]} end={[5.0 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="branch2-R" start={[5.0 + 0.8, 0, -22]} end={[5.0 + 0.8, 0, -55]} />);
  } else if (layoutType === 'freio_02') {
    // S-curve rails para AMV 1 (distribui centro x=0 para x=-1.5 e x=1.5)
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      
      const z1 = 25 - 10 * u1;
      const z2 = 25 - 10 * u2;
      
      const x1L = getFreio02Track1X(z1, 'L');
      const x2L = getFreio02Track1X(z2, 'L');
      const x1R = getFreio02Track1X(z1, 'R');
      const x2R = getFreio02Track1X(z2, 'R');
      
      rails.push(<RailSegment key={`L1-L-${i}`} start={[x1L - 0.8, 0, z1]} end={[x2L - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`L1-R-${i}`} start={[x1L + 0.8, 0, z1]} end={[x2L + 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`R1-L-${i}`} start={[x1R - 0.8, 0, z1]} end={[x2R - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`R1-R-${i}`} start={[x1R + 0.8, 0, z1]} end={[x2R + 0.8, 0, z2]} />);
    }

    // Trecho reto intermediário entre z=15 e z=10
    rails.push(<RailSegment key="inter-L-L" start={[-1.5 - 0.8, 0, 15]} end={[-1.5 - 0.8, 0, 10]} />);
    rails.push(<RailSegment key="inter-L-R" start={[-1.5 + 0.8, 0, 15]} end={[-1.5 + 0.8, 0, 10]} />);
    rails.push(<RailSegment key="inter-R-L" start={[1.5 - 0.8, 0, 15]} end={[1.5 - 0.8, 0, 10]} />);
    rails.push(<RailSegment key="inter-R-R" start={[1.5 + 0.8, 0, 15]} end={[1.5 + 0.8, 0, 10]} />);

    // S-curve rails para AMV 2 (linha esquerda, distribui x=-1.5 para L-02 x=-3.0 e L-01 x=-1.0)
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      
      const z1 = 10 - 12 * u1;
      const z2 = 10 - 12 * u2;
      
      const x1L = getFreio02Track2X(z1, 'L');
      const x2L = getFreio02Track2X(z2, 'L');
      const x1R = getFreio02Track2X(z1, 'R');
      const x2R = getFreio02Track2X(z2, 'R');
      
      rails.push(<RailSegment key={`L2-L-${i}`} start={[x1L - 0.8, 0, z1]} end={[x2L - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`L2-R-${i}`} start={[x1L + 0.8, 0, z1]} end={[x2L + 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`R2-L-${i}`} start={[x1R - 0.8, 0, z1]} end={[x2R - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`R2-R-${i}`} start={[x1R + 0.8, 0, z1]} end={[x2R + 0.8, 0, z2]} />);
    }

    // S-curve rails para AMV 3 (linha direita, distribui x=1.5 para L-128 x=1.0 e linha extra x=3.0)
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      
      const z1 = 10 - 12 * u1;
      const z2 = 10 - 12 * u2;
      
      const x1L = getFreio02Track3X(z1, 'L');
      const x2L = getFreio02Track3X(z2, 'L');
      const x1R = getFreio02Track3X(z1, 'R');
      const x2R = getFreio02Track3X(z2, 'R');
      
      rails.push(<RailSegment key={`L3-L-${i}`} start={[x1L - 0.8, 0, z1]} end={[x2L - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`L3-R-${i}`} start={[x1L + 0.8, 0, z1]} end={[x2L + 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`R3-L-${i}`} start={[x1R - 0.8, 0, z1]} end={[x2R - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`R3-R-${i}`} start={[x1R + 0.8, 0, z1]} end={[x2R + 0.8, 0, z2]} />);
    }

    // Extensões retas finais no Norte de z=-2 a z=-45
    rails.push(<RailSegment key="final-L02-L" start={[-3.0 - 0.8, 0, -2]} end={[-3.0 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="final-L02-R" start={[-3.0 + 0.8, 0, -2]} end={[-3.0 + 0.8, 0, -55]} />);
    rails.push(<RailSegment key="final-L01-L" start={[-1.0 - 0.8, 0, -2]} end={[-1.0 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="final-L01-R" start={[-1.0 + 0.8, 0, -2]} end={[-1.0 + 0.8, 0, -55]} />);
    rails.push(<RailSegment key="final-L128-L" start={[1.0 - 0.8, 0, -2]} end={[1.0 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="final-L128-R" start={[1.0 + 0.8, 0, -2]} end={[1.0 + 0.8, 0, -55]} />);
    rails.push(<RailSegment key="final-extra-L" start={[3.0 - 0.8, 0, -2]} end={[3.0 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="final-extra-R" start={[3.0 + 0.8, 0, -2]} end={[3.0 + 0.8, 0, -55]} />);
  } else if (layoutType === 'oficina') {
    // -----------------------------------------------------
    // Oficina Layout Rails (3 AMVs branching left: L-167 curved left, L-166 curved left, L-165 & Reta)
    // -----------------------------------------------------
    const curveSegs1 = 36;
    const curveSegs2 = 32;
    const curveSegs3 = 20;

    // Main line (straight from 55 to -55 at x = 0)
    // Left rail has 5m blade gaps for AMV 1 [25..20], AMV 2 [8..3], and AMV 3 [-12..-17]
    rails.push(<RailSegment key="m-L-pre1" start={[-0.8, 0, 55]} end={[-0.8, 0, 25]} />);
    rails.push(<RailSegment key="m-L-mid12" start={[-0.8, 0, 20]} end={[-0.8, 0, 8]} />);
    rails.push(<RailSegment key="m-L-mid23" start={[-0.8, 0, 3]} end={[-0.8, 0, -12]} />);
    rails.push(<RailSegment key="m-L-post3" start={[-0.8, 0, -17]} end={[-0.8, 0, -55]} />);

    // Right rail is continuous (stock rail)
    rails.push(<RailSegment key="m-R" start={[0.8, 0, 55]} end={[0.8, 0, -55]} />);

    // Branch 1 (L-167) - Curves continuously to the left from z=25 to z=-55
    for (let i = 0; i < curveSegs1; i++) {
      const u1 = i / curveSegs1;
      const u2 = (i + 1) / curveSegs1;
      const z1_L = 25 - 80 * u1;
      const z2_L = 25 - 80 * u2;
      rails.push(<RailSegment key={`of-1-L-${i}`} start={[getOficinaTrack1X(z1_L) - 0.8, 0, z1_L]} end={[getOficinaTrack1X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = 20 - 75 * u1;
      const z2_R = 20 - 75 * u2;
      rails.push(<RailSegment key={`of-1-R-${i}`} start={[getOficinaTrack1X(z1_R) + 0.8, 0, z1_R]} end={[getOficinaTrack1X(z2_R) + 0.8, 0, z2_R]} />);
    }

    // Branch 2 (L-166 - Linha do Sopro) - Curves continuously to the left from z=8 to z=-55
    for (let i = 0; i < curveSegs2; i++) {
      const u1 = i / curveSegs2;
      const u2 = (i + 1) / curveSegs2;
      const z1_L = 8 - 63 * u1;
      const z2_L = 8 - 63 * u2;
      rails.push(<RailSegment key={`of-2-L-${i}`} start={[getOficinaTrack2X(z1_L) - 0.8, 0, z1_L]} end={[getOficinaTrack2X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = 3 - 58 * u1;
      const z2_R = 3 - 58 * u2;
      rails.push(<RailSegment key={`of-2-R-${i}`} start={[getOficinaTrack2X(z1_R) + 0.8, 0, z1_R]} end={[getOficinaTrack2X(z2_R) + 0.8, 0, z2_R]} />);
    }

    // Branch 3 (L-165) - Curves continuously to the left from z=-12 to z=-55 in the same style as L-166
    const curveSegs3L = 28;
    for (let i = 0; i < curveSegs3L; i++) {
      const u1 = i / curveSegs3L;
      const u2 = (i + 1) / curveSegs3L;
      const z1_L = -12 - 43 * u1;
      const z2_L = -12 - 43 * u2;
      rails.push(<RailSegment key={`of-3-L-${i}`} start={[getOficinaTrack3X(z1_L) - 0.8, 0, z1_L]} end={[getOficinaTrack3X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = -17 - 38 * u1;
      const z2_R = -17 - 38 * u2;
      rails.push(<RailSegment key={`of-3-R-${i}`} start={[getOficinaTrack3X(z1_R) + 0.8, 0, z1_R]} end={[getOficinaTrack3X(z2_R) + 0.8, 0, z2_R]} />);
    }

  } else if (layoutType === 'reclassificacao') {
    // -----------------------------------------------------
    // Reclassificação Layout Rails (AMV 1 branches left, AMV 2 on the branch branches right)
    // -----------------------------------------------------
    
    // Main line (straight from 55 to -55)
    // Left rail has gap for AMV 1 closure rails
    rails.push(<RailSegment key="r-m-L-pre1" start={[-0.8, 0, 55]} end={[-0.8, 0, 25]} />);
    rails.push(<RailSegment key="r-m-L-post1" start={[-0.8, 0, 20]} end={[-0.8, 0, -55]} />);

    // Right rail is continuous (stock rail)
    rails.push(<RailSegment key="r-m-R" start={[0.8, 0, 55]} end={[0.8, 0, -55]} />);

    // Branch 1 (L-107A) - Left stock rail curves from 25 to 5. Right closure rail starts at 20.
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      const z1_L = 25 - 20 * u1;
      const z2_L = 25 - 20 * u2;
      const x1_L = getReclassificacaoTrack1X(z1_L);
      const x2_L = getReclassificacaoTrack1X(z2_L);
      rails.push(<RailSegment key={`r-1-L-${i}`} start={[x1_L - 0.8, 0, z1_L]} end={[x2_L - 0.8, 0, z2_L]} />);

      const z1_R = 20 - 15 * u1;
      const z2_R = 20 - 15 * u2;
      const x1_R = getReclassificacaoTrack1X(z1_R);
      const x2_R = getReclassificacaoTrack1X(z2_R);
      rails.push(<RailSegment key={`r-1-R-${i}`} start={[x1_R + 0.8, 0, z1_R]} end={[x2_R + 0.8, 0, z2_R]} />);
    }
    // L-107A straight segment after AMV 1, with a gap on its right rail for AMV 2
    rails.push(<RailSegment key="r-1-str-L" start={[-5.0 - 0.8, 0, 5]} end={[-5.0 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="r-1-str-R-pre2" start={[-5.0 + 0.8, 0, 5]} end={[-5.0 + 0.8, 0, 5]} />); // Actually AMV 2 starts at z=5
    rails.push(<RailSegment key="r-1-str-R-post2" start={[-5.0 + 0.8, 0, 0]} end={[-5.0 + 0.8, 0, -55]} />);

    // Branch 2 (L-106A) - Right stock rail curves from 5 to -15. Left closure rail starts at 0.
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      const z1_R = 5 - 20 * u1;
      const z2_R = 5 - 20 * u2;
      const x1_R = getReclassificacaoTrack2X(z1_R);
      const x2_R = getReclassificacaoTrack2X(z2_R);
      rails.push(<RailSegment key={`r-2-R-${i}`} start={[x1_R + 0.8, 0, z1_R]} end={[x2_R + 0.8, 0, z2_R]} />);

      const z1_L = 0 - 15 * u1;
      const z2_L = 0 - 15 * u2;
      const x1_L = getReclassificacaoTrack2X(z1_L);
      const x2_L = getReclassificacaoTrack2X(z2_L);
      rails.push(<RailSegment key={`r-2-L-${i}`} start={[x1_L - 0.8, 0, z1_L]} end={[x2_L - 0.8, 0, z2_L]} />);
    }
    // L-106A straight segment after branch
    rails.push(<RailSegment key="r-2-str-L" start={[-2.5 - 0.8, 0, -15]} end={[-2.5 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="r-2-str-R" start={[-2.5 + 0.8, 0, -15]} end={[-2.5 + 0.8, 0, -55]} />);

  } else if (layoutType === 'carga_geral_02') {
    // -----------------------------------------------------
    // Carga Geral 02 Layout Rails (2 AMVs branching left)
    // -----------------------------------------------------
    
    // Main line (straight from 55 to -55) L-22A
    rails.push(<RailSegment key="cg-m-L-pre1" start={[-0.8, 0, 55]} end={[-0.8, 0, 25]} />);
    rails.push(<RailSegment key="cg-m-L-mid" start={[-0.8, 0, 20]} end={[-0.8, 0, 10]} />);
    rails.push(<RailSegment key="cg-m-L-post2" start={[-0.8, 0, 5]} end={[-0.8, 0, -55]} />);
    rails.push(<RailSegment key="cg-m-R" start={[0.8, 0, 55]} end={[0.8, 0, -55]} />);

    // Branch 1 (Auxiliar / L-24A) - AMV 1 at z=25 curves to x=-5.0
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      const z1_L = 25 - 20 * u1;
      const z2_L = 25 - 20 * u2;
      const x1_L = getCargaGeral02Track1X(z1_L);
      const x2_L = getCargaGeral02Track1X(z2_L);
      rails.push(<RailSegment key={`cg-1-L-${i}`} start={[x1_L - 0.8, 0, z1_L]} end={[x2_L - 0.8, 0, z2_L]} />);

      const z1_R = 20 - 15 * u1;
      const z2_R = 20 - 15 * u2;
      const x1_R = getCargaGeral02Track1X(z1_R);
      const x2_R = getCargaGeral02Track1X(z2_R);
      rails.push(<RailSegment key={`cg-1-R-${i}`} start={[x1_R + 0.8, 0, z1_R]} end={[x2_R + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="cg-1-str-L" start={[-5.0 - 0.8, 0, 5]} end={[-5.0 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="cg-1-str-R" start={[-5.0 + 0.8, 0, 5]} end={[-5.0 + 0.8, 0, -55]} />);

    // Branch 2 (L-23A) - AMV 2 at z=10 curves to x=-2.5
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      const z1_L = 10 - 20 * u1;
      const z2_L = 10 - 20 * u2;
      const x1_L = getCargaGeral02Track2X(z1_L);
      const x2_L = getCargaGeral02Track2X(z2_L);
      rails.push(<RailSegment key={`cg-2-L-${i}`} start={[x1_L - 0.8, 0, z1_L]} end={[x2_L - 0.8, 0, z2_L]} />);

      const z1_R = 5 - 15 * u1;
      const z2_R = 5 - 15 * u2;
      const x1_R = getCargaGeral02Track2X(z1_R);
      const x2_R = getCargaGeral02Track2X(z2_R);
      rails.push(<RailSegment key={`cg-2-R-${i}`} start={[x1_R + 0.8, 0, z1_R]} end={[x2_R + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="cg-2-str-L" start={[-2.5 - 0.8, 0, -10]} end={[-2.5 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="cg-2-str-R" start={[-2.5 + 0.8, 0, -10]} end={[-2.5 + 0.8, 0, -55]} />);

  } else if (layoutType === 'pn_oficina') {
    // -----------------------------------------------------
    // PN Oficina Layout Rails (1 AMV branching left)
    // -----------------------------------------------------
    
    // Main line (straight from 55 to -55) L-173
    rails.push(<RailSegment key="pno-m-L-pre1" start={[-0.8, 0, 55]} end={[-0.8, 0, 5]} />);
    rails.push(<RailSegment key="pno-m-L-post1" start={[-0.8, 0, 0]} end={[-0.8, 0, -55]} />);
    rails.push(<RailSegment key="pno-m-R" start={[0.8, 0, 55]} end={[0.8, 0, -55]} />);

    // Branch (L-159) - AMV 1 at z=5 curves to x=-2.5
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      const z1_L = 5 - 20 * u1;
      const z2_L = 5 - 20 * u2;
      const x1_L = getPnOficinaTrack1X(z1_L);
      const x2_L = getPnOficinaTrack1X(z2_L);
      rails.push(<RailSegment key={`pno-1-L-${i}`} start={[x1_L - 0.8, 0, z1_L]} end={[x2_L - 0.8, 0, z2_L]} />);

      const z1_R = 0 - 15 * u1; // Starts at 0 due to frog
      const z2_R = 0 - 15 * u2;
      const x1_R = getPnOficinaTrack1X(z1_R);
      const x2_R = getPnOficinaTrack1X(z2_R);
      rails.push(<RailSegment key={`pno-1-R-${i}`} start={[x1_R + 0.8, 0, z1_R]} end={[x2_R + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="pno-1-str-L" start={[-2.5 - 0.8, 0, -15]} end={[-2.5 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="pno-1-str-R" start={[-2.5 + 0.8, 0, -15]} end={[-2.5 + 0.8, 0, -55]} />);

  } else if (layoutType === 'passageiro_01') {
    // -----------------------------------------------------
    // Passageiro 01 Layout Rails (TP-3A, TP-2A, TP-01 all curving left in the same smooth style)
    // -----------------------------------------------------
    const curveSegs = 45;

    // Foreground single track before AMV 1 (z=55 to z=25)
    rails.push(<RailSegment key="p1-in-L" start={[-0.8, 0, 55]} end={[-0.8, 0, 25]} />);
    rails.push(<RailSegment key="p1-in-R" start={[0.8, 0, 55]} end={[0.8, 0, 25]} />);

    // Track TP-01 (Rightmost track, curves left from z=20 to z=-55)
    rails.push(<RailSegment key="tp01-R-blade" start={[0.8, 0, 25]} end={[0.8, 0, 20]} />);
    for (let i = 0; i < curveSegs; i++) {
      const u1 = i / curveSegs;
      const u2 = (i + 1) / curveSegs;
      const z1 = 20 - 75 * u1;
      const z2 = 20 - 75 * u2;
      const x1 = getPassageiro01TrackTP01X(z1);
      const x2 = getPassageiro01TrackTP01X(z2);
      rails.push(<RailSegment key={`tp01-L-${i}`} start={[x1 - 0.8, 0, z1]} end={[x2 - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`tp01-R-${i}`} start={[x1 + 0.8, 0, z1]} end={[x2 + 0.8, 0, z2]} />);
    }

    // Track TP-2A (Middle track, same smooth left curve style from z=25 to z=-55)
    // Left stock rail alongside AMV 1 blades (z=25 to z=20)
    const bladeSegs = 4;
    for (let i = 0; i < bladeSegs; i++) {
      const z1 = 25 - 5 * (i / bladeSegs);
      const z2 = 25 - 5 * ((i + 1) / bladeSegs);
      const x1 = getPassageiro01TrackTP2AX(z1);
      const x2 = getPassageiro01TrackTP2AX(z2);
      rails.push(<RailSegment key={`tp2a-b1-L-${i}`} start={[x1 - 0.8, 0, z1]} end={[x2 - 0.8, 0, z2]} />);
    }

    // Both rails of TP-2A from z=20 to z=5 (before AMV 2)
    const segsMid = 12;
    for (let i = 0; i < segsMid; i++) {
      const z1 = 20 - 15 * (i / segsMid);
      const z2 = 20 - 15 * ((i + 1) / segsMid);
      const x1 = getPassageiro01TrackTP2AX(z1);
      const x2 = getPassageiro01TrackTP2AX(z2);
      rails.push(<RailSegment key={`tp2a-mid-L-${i}`} start={[x1 - 0.8, 0, z1]} end={[x2 - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`tp2a-mid-R-${i}`} start={[x1 + 0.8, 0, z1]} end={[x2 + 0.8, 0, z2]} />);
    }

    // Right stock rail of TP-2A alongside AMV 2 blades (z=5 to z=0)
    for (let i = 0; i < bladeSegs; i++) {
      const z1 = 5 - 5 * (i / bladeSegs);
      const z2 = 5 - 5 * ((i + 1) / bladeSegs);
      const x1 = getPassageiro01TrackTP2AX(z1);
      const x2 = getPassageiro01TrackTP2AX(z2);
      rails.push(<RailSegment key={`tp2a-b2-R-${i}`} start={[x1 + 0.8, 0, z1]} end={[x2 + 0.8, 0, z2]} />);
    }

    // Both rails of TP-2A from z=0 to z=-55
    for (let i = 0; i < curveSegs; i++) {
      const z1 = 0 - 55 * (i / curveSegs);
      const z2 = 0 - 55 * ((i + 1) / curveSegs);
      const x1 = getPassageiro01TrackTP2AX(z1);
      const x2 = getPassageiro01TrackTP2AX(z2);
      rails.push(<RailSegment key={`tp2a-post-L-${i}`} start={[x1 - 0.8, 0, z1]} end={[x2 - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`tp2a-post-R-${i}`} start={[x1 + 0.8, 0, z1]} end={[x2 + 0.8, 0, z2]} />);
    }

    // Track TP-3A (Leftmost track, same smooth left curve style from z=5 to z=-55)
    // Left stock rail alongside AMV 2 blades (z=5 to z=0)
    for (let i = 0; i < bladeSegs; i++) {
      const z1 = 5 - 5 * (i / bladeSegs);
      const z2 = 5 - 5 * ((i + 1) / bladeSegs);
      const x1 = getPassageiro01TrackTP3AX(z1);
      const x2 = getPassageiro01TrackTP3AX(z2);
      rails.push(<RailSegment key={`tp3a-b2-L-${i}`} start={[x1 - 0.8, 0, z1]} end={[x2 - 0.8, 0, z2]} />);
    }

    // Both rails of TP-3A from z=0 to z=-55
    for (let i = 0; i < curveSegs; i++) {
      const z1 = 0 - 55 * (i / curveSegs);
      const z2 = 0 - 55 * ((i + 1) / curveSegs);
      const x1 = getPassageiro01TrackTP3AX(z1);
      const x2 = getPassageiro01TrackTP3AX(z2);
      rails.push(<RailSegment key={`tp3a-post-L-${i}`} start={[x1 - 0.8, 0, z1]} end={[x2 - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`tp3a-post-R-${i}`} start={[x1 + 0.8, 0, z1]} end={[x2 + 0.8, 0, z2]} />);
    }
  } else if (layoutType === 'passageiro_02') {
    const segs = 22;

    // 1. TP-3B (Center-Right Trunk Straight at x = -1.2, with blade gap for AMV TP-04 from z=25 to z=20 on left rail, and AMV TP-3B from z=-5 to z=-10 on right rail)
    rails.push(<RailSegment key="p2-tp3b-L-pre" start={[-1.2 - 0.8, 0, 55]} end={[-1.2 - 0.8, 0, 25]} />);
    rails.push(<RailSegment key="p2-tp3b-L-post" start={[-1.2 - 0.8, 0, 20]} end={[-1.2 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="p2-tp3b-R-pre" start={[-1.2 + 0.8, 0, 55]} end={[-1.2 + 0.8, 0, -5]} />);
    rails.push(<RailSegment key="p2-tp3b-R-post" start={[-1.2 + 0.8, 0, -10]} end={[-1.2 + 0.8, 0, -55]} />);

    // 2. TP-04 (Center-Left Branch from AMV TP-04 at z=25 to x = -4.2)
    for (let i = 0; i < segs; i++) {
      const u1 = i / segs;
      const u2 = (i + 1) / segs;
      const z1_L = 25 - 20 * u1;
      const z2_L = 25 - 20 * u2;
      rails.push(<RailSegment key={`p2-tp04-cL-${i}`} start={[getPassageiro02TrackTP04X(z1_L) - 0.8, 0, z1_L]} end={[getPassageiro02TrackTP04X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = 20 - 15 * u1;
      const z2_R = 20 - 15 * u2;
      rails.push(<RailSegment key={`p2-tp04-cR-${i}`} start={[getPassageiro02TrackTP04X(z1_R) + 0.8, 0, z1_R]} end={[getPassageiro02TrackTP04X(z2_R) + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="p2-tp04-L-post" start={[-4.2 - 0.8, 0, 0]} end={[-4.2 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="p2-tp04-R-post" start={[-4.2 + 0.8, 0, 5]} end={[-4.2 + 0.8, 0, -55]} />);

    // 3. TP-05 (Far-Left Branch from AMV TP-05 at z=5 to x = -7.2)
    for (let i = 0; i < segs; i++) {
      const u1 = i / segs;
      const u2 = (i + 1) / segs;
      const z1_L = 5 - 20 * u1;
      const z2_L = 5 - 20 * u2;
      rails.push(<RailSegment key={`p2-tp05-cL-${i}`} start={[getPassageiro02TrackTP05X(z1_L) - 0.8, 0, z1_L]} end={[getPassageiro02TrackTP05X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = 0 - 15 * u1;
      const z2_R = 0 - 15 * u2;
      rails.push(<RailSegment key={`p2-tp05-cR-${i}`} start={[getPassageiro02TrackTP05X(z1_R) + 0.8, 0, z1_R]} end={[getPassageiro02TrackTP05X(z2_R) + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="p2-tp05-L-str" start={[-7.2 - 0.8, 0, -15]} end={[-7.2 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="p2-tp05-R-str" start={[-7.2 + 0.8, 0, -15]} end={[-7.2 + 0.8, 0, -55]} />);

    // 4. TP-2B (Far-Right Trunk Straight at x = 2.8)
    rails.push(<RailSegment key="p2-tp2b-L-pre" start={[2.8 - 0.8, 0, 55]} end={[2.8 - 0.8, 0, 25]} />);
    rails.push(<RailSegment key="p2-tp2b-L-post" start={[2.8 - 0.8, 0, 20]} end={[2.8 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="p2-tp2b-R" start={[2.8 + 0.8, 0, 55]} end={[2.8 + 0.8, 0, -55]} />);

    // 5. Travessão Diagonal Esticado (Crossover from AMV TP-2B at z=25, x=2.8 to AMV TP-3B at z=-10, x=-1.2)
    const crossSegs = 28;
    for (let i = 0; i < crossSegs; i++) {
      const u1 = i / crossSegs;
      const u2 = (i + 1) / crossSegs;
      // Left rail runs from z=25 (stock rail of AMV TP-2B) to z=-5 (heel of AMV TP-3B left blade)
      const z1_L = 25 - 30 * u1;
      const z2_L = 25 - 30 * u2;
      rails.push(<RailSegment key={`p2-cross-L-${i}`} start={[getPassageiro02CrossoverX(z1_L) - 0.8, 0, z1_L]} end={[getPassageiro02CrossoverX(z2_L) - 0.8, 0, z2_L]} />);

      // Right rail runs from z=20 (heel of AMV TP-2B right blade) to z=-10 (stock rail of AMV TP-3B)
      const z1_R = 20 - 30 * u1;
      const z2_R = 20 - 30 * u2;
      rails.push(<RailSegment key={`p2-cross-R-${i}`} start={[getPassageiro02CrossoverX(z1_R) + 0.8, 0, z1_R]} end={[getPassageiro02CrossoverX(z2_R) + 0.8, 0, z2_R]} />);
    }
  } else if (layoutType === 'oficina_central') {
    const segs = 20;
    const curveSegs158 = 28;

    // 1. L-158 (Far Left 5KM)
    rails.push(<RailSegment key="oc-158-str-L" start={[-11.5 - 0.8, 0, 55]} end={[-11.5 - 0.8, 0, -5]} />);
    rails.push(<RailSegment key="oc-158-str-R" start={[-11.5 + 0.8, 0, 55]} end={[-11.5 + 0.8, 0, -5]} />);
    for (let i = 0; i < curveSegs158; i++) {
      const z1 = -5 - 50 * (i / curveSegs158);
      const z2 = -5 - 50 * ((i + 1) / curveSegs158);
      const x1 = getOficinaCentralTrack158X(z1);
      const x2 = getOficinaCentralTrack158X(z2);
      rails.push(<RailSegment key={`oc-158-cL-${i}`} start={[x1 - 0.8, 0, z1]} end={[x2 - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`oc-158-cR-${i}`} start={[x1 + 0.8, 0, z1]} end={[x2 + 0.8, 0, z2]} />);
    }

    // 2. Center Group: L-162 (x = -1.2), L-161 (x = -4.0), L-160 (x = -6.8)
    rails.push(<RailSegment key="oc-162-L-pre" start={[-1.2 - 0.8, 0, 55]} end={[-1.2 - 0.8, 0, 25]} />);
    rails.push(<RailSegment key="oc-162-L-post" start={[-1.2 - 0.8, 0, 20]} end={[-1.2 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="oc-162-R" start={[-1.2 + 0.8, 0, 55]} end={[-1.2 + 0.8, 0, -55]} />);

    // L-161 curve from z=25 to z=5
    for (let i = 0; i < segs; i++) {
      const u1 = i / segs;
      const u2 = (i + 1) / segs;
      const z1_L = 25 - 20 * u1;
      const z2_L = 25 - 20 * u2;
      rails.push(<RailSegment key={`oc-161-cL-${i}`} start={[getOficinaCentralTrack161X(z1_L) - 0.8, 0, z1_L]} end={[getOficinaCentralTrack161X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = 20 - 15 * u1;
      const z2_R = 20 - 15 * u2;
      rails.push(<RailSegment key={`oc-161-cR-${i}`} start={[getOficinaCentralTrack161X(z1_R) + 0.8, 0, z1_R]} end={[getOficinaCentralTrack161X(z2_R) + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="oc-161-L-post" start={[-4.0 - 0.8, 0, 0]} end={[-4.0 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="oc-161-R-post" start={[-4.0 + 0.8, 0, 5]} end={[-4.0 + 0.8, 0, -55]} />);

    // L-160 curve from z=5 to z=-15
    for (let i = 0; i < segs; i++) {
      const u1 = i / segs;
      const u2 = (i + 1) / segs;
      const z1_L = 5 - 20 * u1;
      const z2_L = 5 - 20 * u2;
      rails.push(<RailSegment key={`oc-160-cL-${i}`} start={[getOficinaCentralTrack160X(z1_L) - 0.8, 0, z1_L]} end={[getOficinaCentralTrack160X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = 0 - 15 * u1;
      const z2_R = 0 - 15 * u2;
      rails.push(<RailSegment key={`oc-160-cR-${i}`} start={[getOficinaCentralTrack160X(z1_R) + 0.8, 0, z1_R]} end={[getOficinaCentralTrack160X(z2_R) + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="oc-160-L-str" start={[-6.8 - 0.8, 0, -15]} end={[-6.8 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="oc-160-R-str" start={[-6.8 + 0.8, 0, -15]} end={[-6.8 + 0.8, 0, -55]} />);

    // 3. Right Group: L-165 (x = 7.6), L-164 (x = 4.8), L-163 (x = 2.0)
    rails.push(<RailSegment key="oc-165-L-pre" start={[7.6 - 0.8, 0, 55]} end={[7.6 - 0.8, 0, 25]} />);
    rails.push(<RailSegment key="oc-165-L-post" start={[7.6 - 0.8, 0, 20]} end={[7.6 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="oc-165-R" start={[7.6 + 0.8, 0, 55]} end={[7.6 + 0.8, 0, -55]} />);

    // L-164 curve from z=25 to z=5
    for (let i = 0; i < segs; i++) {
      const u1 = i / segs;
      const u2 = (i + 1) / segs;
      const z1_L = 25 - 20 * u1;
      const z2_L = 25 - 20 * u2;
      rails.push(<RailSegment key={`oc-164-cL-${i}`} start={[getOficinaCentralTrack164X(z1_L) - 0.8, 0, z1_L]} end={[getOficinaCentralTrack164X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = 20 - 15 * u1;
      const z2_R = 20 - 15 * u2;
      rails.push(<RailSegment key={`oc-164-cR-${i}`} start={[getOficinaCentralTrack164X(z1_R) + 0.8, 0, z1_R]} end={[getOficinaCentralTrack164X(z2_R) + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="oc-164-L-post" start={[4.8 - 0.8, 0, 0]} end={[4.8 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="oc-164-R-post" start={[4.8 + 0.8, 0, 5]} end={[4.8 + 0.8, 0, -55]} />);

    // L-163 curve from z=5 to z=-15
    for (let i = 0; i < segs; i++) {
      const u1 = i / segs;
      const u2 = (i + 1) / segs;
      const z1_L = 5 - 20 * u1;
      const z2_L = 5 - 20 * u2;
      rails.push(<RailSegment key={`oc-163-cL-${i}`} start={[getOficinaCentralTrack163X(z1_L) - 0.8, 0, z1_L]} end={[getOficinaCentralTrack163X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = 0 - 15 * u1;
      const z2_R = 0 - 15 * u2;
      rails.push(<RailSegment key={`oc-163-cR-${i}`} start={[getOficinaCentralTrack163X(z1_R) + 0.8, 0, z1_R]} end={[getOficinaCentralTrack163X(z2_R) + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="oc-163-L-str" start={[2.0 - 0.8, 0, -15]} end={[2.0 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="oc-163-R-str" start={[2.0 + 0.8, 0, -15]} end={[2.0 + 0.8, 0, -55]} />);
  } else if (layoutType === 'abaixo_oficina') {
    const segs = 22;

    // 1. L-166 (Far-left under Blue Canopy at x = -10.6: goes up to z = -21 where AMV 3 connects it to L-165)
    rails.push(<RailSegment key="ao-166-L" start={[-10.6 - 0.8, 0, 55]} end={[-10.6 - 0.8, 0, -21]} />);
    rails.push(<RailSegment key="ao-166-R" start={[-10.6 + 0.8, 0, 55]} end={[-10.6 + 0.8, 0, -16]} />);

    // 2. L-165 (straight at x = -4.0 from z = 55 to 22, then curves from -4.0 at z = 22 all the way to -10.6 at z = -21, then straight to -55)
    rails.push(<RailSegment key="ao-165-pre-L" start={[-4.0 - 0.8, 0, 55]} end={[-4.0 - 0.8, 0, 22]} />);
    rails.push(<RailSegment key="ao-165-pre-R" start={[-4.0 + 0.8, 0, 55]} end={[-4.0 + 0.8, 0, 22]} />);

    const segs165 = 28;
    for (let i = 0; i < segs165; i++) {
      const u1 = i / segs165;
      const u2 = (i + 1) / segs165;
      // Left rail of L-165 stops at z = -16 so the switch blade covers [-16, -21]
      const z1_L = 22 - 38 * u1;
      const z2_L = 22 - 38 * u2;
      rails.push(<RailSegment key={`ao-165-cL-${i}`} start={[getAbaixoOficinaTrack165X(z1_L) - 0.8, 0, z1_L]} end={[getAbaixoOficinaTrack165X(z2_L) - 0.8, 0, z2_L]} />);

      // Right rail of L-165 goes all the way to z = -21
      const z1_R = 22 - 43 * u1;
      const z2_R = 22 - 43 * u2;
      rails.push(<RailSegment key={`ao-165-cR-${i}`} start={[getAbaixoOficinaTrack165X(z1_R) + 0.8, 0, z1_R]} end={[getAbaixoOficinaTrack165X(z2_R) + 0.8, 0, z2_R]} />);
    }
    // Continuation of L-165 from AMV 3 (z = -21) to the back shed (z = -55) at x = -10.6
    rails.push(<RailSegment key="ao-165-L-str" start={[-10.6 - 0.8, 0, -21]} end={[-10.6 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="ao-165-R-str" start={[-10.6 + 0.8, 0, -21]} end={[-10.6 + 0.8, 0, -55]} />);

    // 3. Right Trunk: L-162 (x = 1.6), L-163 (branches left at AMV 1 z = 26), L-173 (big curve right from AMV 2 at z = 14)
    // Left rail of L-162 has gap [26, 21] for AMV 1 left blade
    rails.push(<RailSegment key="ao-162-L-pre" start={[1.6 - 0.8, 0, 55]} end={[1.6 - 0.8, 0, 26]} />);
    rails.push(<RailSegment key="ao-162-L-post" start={[1.6 - 0.8, 0, 21]} end={[1.6 - 0.8, 0, -55]} />);
    // Right rail of L-162 has gap [14, 9] for AMV 2 right blade
    rails.push(<RailSegment key="ao-162-R-pre" start={[1.6 + 0.8, 0, 55]} end={[1.6 + 0.8, 0, 14]} />);
    rails.push(<RailSegment key="ao-162-R-post" start={[1.6 + 0.8, 0, 9]} end={[1.6 + 0.8, 0, -55]} />);

    // L-163 curve (left branch from AMV 1 at z=26 to z=6)
    for (let i = 0; i < segs; i++) {
      const u1 = i / segs;
      const u2 = (i + 1) / segs;
      const z1_L = 26 - 20 * u1;
      const z2_L = 26 - 20 * u2;
      rails.push(<RailSegment key={`ao-163-cL-${i}`} start={[getAbaixoOficinaTrack163X(z1_L) - 0.8, 0, z1_L]} end={[getAbaixoOficinaTrack163X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = 21 - 15 * u1;
      const z2_R = 21 - 15 * u2;
      rails.push(<RailSegment key={`ao-163-cR-${i}`} start={[getAbaixoOficinaTrack163X(z1_R) + 0.8, 0, z1_R]} end={[getAbaixoOficinaTrack163X(z2_R) + 0.8, 0, z2_R]} />);
    }
    // L-163 has gap [6, 1] on left rail for AMV 5 (164/163) left blade
    rails.push(<RailSegment key="ao-163-L-str" start={[-1.2 - 0.8, 0, 1]} end={[-1.2 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="ao-163-R-str" start={[-1.2 + 0.8, 0, 6]} end={[-1.2 + 0.8, 0, -55]} />);

    // L-164 curve (left branch from AMV 5 on L-163 at z=6 to z=-18, aligned with the right entrance of the white shed at x=-6.8)
    const segs164 = 26;
    for (let i = 0; i < segs164; i++) {
      const u1 = i / segs164;
      const u2 = (i + 1) / segs164;
      const z1_L = 6 - 24 * u1;
      const z2_L = 6 - 24 * u2;
      rails.push(<RailSegment key={`ao-164-cL-${i}`} start={[getAbaixoOficinaTrack164X(z1_L) - 0.8, 0, z1_L]} end={[getAbaixoOficinaTrack164X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = 1 - 19 * u1;
      const z2_R = 1 - 19 * u2;
      rails.push(<RailSegment key={`ao-164-cR-${i}`} start={[getAbaixoOficinaTrack164X(z1_R) + 0.8, 0, z1_R]} end={[getAbaixoOficinaTrack164X(z2_R) + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="ao-164-L-str" start={[-6.8 - 0.8, 0, -18]} end={[-6.8 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="ao-164-R-str" start={[-6.8 + 0.8, 0, -18]} end={[-6.8 + 0.8, 0, -55]} />);

    // 4. L-173 (Grande puxada em curva para o lado direito saindo do AMV 2 em z=14 até z=-55)
    const segs173 = 36;
    for (let i = 0; i < segs173; i++) {
      const u1 = i / segs173;
      const u2 = (i + 1) / segs173;
      const z1_R = 14 - 69 * u1;
      const z2_R = 14 - 69 * u2;
      rails.push(<RailSegment key={`ao-173-R-${i}`} start={[getAbaixoOficinaTrack173X(z1_R) + 0.8, 0, z1_R]} end={[getAbaixoOficinaTrack173X(z2_R) + 0.8, 0, z2_R]} />);
    }
    // Left rail of L-173 in 3 segments leaving gaps [14, 9] (AMV 2), [0, -5] (AMV 4), and [-13, -18] (AMV 6)
    const segs173A = 10;
    for (let i = 0; i < segs173A; i++) {
      const z1 = 9 - 9 * (i / segs173A);
      const z2 = 9 - 9 * ((i + 1) / segs173A);
      rails.push(<RailSegment key={`ao-173-LA-${i}`} start={[getAbaixoOficinaTrack173X(z1) - 0.8, 0, z1]} end={[getAbaixoOficinaTrack173X(z2) - 0.8, 0, z2]} />);
    }
    const segs173B = 8;
    for (let i = 0; i < segs173B; i++) {
      const z1 = -5 - 8 * (i / segs173B);
      const z2 = -5 - 8 * ((i + 1) / segs173B);
      rails.push(<RailSegment key={`ao-173-LB-${i}`} start={[getAbaixoOficinaTrack173X(z1) - 0.8, 0, z1]} end={[getAbaixoOficinaTrack173X(z2) - 0.8, 0, z2]} />);
    }
    const segs173C = 20;
    for (let i = 0; i < segs173C; i++) {
      const z1 = -18 - 37 * (i / segs173C);
      const z2 = -18 - 37 * ((i + 1) / segs173C);
      rails.push(<RailSegment key={`ao-173-LC-${i}`} start={[getAbaixoOficinaTrack173X(z1) - 0.8, 0, z1]} end={[getAbaixoOficinaTrack173X(z2) - 0.8, 0, z2]} />);
    }

    // 5. L-161 curve (ligada à L-173 no AMV 4 em z=0, fazendo curva para a esquerda até x=4.4 em z=-18)
    for (let i = 0; i < segs; i++) {
      const u1 = i / segs;
      const u2 = (i + 1) / segs;
      const z1_L = 0 - 18 * u1;
      const z2_L = 0 - 18 * u2;
      rails.push(<RailSegment key={`ao-161-cL-${i}`} start={[getAbaixoOficinaTrack161X(z1_L) - 0.8, 0, z1_L]} end={[getAbaixoOficinaTrack161X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = -5 - 13 * u1;
      const z2_R = -5 - 13 * u2;
      rails.push(<RailSegment key={`ao-161-cR-${i}`} start={[getAbaixoOficinaTrack161X(z1_R) + 0.8, 0, z1_R]} end={[getAbaixoOficinaTrack161X(z2_R) + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="ao-161-L-str" start={[4.4 - 0.8, 0, -18]} end={[4.4 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="ao-161-R-str" start={[4.4 + 0.8, 0, -18]} end={[4.4 + 0.8, 0, -55]} />);

    // 6. L-160 curve (ligada à L-173 no AMV 6 em z=-13, fazendo curva para a esquerda até x=7.2 em z=-31)
    for (let i = 0; i < segs; i++) {
      const u1 = i / segs;
      const u2 = (i + 1) / segs;
      const z1_L = -13 - 18 * u1;
      const z2_L = -13 - 18 * u2;
      rails.push(<RailSegment key={`ao-160-cL-${i}`} start={[getAbaixoOficinaTrack160X(z1_L) - 0.8, 0, z1_L]} end={[getAbaixoOficinaTrack160X(z2_L) - 0.8, 0, z2_L]} />);

      const z1_R = -18 - 13 * u1;
      const z2_R = -18 - 13 * u2;
      rails.push(<RailSegment key={`ao-160-cR-${i}`} start={[getAbaixoOficinaTrack160X(z1_R) + 0.8, 0, z1_R]} end={[getAbaixoOficinaTrack160X(z2_R) + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="ao-160-L-str" start={[7.2 - 0.8, 0, -31]} end={[7.2 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="ao-160-R-str" start={[7.2 + 0.8, 0, -31]} end={[7.2 + 0.8, 0, -55]} />);
  } else if (layoutType === 'reclassificacao_02') {
    const segs = 28;

    // 1. Linha Central L-109A -> L-121 (x = 0, de z=55 até z=-55)
    // Trilho esquerdo (-0.8): tem lacuna de 5m apenas no AMV 1 [17..12] e no AMV 3 [-15..-20]
    rails.push(<RailSegment key="r02-121-L1" start={[-0.8, 0, 55]} end={[-0.8, 0, 17]} />);
    rails.push(<RailSegment key="r02-121-L2" start={[-0.8, 0, 12]} end={[-0.8, 0, -15]} />);
    rails.push(<RailSegment key="r02-121-L3" start={[-0.8, 0, -20]} end={[-0.8, 0, -55]} />);

    // Trilho direito (+0.8): 100% contínuo de z=55 até z=-55 (como na foto real!)
    rails.push(<RailSegment key="r02-121-R" start={[0.8, 0, 55]} end={[0.8, 0, -55]} />);

    // 2. Travessão diagonal AMV 1 (z=17) -> AMV 2 (z=-8) conectando L-109A à L-109
    for (let i = 0; i < segs; i++) {
      const u1 = i / segs;
      const u2 = (i + 1) / segs;
      // Trilho esquerdo do travessão: vai de z=17 (encosto esquerdo no AMV 1) até z=-3 (calcanhar da agulha esquerda do AMV 2)
      const z1_L = 17 - 20 * u1;
      const z2_L = 17 - 20 * u2;
      rails.push(<RailSegment key={`r02-cross-cL-${i}`} start={[getReclassificacao02Crossover109X(z1_L) - 0.8, 0, z1_L]} end={[getReclassificacao02Crossover109X(z2_L) - 0.8, 0, z2_L]} />);

      // Trilho direito do travessão: vai de z=12 (calcanhar da agulha direita do AMV 1) até z=-8 (encosto direito no AMV 2)
      const z1_R = 12 - 20 * u1;
      const z2_R = 12 - 20 * u2;
      rails.push(<RailSegment key={`r02-cross-cR-${i}`} start={[getReclassificacao02Crossover109X(z1_R) + 0.8, 0, z1_R]} end={[getReclassificacao02Crossover109X(z2_R) + 0.8, 0, z2_R]} />);
    }

    // 3. Ramo Esquerdo e Linha L-109 (vem em curva suave de z=55 até z=4, e segue 100% reto em x=-3.8 de z=4 até z=-55)
    const segsLeft = 28;
    for (let i = 0; i < segsLeft; i++) {
      const u1 = i / segsLeft;
      const u2 = (i + 1) / segsLeft;
      const z1 = 55 - 51 * u1;
      const z2 = 55 - 51 * u2;
      rails.push(<RailSegment key={`r02-109-apL-${i}`} start={[getReclassificacao02LeftTrunk109X(z1) - 0.8, 0, z1]} end={[getReclassificacao02LeftTrunk109X(z2) - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`r02-109-apR-${i}`} start={[getReclassificacao02LeftTrunk109X(z1) + 0.8, 0, z1]} end={[getReclassificacao02LeftTrunk109X(z2) + 0.8, 0, z2]} />);
    }
    // Trilho esquerdo da L-109 (-3.8 - 0.8 = -4.6): 100% contínuo de z=4 até z=-55 (encosto esquerdo do AMV 2)
    rails.push(<RailSegment key="r02-109-L-str" start={[-3.8 - 0.8, 0, 4]} end={[-3.8 - 0.8, 0, -55]} />);
    // Trilho direito da L-109 (-3.8 + 0.8 = -3.0): vai de z=4 até z=-3, tem lacuna de 5m [-3..-8] para a agulha direita do AMV 2, e segue de z=-8 até z=-55
    rails.push(<RailSegment key="r02-109-R-pre" start={[-3.8 + 0.8, 0, 4]} end={[-3.8 + 0.8, 0, -3]} />);
    rails.push(<RailSegment key="r02-109-R-str" start={[-3.8 + 0.8, 0, -8]} end={[-3.8 + 0.8, 0, -55]} />);

    // 4. Ramo Superior do AMV 3 para L-122 (z=-15 desviando à esquerda para x=-1.9 em z=-32..z=-55)
    for (let i = 0; i < segs; i++) {
      const u1 = i / segs;
      const u2 = (i + 1) / segs;
      // Trilho esquerdo de encosto começa na ponta do AMV 3 (z=-15)
      const z1_L = -15 - 17 * u1;
      const z2_L = -15 - 17 * u2;
      rails.push(<RailSegment key={`r02-up122-cL-${i}`} start={[getReclassificacao02UpperBranch122X(z1_L) - 0.8, 0, z1_L]} end={[getReclassificacao02UpperBranch122X(z2_L) - 0.8, 0, z2_L]} />);

      // Trilho direito começa no calcanhar da agulha direita do AMV 3 (z=-20)
      const z1_R = -20 - 12 * u1;
      const z2_R = -20 - 12 * u2;
      rails.push(<RailSegment key={`r02-up122-cR-${i}`} start={[getReclassificacao02UpperBranch122X(z1_R) + 0.8, 0, z1_R]} end={[getReclassificacao02UpperBranch122X(z2_R) + 0.8, 0, z2_R]} />);
    }
    rails.push(<RailSegment key="r02-up122-L-str" start={[-1.9 - 0.8, 0, -32]} end={[-1.9 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="r02-up122-R-str" start={[-1.9 + 0.8, 0, -32]} end={[-1.9 + 0.8, 0, -55]} />);
  } else {
    // Siding double AMV rails
    rails.push(<RailSegment key="right-straight" start={[0.8, 0, 5]} end={[0.8, 0, 0]} />);
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      
      const xCenter1 = -3.4 * (u1 ** 3) + 2.6 * (u1 ** 2) + 5.0 * u1 + 1.0;
      const xCenter2 = -3.4 * (u2 ** 3) + 2.6 * (u2 ** 2) + 5.0 * u2 + 1.0;
      
      const z1 = -25 * u1;
      const z2 = -25 * u2;
      
      rails.push(<RailSegment key={`L-${i}`} start={[xCenter1 - 0.8, 0, z1]} end={[xCenter2 - 0.8, 0, z2]} />);
      rails.push(<RailSegment key={`R-${i}`} start={[xCenter1 + 0.8, 0, z1]} end={[xCenter2 + 0.8, 0, z2]} />);
    }
  }
  return rails;
}, [layoutType]);
  
  return <group>{elements}</group>;
}

function FrogInfo({ z, x }: { z: number, x: number }) {
  return (
    <group position={[x, 0.08, z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.18, 0.16, 0.6]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.3} />
      </mesh>
      <Text position={[-0.35, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.2} color="#fff">Jacaré</Text>
    </group>
  );
}

function Wagon3D({ type, color, position, rotation }: { type: 'tank' | 'container', color: string, position?: [number, number, number], rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Chassis / Steel Frame */}
      <mesh position={[0, 0.56, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.64, 0.16, 4.4]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
      </mesh>
      
      {/* Couplings */}
      <mesh position={[0, 0.48, 2.35]} castShadow>
        <boxGeometry args={[0.3, 0.12, 0.45]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.48, -2.35]} castShadow>
        <boxGeometry args={[0.3, 0.12, 0.45]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Cargo Body */}
      {type === 'tank' ? (
        <group position={[0, 1.26, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.7, 0.7, 3.8, 16]} />
            <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 1.9]} castShadow>
            <sphereGeometry args={[0.7, 16, 16]} scale={[1, 1, 0.5]} />
            <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, -1.9]} castShadow>
            <sphereGeometry args={[0.7, 16, 16]} scale={[1, 1, 0.5]} />
            <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.75, 0]} castShadow>
            <cylinderGeometry args={[0.25, 0.25, 0.25, 12]} />
            <meshStandardMaterial color="#1e293b" metalness={0.6} />
          </mesh>
          {[-1.2, 0, 1.2].map((z, idx) => (
            <mesh key={idx} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <torusGeometry args={[0.72, 0.03, 8, 24]} />
              <meshStandardMaterial color="#0f172a" metalness={0.8} />
            </mesh>
          ))}
        </group>
      ) : (
        <group position={[0, 1.3, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.48, 1.3, 4.0]} />
            <meshStandardMaterial color={color} metalness={0.2} roughness={0.7} />
          </mesh>
          {[-1.6, -1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2, 1.6].map((z, idx) => (
            <mesh key={idx} position={[0, 0, z]} castShadow>
              <boxGeometry args={[1.52, 1.28, 0.1]} />
              <meshStandardMaterial color={color} metalness={0.1} roughness={0.8} />
            </mesh>
          ))}
          <mesh castShadow>
            <boxGeometry args={[1.5, 1.32, 4.04]} />
            <meshStandardMaterial color="#27272a" wireframe={true} />
          </mesh>
        </group>
      )}

      {/* Wheels / Bogies alinhados exatamente sobre a bitola dos trilhos (-0.8 e +0.8) */}
      {[-1.35, 1.35].map((zPos, bIdx) => (
        <group key={bIdx} position={[0, 0.25, zPos]}>
          {/* Travessa central do truque */}
          <mesh position={[0, 0.08, 0]} castShadow>
            <boxGeometry args={[1.64, 0.12, 0.42]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.35} />
          </mesh>
          {/* Laterais do truque (Sideframes) */}
          {[-0.88, 0.88].map((sideX, sIdx) => (
            <mesh key={`w-sf-${sIdx}`} position={[sideX, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <capsuleGeometry args={[0.075, 0.78, 8, 12]} />
              <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.35} />
            </mesh>
          ))}
          {[-0.36, 0.36].map((axleZ, aIdx) => (
            <group key={aIdx} position={[0, 0, axleZ]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.045, 0.045, 1.62, 12]} />
                <meshStandardMaterial color="#475569" metalness={0.85} />
              </mesh>
              {[-0.79, 0.79].map((wheelX, wIdx) => (
                <group key={wIdx} position={[wheelX, 0, 0]}>
                  <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                    <cylinderGeometry args={[0.25, 0.25, 0.12, 20]} />
                    <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
                  </mesh>
                  {/* Friso interno apoiado na borda interna do boleto do trilho */}
                  <mesh position={[wheelX > 0 ? -0.05 : 0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.275, 0.275, 0.025, 20]} />
                    <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.15} />
                  </mesh>
                </group>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function Locomotive3D({ position, rotation, visible = true, nightMode, headlightsOff = false }: { position: [number, number, number], rotation: [number, number, number], visible?: boolean, nightMode?: boolean, headlightsOff?: boolean }) {
  if (!visible) return null;
  const spotLightRef = useRef<THREE.SpotLight>(null);
  const lightTargetRef = useRef<THREE.Object3D>(null);

  useLayoutEffect(() => {
    if (spotLightRef.current && lightTargetRef.current) {
      spotLightRef.current.target = lightTargetRef.current;
      lightTargetRef.current.updateMatrixWorld();
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* ========================================================= */}
      {/* 1. CHASSIS, PLATAFORMA PRINCIPAL & ENGATES                */}
      {/* ========================================================= */}
      {/* Plataforma principal (Underframe deck) */}
      <mesh position={[0, 0.54, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.96, 0.16, 5.25]} />
        <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.35} />
      </mesh>
      {/* Faixa lateral de segurança amarela na borda do passadiço */}
      <mesh position={[0, 0.54, 0]}>
        <boxGeometry args={[1.99, 0.055, 5.27]} />
        <meshStandardMaterial color="#facc15" metalness={0.35} roughness={0.45} />
      </mesh>

      {/* Limpa-trilhos frontal inclinado (Evolution Snowplow / Pilot) */}
      <mesh position={[0, 0.34, 2.58]} rotation={[0.32, 0, 0]} castShadow>
        <cylinderGeometry args={[0.72, 0.96, 0.36, 16, 1, false, -Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.35} />
      </mesh>
      {/* Engates frontal e traseiro (Couplers) */}
      <mesh position={[0, 0.44, 2.72]} castShadow>
        <boxGeometry args={[0.32, 0.14, 0.32]} />
        <meshStandardMaterial color="#090d16" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.44, -2.68]} castShadow>
        <boxGeometry args={[0.32, 0.14, 0.32]} />
        <meshStandardMaterial color="#090d16" metalness={0.9} roughness={0.25} />
      </mesh>

      {/* ========================================================= */}
      {/* 2. TANQUE DE COMBUSTÍVEL CILÍNDRICO CENTRAL & RESERVATÓRIOS*/}
      {/* ========================================================= */}
      <group position={[0, 0.33, -0.05]}>
        {/* Corpo cilíndrico principal do tanque de combustível */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.68, 0.68, 1.38, 24]} />
          <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.35} />
        </mesh>
        {/* Calotas arredondadas do tanque */}
        <mesh position={[0, 0, 0.69]} scale={[1, 0.65, 0.35]} castShadow>
          <sphereGeometry args={[0.68, 20, 16]} />
          <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0, -0.69]} scale={[1, 0.65, 0.35]} castShadow>
          <sphereGeometry args={[0.68, 20, 16]} />
          <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.35} />
        </mesh>
        {/* Cilindros de ar comprimido laterais */}
        {[-0.76, 0.76].map((xSide, idx) => (
          <mesh key={`air-${idx}`} position={[xSide, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 1.15, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* ========================================================= */}
      {/* 3. TRUQUES C-C (3 EIXOS POR TRUQUE - PADRÃO EVOLUTION)    */}
      {/* ========================================================= */}
      {[1.52, -1.52].map((bogieZ, bIdx) => (
        <group key={`bogie-${bIdx}`} position={[0, 0.25, bogieZ]}>
          {/* Laterais fundidas do truque (Sideframes) */}
          {[-0.88, 0.88].map((sideX, sIdx) => (
            <group key={`frame-${sIdx}`} position={[sideX, 0.03, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                <capsuleGeometry args={[0.09, 1.15, 8, 16]} />
                <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.35} />
              </mesh>
              {/* Molas helicoidais e cilindros de freio */}
              {[-0.26, 0.26].map((springZ, spIdx) => (
                <mesh key={`sp-${spIdx}`} position={[sideX > 0 ? 0.05 : -0.05, 0.04, springZ]} castShadow>
                  <cylinderGeometry args={[0.055, 0.055, 0.18, 12]} />
                  <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.25} />
                </mesh>
              ))}
            </group>
          ))}
          {/* 3 Eixos e 6 Rodas por truque apoiadas diretamente sobre os trilhos (-0.8 e +0.8) */}
          {[-0.48, 0, 0.48].map((axleZ, aIdx) => (
            <group key={`axle-${aIdx}`} position={[0, 0, axleZ]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.05, 0.05, 1.62, 12]} />
                <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.3} />
              </mesh>
              {[-0.79, 0.79].map((wheelX, wIdx) => (
                <group key={`wheel-${wIdx}`} position={[wheelX, 0, 0]}>
                  <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                    <cylinderGeometry args={[0.25, 0.25, 0.13, 24]} />
                    <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
                  </mesh>
                  {/* Friso metálico da roda */}
                  <mesh position={[wheelX > 0 ? -0.05 : 0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.275, 0.275, 0.025, 24]} />
                    <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.15} />
                  </mesh>
                </group>
              ))}
            </group>
          ))}
        </group>
      ))}

      {/* ========================================================= */}
      {/* 4. FUSELAGEM CILÍNDRICA EVOLUTION (MOTOR + RADIADOR)      */}
      {/* ========================================================= */}
      {/* Base inferior da fuselagem do motor */}
      <mesh position={[0, 1.12, -0.58]} castShadow receiveShadow>
        <boxGeometry args={[1.56, 1.0, 3.65]} />
        <meshStandardMaterial color="#0284c7" metalness={0.65} roughness={0.25} />
      </mesh>

      {/* Topo Cilíndrico Principal do Capô Longo (Visual Evolution Cilíndrico) */}
      <mesh position={[0, 1.62, -0.58]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.78, 0.78, 3.65, 32]} />
        <meshStandardMaterial color="#0284c7" metalness={0.68} roughness={0.22} />
      </mesh>

      {/* Calota traseira abaulada cilíndrica (Rear Evolution Tail Dome) */}
      <mesh position={[0, 1.62, -2.4]} scale={[1, 1, 0.32]} castShadow>
        <sphereGeometry args={[0.78, 28, 20]} />
        <meshStandardMaterial color="#0369a1" metalness={0.65} roughness={0.25} />
      </mesh>
      <mesh position={[0, 1.12, -2.4]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.78, 0.78, 1.0, 28]} />
        <meshStandardMaterial color="#0369a1" metalness={0.65} roughness={0.25} />
      </mesh>

      {/* Faixas Aerodinâmicas Amarelo-Ouro e Prata envolvendo o cilindro */}
      <mesh position={[0, 1.28, -0.55]} castShadow>
        <boxGeometry args={[1.60, 0.16, 3.72]} />
        <meshStandardMaterial color="#facc15" metalness={0.45} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.42, -0.55]} castShadow>
        <boxGeometry args={[1.59, 0.06, 3.72]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.75} roughness={0.2} />
      </mesh>

      {/* Aletas Cilíndricas Superiores do Radiador Evolution (Flared Radiator Wings) */}
      <group position={[0, 2.02, -1.72]}>
        {[-0.62, 0.62].map((wingX, wIdx) => (
          <mesh key={`wing-${wIdx}`} position={[wingX, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <capsuleGeometry args={[0.24, 1.15, 12, 20]} />
            <meshStandardMaterial color="#0369a1" metalness={0.65} roughness={0.28} />
          </mesh>
        ))}
        {/* Grelhas escuras laterais do radiador */}
        <mesh position={[0, 0.02, 0]} castShadow>
          <boxGeometry args={[1.76, 0.22, 1.18]} />
          <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.4} />
        </mesh>
        {/* Cúpulas circulares dos ventiladores de teto (Dual Evolution Cooling Fans) */}
        {[-0.32, 0.32].map((fanZ, fIdx) => (
          <group key={`fan-${fIdx}`} position={[0, 0.38, fanZ]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.42, 0.46, 0.1, 24]} />
              <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.055, 0]}>
              <cylinderGeometry args={[0.36, 0.36, 0.02, 24]} />
              <meshStandardMaterial color="#090d16" metalness={0.9} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Chaminé de Exaustão Cilíndrica e Buzina Pneumática */}
      <mesh position={[0, 2.44, -0.25]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.22, 20]} />
        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0, 2.43, 0.45]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.035, 0.24, 12]} />
        <meshStandardMaterial color="#facc15" metalness={0.85} roughness={0.2} />
      </mesh>

      {/* ========================================================= */}
      {/* 5. CABINE PANORÂMICA & BICO CILÍNDRICO AERODINÂMICO       */}
      {/* ========================================================= */}
      {/* Corpo da Cabine (Wide-Cab Evolution) */}
      <mesh position={[0, 1.32, 1.32]} castShadow receiveShadow>
        <boxGeometry args={[1.78, 1.38, 1.05]} />
        <meshStandardMaterial color="#0284c7" metalness={0.65} roughness={0.22} />
      </mesh>
      {/* Teto Arredondado Cilíndrico da Cabine */}
      <mesh position={[0, 2.0, 1.32]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.89, 0.89, 1.05, 32, 1, false, -Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color="#0369a1" metalness={0.65} roughness={0.22} />
      </mesh>
      {/* Domo de Antena PTC/GPS no teto da cabine */}
      <mesh position={[0, 2.52, 1.35]} scale={[1.2, 0.45, 1.6]} castShadow>
        <sphereGeometry args={[0.22, 20, 16]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.3} roughness={0.25} />
      </mesh>

      {/* Para-brisas Panorâmicos Inclinados (Front Windshields) */}
      {[-0.4, 0.4].map((winX, wIdx) => (
        <mesh key={`windshield-${wIdx}`} position={[winX, 1.98, 1.84]} rotation={[-0.28, winX > 0 ? 0.08 : -0.08, 0]}>
          <boxGeometry args={[0.64, 0.44, 0.06]} />
          <meshStandardMaterial color="#090d16" metalness={0.95} roughness={0.08} />
        </mesh>
      ))}
      {/* Janelas Laterais da Cabine */}
      {[-0.90, 0.90].map((sideX, sIdx) => (
        <mesh key={`sidewin-${sIdx}`} position={[sideX, 1.92, 1.32]}>
          <boxGeometry args={[0.04, 0.44, 0.62]} />
          <meshStandardMaterial color="#090d16" metalness={0.95} roughness={0.08} />
        </mesh>
      ))}

      {/* Bico Frontal Cilíndrico / Aerodinâmico (Streamlined Cylindrical Nose) */}
      <group position={[0, 1.18, 2.02]}>
        {/* Cilindro horizontal do nariz */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.84, 0.88, 0.72, 32]} />
          <meshStandardMaterial color="#0284c7" metalness={0.68} roughness={0.22} />
        </mesh>
        {/* Ponta frontal boleada tipo bala/Evolution */}
        <mesh position={[0, 0, 0.36]} scale={[1, 0.92, 0.48]} castShadow receiveShadow>
          <sphereGeometry args={[0.84, 32, 24]} />
          <meshStandardMaterial color="#0284c7" metalness={0.68} roughness={0.22} />
        </mesh>
        {/* Painel superior antirreflexo preto fosco sobre o bico */}
        <mesh position={[0, 0.56, 0.02]} rotation={[0.18, 0, 0]} castShadow>
          <cylinderGeometry args={[0.52, 0.64, 0.68, 24]} />
          <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.7} />
        </mesh>
        {/* Anel amarelo aerodinâmico no nariz cilíndrico */}
        <mesh position={[0, -0.02, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.865, 0.875, 0.22, 32]} />
          <meshStandardMaterial color="#facc15" metalness={0.45} roughness={0.3} />
        </mesh>
      </group>

      {/* ========================================================= */}
      {/* 6. CORRIMÃOS TUBULARES E FARÓIS NO SENTIDO DA CIRCULAÇÃO  */}
      {/* ========================================================= */}
      {[-0.93, 0.93].map((railX, rIdx) => (
        <group key={`handrail-${rIdx}`}>
          {/* Corrimão longitudinal */}
          <mesh position={[railX, 1.05, -0.6]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 3.6, 8]} />
            <meshStandardMaterial color="#facc15" metalness={0.4} roughness={0.35} />
          </mesh>
          {/* Balaústres verticais */}
          {[-2.3, -1.5, -0.7, 0.1, 0.8].map((postZ, pIdx) => (
            <mesh key={`post-${pIdx}`} position={[railX, 0.82, postZ]}>
              <cylinderGeometry args={[0.018, 0.018, 0.48, 8]} />
              <meshStandardMaterial color="#facc15" metalness={0.4} roughness={0.35} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Farol Duplo Central no Topo do Bico (1 único tom suave no sentido da circulação +Z) */}
      {[-0.14, 0.14].map((hx, hIdx) => (
        <mesh key={`mainlight-${hIdx}`} position={[hx, 1.56, 2.66]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.095, 0.095, 0.08, 16]} />
          {headlightsOff ? (
            <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.2} />
          ) : (
            <meshBasicMaterial color="#fde047" toneMapped={false} />
          )}
        </mesh>
      ))}

      {/* Faróis Auxiliares Inferiores (Ditch Lights na plataforma frontal - mesmo tom único) */}
      {[-0.58, 0.58].map((dx, dIdx) => (
        <mesh key={`ditchlight-${dIdx}`} position={[dx, 0.76, 2.58]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.085, 0.085, 0.08, 16]} />
          {headlightsOff ? (
            <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.2} />
          ) : (
            <meshBasicMaterial color="#fde047" toneMapped={false} />
          )}
        </mesh>
      ))}

      {/* FACHO VOLUMÉTRICO SUAVE EM 1 ÚNICO TOM APONTANDO NO SENTIDO DA CIRCULAÇÃO (+Z) */}
      {!headlightsOff && (
        <group position={[0, 1.56, 2.68]} rotation={[0.085, 0, 0]}>
          <mesh position={[0, 0, 5.5]} rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 1.65, 11.0, 28, 1, true]} />
            <meshBasicMaterial
              color="#fde047"
              transparent
              opacity={nightMode ? 0.11 : 0.055}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      )}

      {/* Luzes de Cauda Vermelhas (Rear Marker Lights em -Z) */}
      {[-0.45, 0.45].map((rx, rIdx) => (
        <mesh key={`taillight-${rIdx}`} position={[rx, 1.35, -2.64]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.06, 12]} />
          <meshStandardMaterial
            color={headlightsOff ? '#450a0a' : '#fca5a5'}
            emissive="#ef4444"
            emissiveIntensity={headlightsOff ? 0 : nightMode ? 4 : 1.2}
          />
        </mesh>
      ))}

      {/* Iluminação Dinâmica Suave em 1 único tom apontando para +Z (Sentido da Circulação) */}
      {!headlightsOff && (
        <>
          <object3D ref={lightTargetRef} position={[0, 0.2, 22]} />
          <spotLight
            ref={spotLightRef}
            position={[0, 1.56, 2.75]}
            angle={Math.PI / 5.5}
            penumbra={0.75}
            intensity={nightMode ? 12 : 4}
            distance={42}
            color="#fde047"
          />
          <pointLight position={[0, 1.35, 2.95]} intensity={nightMode ? 1.5 : 0.6} distance={6} color="#fde047" />
        </>
      )}
    </group>
  );
}

function TrackLinePlate({ label, x, z, rotY = 0, badge }: { label: string; x: number; z: number; rotY?: number; badge?: string }) {
  const { plateColors } = useContext(SimHazardContext);
  const bgColor = plateColors?.bg || '#ff6600';
  const textColor = plateColors?.text || '#000000';
  const boxWidth = label.length > 6 ? 2.25 : label.length === 6 ? 2.05 : 1.92;
  const textSize =
    label.length > 7
      ? 0.34
      : label.length === 7
      ? 0.40
      : label.length === 6
      ? 0.45
      : label.length === 5
      ? 0.51
      : 0.56;
  const badgeWidth = badge && badge.length > 6 ? Math.min(2.15, Math.max(1.5, badge.length * 0.17 + 0.3)) : 1.5;
  const badgeFontSize = badge && badge.length > 8 ? 0.21 : badge && badge.length > 5 ? 0.24 : 0.27;

  return (
    <group position={[x, -0.05, z]} rotation={[0, rotY, 0]}>
      {/* Base de fixação de aço assentada no dormente */}
      <mesh receiveShadow castShadow position={[0, -0.02, 0]}>
        <boxGeometry args={[0.38, 0.06, 0.24]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* Mastro vertical reforçado (termina exatamente na base da placa em y=0.81 sem atravessar a face frontal) */}
      <mesh receiveShadow castShadow position={[0, 0.405, 0]}>
        <cylinderGeometry args={[0.032, 0.032, 0.81, 12]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Placa dupla face limpa sem contorno/moldura */}
      <group position={[0, 1.25, 0]}>
        {/* Chapa principal colorida única sem borda ao redor */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[boxWidth, 0.88, 0.08]} />
          <meshBasicMaterial color={bgColor} toneMapped={false} />
        </mesh>
        {/* Texto frontal (+Z) sem contorno e na cor exata */}
        <Text
          position={[0, 0, 0.052]}
          fontSize={textSize}
          color={textColor}
          anchorX="center"
          anchorY="middle"
          toneMapped={false}
          letterSpacing={0}
        >
          {label}
        </Text>
        {/* Texto traseiro (-Z) sem contorno e na cor exata */}
        <Text
          position={[0, 0, -0.052]}
          rotation={[0, Math.PI, 0]}
          fontSize={textSize}
          color={textColor}
          anchorX="center"
          anchorY="middle"
          toneMapped={false}
          letterSpacing={0}
        >
          {label}
        </Text>
        {badge && (
          <group position={[0, 0.68, 0]}>
            {/* Haste curta conectando a placa principal ao badge superior */}
            <mesh position={[0, -0.23, 0]}>
              <cylinderGeometry args={[0.024, 0.024, 0.06, 10]} />
              <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh>
              <boxGeometry args={[badgeWidth, 0.44, 0.09]} />
              <meshBasicMaterial color="#ffcc00" toneMapped={false} />
            </mesh>
            <Text
              position={[0, 0, 0.055]}
              fontSize={badgeFontSize}
              color="#000000"
              anchorX="center"
              anchorY="middle"
              toneMapped={false}
            >
              {badge}
            </Text>
            <Text
              position={[0, 0, -0.055]}
              rotation={[0, Math.PI, 0]}
              fontSize={badgeFontSize}
              color="#000000"
              anchorX="center"
              anchorY="middle"
              toneMapped={false}
            >
              {badge}
            </Text>
          </group>
        )}
      </group>
    </group>
  );
}

function FreioAmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  const getTips1 = () => {
    // AMV 1 (65B) at z = 18 (Branches Right)
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.8, right: 0.5 }; // Curve right
    return { left: -0.5, right: 0.8 }; // Straight
  };

  const getTips2 = () => {
    // AMV 2 (65A) at z = 28 (Branches Right)
    if (amvs[1] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[1] === 'REVERSO') return { left: -0.8, right: 0.5 }; // Curve right
    return { left: -0.5, right: 0.8 }; // Straight
  };

  return (
    <group>
      <Sleepers layoutType="freio" />
      
      {/* Straight rail main */}
      {/* Left Stock Rail (continuous) */}
      <RailSegment start={[-0.8, 0, 55]} end={[-0.8, 0, -55]} />
      
      {/* Right Stock Rail (before AMV 1 switch) */}
      <RailSegment start={[0.8, 0, 55]} end={[0.8, 0, 18]} />
      {/* Right Inner Closure Rail (after AMV 1 switch) */}
      <RailSegment start={[0.8, 0, 13]} end={[0.8, 0, -55]} />

      <CurveBranch layoutType="freio" />

      {/* AMV 2 (65A) - Background (z = -2) na Segunda Linha (x = 2.5) */}
      <group 
        position={[2.5, 0, -2]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[-0.41, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[0.8, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isReverse={amvs[1] !== 'NORMAL'} />
        
        <Text position={[-5, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.4} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2
        </Text>
      </group>
      
      <FrogInfo x={2.5} z={-7} />

      {/* AMV 1 (65B) - Foreground (z = 18) */}
      <group 
        position={[0, 0, 18]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.41, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[0.8, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isReverse={amvs[0] !== 'NORMAL'} />
        
        <Text position={[-4, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.6} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1
        </Text>
      </group>
      
      <FrogInfo x={0.8} z={10} />

      {/* Placas de identificação dentro das linhas */}
      <TrackLinePlate label="L-02" x={0} z={-30} />
      <TrackLinePlate label="L-01" x={2.5} z={-30} />
      <TrackLinePlate label="L-128" x={5.0} z={-30} />
    </group>
  );
}

function Freio02AmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  // AMV 1 at z = 22 (Agulha 02)
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  // AMV 2 at z = 5 (Agulha 01, na esquerda em x = -1.5)
  const getTips2 = () => {
    if (amvs[1] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[1] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  // AMV 3 at z = 5 (Agulha 128, na direita em x = 1.5)
  const getTips3 = () => {
    if (amvs[2] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[2] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  return (
    <group>
      <Sleepers layoutType="freio_02" />
      
      {/* Entrada principal reta de z=45 a z=25 */}
      <RailSegment start={[-0.8, 0, 55]} end={[-0.8, 0, 25]} />
      <RailSegment start={[0.8, 0, 55]} end={[0.8, 0, 25]} />

      <CurveBranch layoutType="freio_02" />

      {/* AMV 1 - Agulha 02 (z = 22, x = 0) */}
      <group 
        position={[0, 0, 22]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.4, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[0.4, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} />
        
        <Text position={[-5, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.5} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 02 (1)
        </Text>
      </group>

      <FrogInfo x={0} z={15} />

      {/* AMV 2 - Agulha 01 (z = 5, x = -1.5) */}
      <group 
        position={[-1.5, 0, 5]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[-0.4, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[0.4, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={true} />
        
        <Text position={[-3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.4} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 01 (2)
        </Text>
      </group>

      <FrogInfo x={-1.5} z={-2} />

      {/* AMV 3 - Agulha 128 (z = 5, x = 1.5) */}
      <group 
        position={[1.5, 0, 5]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(2); onToggleAmv(2); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={2} hinge={[-0.4, 0, -5]} tipTargetX={getTips3().left} tipZ={0} />
        <AnimatedPoint amvIndex={2} hinge={[0.4, 0, -5]} tipTargetX={getTips3().right} tipZ={0} />
        <TieBar amvIndex={2} getLeftTipX={() => getTips3().left} getRightTipX={() => getTips3().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips3().left} tipZ={0} isLeftSide={false} />
        
        <Text position={[3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.4} color={selectedAmv === 2 ? "#818cf8" : "#64748b"}>
          AMV 128 (3)
        </Text>
      </group>

      <FrogInfo x={1.5} z={-2} />

      {/* Placas de identificação dentro das linhas */}
      <TrackLinePlate label="L-02" x={-3.0} z={-28} />
      <TrackLinePlate label="L-01" x={-1.0} z={-28} />
      <TrackLinePlate label="L-128" x={1.0} z={-28} />
      <TrackLinePlate label="AUX" x={3.0} z={-28} />
    </group>
  );
}

function OficinaAmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const getTips2 = () => {
    if (amvs[1] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[1] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const getTips3 = () => {
    const a3 = amvs[2] || 'NORMAL';
    if (a3 === 'FALHA') return { left: -0.65, right: 0.65 };
    if (a3 === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const amv1RightHingeX = getOficinaTrack1X(20) + 0.8;
  const amv2RightHingeX = getOficinaTrack2X(3) + 0.8;
  const amv3RightHingeX = getOficinaTrack3X(-17) + 0.8;

  const rot167 = Math.atan2(getOficinaTrack1X(-23.1) - getOficinaTrack1X(-24.1), 1.0);
  const rot166 = Math.atan2(getOficinaTrack2X(-23.1) - getOficinaTrack2X(-24.1), 1.0);
  const rot165 = Math.atan2(getOficinaTrack3X(-35.1) - getOficinaTrack3X(-36.1), 1.0);

  return (
    <group>
      <CurveBranch layoutType="oficina" />
      <Sleepers layoutType="oficina" />

      {/* AMV 1 - Acesso à L-167 (z = 25, x = 0) */}
      <group 
        position={[0, 0, 25]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[amv1RightHingeX, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={false} isReverse={amvs[0] !== 'NORMAL'} />
        
        <Text position={[3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.3} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1 (167)
        </Text>
      </group>

      <FrogInfo x={-0.8} z={15} />

      {/* AMV 2 - Acesso à L-166 / Linha do Sopro (z = 8, x = 0) */}
      <group 
        position={[0, 0, 8]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[-0.8, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[amv2RightHingeX, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={false} isReverse={amvs[1] !== 'NORMAL'} />
        
        <Text position={[3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.3} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2 (166)
        </Text>
      </group>

      <FrogInfo x={-0.8} z={-2} />

      {/* AMV 3 - Mais à frente depois do AMV da 166: Acesso à L-165 ou Reta (z = -12, x = 0) */}
      <group 
        position={[0, 0, -12]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(2); onToggleAmv(2); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={2} hinge={[-0.8, 0, -5]} tipTargetX={getTips3().left} tipZ={0} />
        <AnimatedPoint amvIndex={2} hinge={[amv3RightHingeX, 0, -5]} tipTargetX={getTips3().right} tipZ={0} />
        <TieBar amvIndex={2} getLeftTipX={() => getTips3().left} getRightTipX={() => getTips3().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips3().left} tipZ={0} isLeftSide={false} isReverse={(amvs[2] || 'NORMAL') !== 'NORMAL'} />
        
        <Text position={[3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.3} color={selectedAmv === 2 ? "#818cf8" : "#64748b"}>
          AMV 3 (165/RETA)
        </Text>
      </group>

      <FrogInfo x={-0.8} z={-21} />

      {/* Placas de identificação dentro das linhas assentadas nos dormentes */}
      <TrackLinePlate label="L-167" x={getOficinaTrack1X(-23.6)} z={-23.6} rotY={rot167} />
      <TrackLinePlate label="L-166" badge="SOPRO" x={getOficinaTrack2X(-23.6)} z={-23.6} rotY={rot166} />
      <TrackLinePlate label="L-165" x={getOficinaTrack3X(-35.6)} z={-35.6} rotY={rot165} />
      <TrackLinePlate label="L-152" x={0} z={-35.6} />

      {/* Locomotiva estacionada na Linha L-166 (Linha do Sopro) mais atrás da placa e com farol desligado */}
      <Locomotive3D
        position={[getOficinaTrack2X(-37.5), 0, -37.5]}
        rotation={[
          0,
          Math.atan2(getOficinaTrack2X(-36.0) - getOficinaTrack2X(-39.0), 3.0),
          0,
        ]}
        headlightsOff={true}
      />
    </group>
  );
}

function ReclassificacaoAmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const getTips2 = () => {
    if (amvs[1] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[1] === 'REVERSO') return { left: -0.8, right: 0.5 }; // Right branching, so reverso goes right
    return { left: -0.5, right: 0.8 }; // Normal goes straight/left
  };

  return (
    <group>
      <CurveBranch layoutType="reclassificacao" />
      <Sleepers layoutType="reclassificacao" />

      {/* AMV 1 - Branches Left (z = 25, x = 0) */}
      <group 
        position={[0, 0, 25]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[0.02, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={true} />
        
        <Text position={[3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.4} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1
        </Text>
      </group>

      <FrogInfo x={-1.5} z={18} />

      {/* AMV 2 - Branches Right (z = 5, x = -5) */}
      <group 
        position={[-5, 0, 5]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[-0.41, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[0.8, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={false} isReverse={amvs[1] !== 'NORMAL'} />
        
        <Text position={[-3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.4} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2
        </Text>
      </group>

      <FrogInfo x={-3.5} z={-2} />

      {/* Placas de identificação dentro das linhas */}
      <TrackLinePlate label="L-107A" x={-5.0} z={-30} />
      <TrackLinePlate label="L-106A" x={-2.5} z={-30} />
      <TrackLinePlate label="L-105A" x={0} z={-30} />
    </group>
  );
}

function PnOficinaAmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  return (
    <group>
      <CurveBranch layoutType="pn_oficina" />
      <Sleepers layoutType="pn_oficina" />
      
      {/* Visual PN (Passagem em Nível) at z = 15 */}
      <group position={[0, 0.02, 15]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={`pn-plank-${i}`} position={[0, 0, -i * 0.8 + 2]} receiveShadow>
            <boxGeometry args={[4, 0.05, 0.7]} />
            <meshStandardMaterial color="#8B4513" roughness={0.9} />
          </mesh>
        ))}
        <Text position={[4, 0.5, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.2} color="#facc15">
          PN OFICINA
        </Text>
      </group>

      {/* Main line 173 */}
      <RailSegment start={[-0.8, 0, 55]} end={[-0.8, 0, 5]} />
      <RailSegment start={[-0.8, 0, 0]} end={[-0.8, 0, -55]} />
      
      <RailSegment start={[0.8, 0, 55]} end={[0.8, 0, -55]} />

      {/* AMV 1 - Branches Left (z = 5, x = 0) */}
      <group 
        position={[0, 0, 5]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[0.41, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={false} />
        
        <Text position={[3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.4} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1
        </Text>
      </group>

      <FrogInfo x={-0.8} z={-2} />

      {/* Placas de identificação dentro das linhas */}
      <TrackLinePlate label="L-159" x={-2.5} z={-26} />
      <TrackLinePlate label="L-173" x={0} z={-26} />
    </group>
  );
}

function DoubleAmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const getTips2 = () => {
    if (amvs[1] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[1] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  return (
    <group>
      <Sleepers layoutType="default" />
      <RailSegment start={[-0.8, 0, 55]} end={[-0.8, 0, -55]} />
      <RailSegment start={[0.8, 0, 55]} end={[0.8, 0, 5]} />
      <RailSegment start={[0.8, 0, 0]} end={[0.8, 0, -55]} />
      <CurveBranch layoutType="default" />

      {/* AMV 1 - Top */}
      <group 
        position={[0, 0, 25]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[0.8, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} />
        <Text position={[-3, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={2} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1
        </Text>
      </group>

      <FrogInfo x={0.8} z={22} />

      {/* AMV 2 - Bottom */}
      <group 
        position={[0, 0, -25]} rotation={[0, Math.PI, 0]} scale={[-1, 1, 1]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[-0.8, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[0.8, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} />
        <Text position={[-3, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} scale={[-1, 1, 1]} fontSize={2} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2
        </Text>
      </group>

      <FrogInfo x={-0.8} z={-22} />

      {/* Placas de identificação dentro das linhas */}
      <TrackLinePlate label="PRINCIPAL" x={0} z={-12.5} />
      <TrackLinePlate label="DESVIO" x={3.725} z={-12.5} />
    </group>
  );
}

// ---------------------------------------------------------
// SAFETY LOGIC & DIAGNOSIS
// ---------------------------------------------------------

function getSafetyStatus(layoutType: LayoutType, direction: Direction, amvs: SwitchState[], spawnLine: SpawnLine = '128', destLine: SpawnLine = '128') {
  const amv1 = amvs[0];
  const amv2 = amvs[1];

  if (layoutType === 'passageiro_02') {
    const amvTP2B = amvs[0];
    const amvTP3B = amvs[1];
    const amvTP04 = amvs[2];
    const amvTP05 = amvs[3] || 'NORMAL';
    const targetLine = direction === 'NORTE_SUL' ? destLine : spawnLine;

    if (direction === 'NORTE_SUL') {
      if (targetLine === 'TP2B') {
        if (amvTP2B === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV TP-2B)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha manual do AMV TP-2B entreaberta! Descarrilamento iminente na entrada direita.' };
        if (amvTP2B === 'REVERSO') {
          if (amvTP3B === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV TP-3B)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'O AMV TP-2B desvia pelo travessão e a agulha do AMV TP-3B está entreaberta!' };
          if (amvTP3B !== 'REVERSO') return { status: 'PERIGO CRÍTICO (AMV TP-3B CONTRA)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'O trem vem pelo travessão da TP-2B, mas o AMV TP-3B está CONTRA (em Reta)! Talonamento e descarrilamento no AMV TP-3B.' };
          return { status: 'ROTA INCORRETA (DESVIO TRAVESSÃO)', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O AMV TP-2B desviará o trem pelo travessão para a TP-3B ao invés de seguir reto na TP-2B.' };
        }
        return { status: 'ROTA SEGURA (LINHA TP-2B)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMV da TP-2B alinhado na Reta. Via livre ao lado do Galpão de Passageiros.' };
      } else if (targetLine === 'TP3B') {
        if (amvTP2B === 'REVERSO') {
          if (amvTP3B === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV TP-3B)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha do AMV TP-3B entreaberta na chegada do travessão!' };
          if (amvTP3B !== 'REVERSO') return { status: 'PERIGO CRÍTICO (AMV TP-3B CONTRA)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'O trem vem pelo travessão da TP-2B, mas o AMV TP-3B está CONTRA (em Reta)! Coloque o AMV TP-3B em Reversa (amarelo).' };
          return { status: 'ROTA SEGURA (TRAVESSÃO TP-2B ➔ TP-3B)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Ambos os AMVs (TP-2B e TP-3B) em Reversa. Travessão diagonal alinhado com segurança!' };
        }
        if (amvTP04 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV TP-04)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha do AMV TP-04 entreaberta! Descarrilamento iminente.' };
        if (amvTP04 === 'REVERSO') {
          if (amvTP05 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV TP-05)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'O AMV TP-04 desvia para TP-04/TP-05 e a agulha do AMV TP-05 está entreaberta!' };
          return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'O AMV TP-04 desviará o trem para TP-04/TP-05 ao invés de seguir reto na TP-3B.' };
        }
        if (amvTP3B === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV TP-3B)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha do AMV TP-3B entreaberta! Descarrilamento iminente.' };
        if (amvTP3B === 'REVERSO') return { status: 'PERIGO CRÍTICO (AMV TP-3B CONTRA)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'O AMV TP-3B está CONTRA (em Reversa para o travessão)! O trem vindo reto na TP-3B vai talonar a chave.' };
        return { status: 'ROTA SEGURA (LINHA TP-3B)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMVs TP-04 e TP-3B alinhados na Reta (bandeirola verde). Via direta livre rumo ao Galpão.' };
      } else {
        if (amvTP04 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV TP-04)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha do AMV TP-04 entreaberta! Descarrilamento iminente.' };
        if (amvTP04 !== 'REVERSO') {
          if (amvTP3B === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV TP-3B)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'O trem segue reto na TP-3B e a agulha do AMV TP-3B está entreaberta!' };
          if (amvTP3B === 'REVERSO') return { status: 'PERIGO CRÍTICO (AMV TP-3B CONTRA)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'O AMV TP-04 está em Reta e o AMV TP-3B está CONTRA (em Reversa)! Talonamento no AMV TP-3B.' };
          return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: `Coloque o AMV TP-04 em Reversa para acessar a linha ${targetLine === 'TP05' ? 'TP-05' : 'TP-04'}.` };
        }
        if (amvTP05 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV TP-05)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha do AMV TP-05 entreaberta! Descarrilamento iminente.' };
        if (targetLine === 'TP04' && amvTP05 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'O AMV TP-05 desviará a composição para a TP-05 ao invés de seguir na TP-04.' };
        if (targetLine === 'TP05' && amvTP05 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Coloque o AMV TP-05 em Reversa para acessar a linha TP-05.' };
        return { status: `ROTA SEGURA (LINHA ${targetLine === 'TP05' ? 'TP-05' : 'TP-04'})`, bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: `AMVs alinhados corretamente rumo ao Galpão.` };
      }
    } else {
      if (spawnLine === 'TP2B') {
        if (amvTP2B !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV TP-2B)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da TP-2B talonará o AMV TP-2B se não estiver em Reta.' };
      } else if (spawnLine === 'TP3B') {
        if (amvTP3B === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV TP-3B)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha do AMV TP-3B entreaberta na saída da TP-3B!' };
        if (amvTP3B === 'REVERSO' && amvTP2B !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV TP-2B)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Saindo da TP-3B pelo travessão, mas o AMV TP-2B não está em Reversa!' };
        if (amvTP3B === 'NORMAL' && amvTP04 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV TP-04)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Saindo reto da TP-3B, mas o AMV TP-04 não está em Reta!' };
      } else if (spawnLine === 'TP04') {
        if (amvTP05 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV TP-05)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Saindo da TP-04, mas o AMV TP-05 não está em Reta!' };
        if (amvTP04 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV TP-04)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Saindo da TP-04, mas o AMV TP-04 não está em Reversa!' };
      } else if (spawnLine === 'TP05') {
        if (amvTP05 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV TP-05)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Saindo da TP-05, mas o AMV TP-05 não está em Reversa!' };
        if (amvTP04 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV TP-04)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Saindo da TP-05, mas o AMV TP-04 não está em Reversa!' };
      }
      const labelMap: Record<string, string> = { TP05: 'TP-05', TP04: 'TP-04', TP3B: 'TP-3B', TP2B: 'TP-2B' };
      return { status: `ROTA SEGURA (SAÍDA ${labelMap[spawnLine] || spawnLine})`, bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Saída alinhada com segurança.' };
    }
  }

  if (layoutType === 'oficina_central') {
    const amv3 = amvs[2];
    const amv4 = amvs[3] || 'NORMAL';
    const targetLine = direction === 'NORTE_SUL' ? destLine : spawnLine;

    if (targetLine === '158') {
      return {
        status: 'ROTA SEGURA (L-158 • 5KM/H)',
        bg: 'bg-emerald-500/10 border-emerald-500/20',
        color: 'text-emerald-500',
        icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
        desc: 'Via L-158 externa livre. Respeite o limite de velocidade de 5 KM/h ao lado da contenção da Oficina Central.'
      };
    }

    const isRightGroup = targetLine === '163' || targetLine === '164' || targetLine === '165';

    if (direction === 'NORTE_SUL') {
      if (!isRightGroup) {
        if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 1 central! Descarrilamento iminente.' };
        if (destLine === '162') {
          if (amv1 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O AMV 1 desviará a composição para L-160/L-161 ao invés de seguir reto na L-162.' };
          return { status: 'ROTA SEGURA (LINHA L-162)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada na reta para a Linha L-162 (Caminho Seguro bloqueado pelo auxiliar).' };
        }
        if (amv1 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: `Destino incorreto! O trem seguirá reto na L-162 ao invés de desviar para L-${destLine}.` };
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 2! Descarrilamento antes do Caminho Seguro.' };
        if (destLine === '161') {
          if (amv2 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O AMV 2 desviará o trem para a L-160 ao invés da L-161.' };
          return { status: 'ROTA SEGURA (LINHA L-161)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha L-161 rumo ao Galpão Oficina Central.' };
        }
        if (amv2 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na L-161 ao invés da L-160.' };
        return { status: 'ROTA SEGURA (LINHA L-160)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha L-160 rumo ao Galpão Oficina Central.' };
      } else {
        if (amv3 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 3 direito! Descarrilamento iminente.' };
        if (destLine === '165') {
          if (amv3 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O AMV 3 desviará para L-163/L-164 ao invés de seguir reto na L-165.' };
          return { status: 'ROTA SEGURA (LINHA L-165)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada na reta para a Linha L-165 (Caminho Seguro bloqueado pelo auxiliar).' };
        }
        if (amv3 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: `Destino incorreto! O trem seguirá reto na L-165 ao invés de desviar para L-${destLine}.` };
        if (amv4 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 4)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 4! Descarrilamento antes do Caminho Seguro.' };
        if (destLine === '164') {
          if (amv4 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O AMV 4 desviará para a L-163 ao invés da L-164.' };
          return { status: 'ROTA SEGURA (LINHA L-164)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha L-164 rumo ao Galpão Oficina Central.' };
        }
        if (amv4 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá para a L-164 ao invés de entrar na L-163.' };
        return { status: 'ROTA SEGURA (LINHA L-163)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha L-163 rumo ao Galpão Oficina Central.' };
      }
    } else {
      // SUL_NORTE (saindo do Galpão da Oficina Central)
      if (spawnLine === '160') {
        if (amv2 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-160 talonará o AMV 2 se não estiver em Reversa.' };
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-160 talonará o AMV 1 se não estiver em Reversa.' };
      } else if (spawnLine === '161') {
        if (amv2 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-161 talonará o AMV 2 se não estiver em Reta.' };
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-161 talonará o AMV 1 se não estiver em Reversa.' };
      } else if (spawnLine === '162') {
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-162 talonará o AMV 1 se não estiver em Reta.' };
      } else if (spawnLine === '163') {
        if (amv4 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 4)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-163 talonará o AMV 4 se não estiver em Reversa.' };
        if (amv3 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-163 talonará o AMV 3 se não estiver em Reversa.' };
      } else if (spawnLine === '164') {
        if (amv4 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 4)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-164 talonará o AMV 4 se não estiver em Reta.' };
        if (amv3 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-164 talonará o AMV 3 se não estiver em Reversa.' };
      } else if (spawnLine === '165') {
        if (amv3 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-165 talonará o AMV 3 se não estiver em Reta.' };
      }
      return { status: `ROTA SEGURA (SAÍDA L-${spawnLine})`, bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Saída do Galpão Oficina Central alinhada com segurança.' };
    }
  }

  if (layoutType === 'abaixo_oficina') {
    const amv3 = amvs[2];
    const amv4 = amvs[3] || 'NORMAL';
    const amv5 = amvs[4] || 'NORMAL';
    const amv6 = amvs[5] || 'NORMAL';
    const targetLine = direction === 'NORTE_SUL' ? destLine : spawnLine;

    const isLeftTrunk = targetLine === '165' || targetLine === '166';

    if (direction === 'NORTE_SUL') {
      if (isLeftTrunk) {
        if (amv3 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 3 (165/166)! Descarrilamento iminente.' };
        if (destLine === '165') {
          if (amv3 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Coloque o AMV 3 (165/166) em Reta para a Linha L-165 passar sem talonar a agulha!' };
          return { status: 'ROTA SEGURA (LINHA L-165)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMV 3 (165/166) alinhado para a Linha L-165 rumo à Manutenção de Locomotivas.' };
        }
        if (amv3 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Coloque o AMV 3 (165/166) em Reversa para conectar a L-166 à via principal!' };
        return { status: 'ROTA SEGURA (LINHA L-166)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMV 3 (165/166) em Reversa conectando a Linha L-166.' };
      } else {
        // Right Trunk (L-164, L-163, L-162, L-161, L-160, L-173)
        if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 1 principal! Descarrilamento iminente.' };
        if (destLine === '164' || destLine === '163') {
          if (amv1 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: `Destino incorreto! Coloque o AMV 1 em Reversa para desviar à esquerda rumo à Linha L-${destLine}.` };
          if (amv5 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 5)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 5 (164/163)! Descarrilamento iminente.' };
          if (destLine === '164') {
            if (amv5 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! Coloque o AMV 5 (164/163) em Reversa para acessar a Linha L-164.' };
            return { status: 'ROTA SEGURA (LINHA L-164)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMV 1 e AMV 5 em Reversa. Composição desviando para a Linha L-164 rumo ao Galpão Branco.' };
          }
          if (amv5 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O AMV 5 (164/163) desviará o trem para a L-164 ao invés de seguir na L-163.' };
          return { status: 'ROTA SEGURA (LINHA L-163)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMV 1 em Reversa e AMV 5 em Reta. Composição alinhada para a Linha L-163 rumo ao Galpão da Oficina Central.' };
        }
        if (amv1 === 'REVERSO') {
          if (amv5 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 5)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 5 (164/163)! Descarrilamento iminente.' };
          return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: `Destino incorreto! O AMV 1 desviará o trem para L-163/L-164 ao invés de seguir para L-${destLine}.` };
        }
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 2 (162/173)! Descarrilamento iminente.' };
        if (destLine === '162') {
          if (amv2 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O AMV 2 desviará o trem para a puxada da L-173 (161/160/173) ao invés da L-162.' };
          return { status: 'ROTA SEGURA (LINHA L-162)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMVs 1 e 2 na Reta. Composição alinhada diretamente para a Linha L-162.' };
        }
        if (amv2 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: `Destino incorreto! Coloque o AMV 2 em Reversa para entrar na puxada da L-173 rumo à L-${destLine}.` };
        if (amv4 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 4)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 4 (161/173)! Descarrilamento iminente.' };
        if (destLine === '161') {
          if (amv4 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! Coloque o AMV 4 (161/173) em Reversa (curva à esquerda) para entrar na Linha L-161.' };
          return { status: 'ROTA SEGURA (LINHA L-161)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada (AMV 1 Reta, AMV 2 Reversa na L-173, AMV 4 Reversa à esquerda) para a Linha L-161.' };
        }
        if (amv4 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: `Destino incorreto! O AMV 4 desviará à esquerda para a L-161 ao invés de seguir na L-173 para L-${destLine}.` };
        if (amv6 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 6)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 6 (160/173)! Descarrilamento iminente.' };
        if (destLine === '160') {
          if (amv6 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! Coloque o AMV 6 (160/173) em Reversa (curva à esquerda) para acessar a Linha L-160.' };
          return { status: 'ROTA SEGURA (LINHA L-160)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada (AMV 2 Reversa na L-173, AMV 4 Reta, AMV 6 Reversa à esquerda) para a Linha L-160.' };
        }
        // destLine === '173'
        if (amv6 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O AMV 6 desviará à esquerda para a L-160 ao invés de seguir na L-173.' };
        return {
          status: 'ROTA SEGURA (L-173 • 5KM ABAIXO DA PN)',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          color: 'text-emerald-500',
          icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
          desc: 'Grande puxada em curva à direita da L-173 alinhada (AMV 2 Reversa, AMV 4 e AMV 6 Reta). Limite de 5 KM/h.'
        };
      }
    } else {
      // SUL_NORTE (Saindo do Galpão da Oficina Central)
      if (spawnLine === '166') {
        if (amv3 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Coloque o AMV 3 (165/166) em Reversa para entrar na Linha L-166!' };
      } else if (spawnLine === '165') {
        if (amv3 !== 'NORMAL') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Coloque o AMV 3 (165/166) em Reta para seguir pela Linha L-165!' };
      } else if (spawnLine === '164') {
        if (amv5 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 5)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-164 talonará o AMV 5 (164/163) se não estiver em Reversa!' };
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-164 talonará o AMV 1 se não estiver em Reversa!' };
      } else if (spawnLine === '163') {
        if (amv5 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 5)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-163 talonará o AMV 5 (164/163) se não estiver em Reta!' };
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-163 talonará o AMV 1 se não estiver em Reversa!' };
      } else if (spawnLine === '162') {
        if (amv2 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-162 talonará o AMV 2 se não estiver em Reta!' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-162 talonará o AMV 1 se não estiver em Reta!' };
      } else if (spawnLine === '161') {
        if (amv4 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 4)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-161 talonará o AMV 4 (161/173) se não estiver em Reversa!' };
        if (amv2 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-161 talonará o AMV 2 se não estiver em Reversa!' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-161 talonará o AMV 1 se não estiver em Reta!' };
      } else if (spawnLine === '160') {
        if (amv6 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 6)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-160 talonará o AMV 6 (160/173) se não estiver em Reversa!' };
        if (amv4 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 4)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-160 pela L-173 talonará o AMV 4 se não estiver em Reta!' };
        if (amv2 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-160 talonará o AMV 2 se não estiver em Reversa!' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-160 talonará o AMV 1 se não estiver em Reta!' };
      } else if (spawnLine === '173') {
        if (amv6 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 6)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-173 talonará o AMV 6 (160/173) se não estiver em Reta!' };
        if (amv4 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 4)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-173 talonará o AMV 4 (161/173) se não estiver em Reta!' };
        if (amv2 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-173 talonará o AMV 2 (162/173) se não estiver em Reversa!' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (TALONAMENTO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-173 talonará o AMV 1 se não estiver em Reta!' };
      }
      return { status: `ROTA SEGURA (SAÍDA L-${spawnLine})`, bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Saída abaixo do Galpão da Oficina Central alinhada com segurança.' };
    }
  }

  if (layoutType === 'passageiro_01') {
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 1 automático.' };

      if (destLine === 'TP01') {
        if (amv1 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem desviará para TP-2A/TP-3A ao invés de seguir na curva da TP-01.' };
        return { status: 'ROTA SEGURA (LINHA TP-01)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente na curva à esquerda da linha TP-01 (Rampa 1,30%).' };
      }

      if (destLine === 'TP2A') {
        if (amv1 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá para TP-01 ao invés de entrar para a TP-2A.' };
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 2 automático.' };
        if (amv2 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na TP-3A ao invés de prosseguir na curva central TP-2A.' };
        return { status: 'ROTA SEGURA (LINHA TP-2A)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente na curva central à esquerda da linha TP-2A.' };
      }

      if (destLine === 'TP3A') {
        if (amv1 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá para TP-01 ao invés de desviar para TP-3A.' };
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 2 automático.' };
        if (amv2 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá pela TP-2A ao invés de entrar na curva externa TP-3A.' };
        return { status: 'ROTA SEGURA (LINHA TP-3A)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente na curva externa à esquerda da linha TP-3A.' };
      }
    } else {
      if (spawnLine === 'TP3A') {
        if (amv2 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (AMV CONTRA 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da TP-3A encontrará o AMV 2 contra se não estiver em Reversa.' };
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (AMV CONTRA 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da TP-3A encontrará o AMV 1 contra se não estiver em Reversa.' };
      } else if (spawnLine === 'TP2A') {
        if (amv2 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (AMV CONTRA 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da TP-2A encontrará o AMV 2 contra se não estiver em Reta (Normal).' };
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (AMV CONTRA 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da TP-2A encontrará o AMV 1 contra se não estiver em Reversa.' };
      } else {
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (AMV CONTRA 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da TP-01 encontrará o AMV 1 contra se não estiver em Reta (Normal).' };
      }
      return { status: `ROTA SEGURA (SAÍDA ${spawnLine === 'TP3A' ? 'TP-3A' : spawnLine === 'TP2A' ? 'TP-2A' : 'TP-01'})`, bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMVs automáticos alinhados com segurança para saída da curva.' };
    }
  }

  if (layoutType === 'pn_oficina') {
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 1.' };
      
      if (destLine === '159') {
        if (amv1 !== 'REVERSO') {
          return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá em frente (L-173) ao invés de entrar na L-159.' };
        }
        return { status: 'ROTA SEGURA (LINHA 159)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha 159.' };
      }
      
      if (destLine === '173') {
        if (amv1 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na L-159 ao invés de seguir reto para a L-173.' };
        return { status: 'ROTA SEGURA (LINHA 173)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha 173.' };
      }
    } else {
      // Sentido Sul -> Norte (vindo das ramificações)
      if (spawnLine === '159') {
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha 159 talonará o AMV 1 se não estiver Reverso.' };
      } else {
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha 173 talonará o AMV 1 se não estiver Normal.' };
      }
      return { status: 'ROTA SEGURA (SAÍDA)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Saída da PN alinhada com segurança.' };
    }
  }

  if (layoutType === 'oficina') {
    const amv3 = amvs[2] || 'NORMAL';
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 1 (167). Descarrilamento iminente.' };

      if (destLine === '167') {
        if (amv1 !== 'REVERSO') {
          return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! Coloque o AMV 1 em Reversa para entrar na curva à esquerda da Linha L-167.' };
        }
        return { status: 'ROTA SEGURA (LINHA L-167)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMV 1 em Reversa. Rota alinhada para a curva à esquerda da Linha L-167.' };
      }

      if (amv1 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: `Destino incorreto! O AMV 1 desviará o trem para a L-167 ao invés de seguir para L-${destLine}.` };
      if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 2 (166). Descarrilamento iminente.' };

      if (destLine === '166') {
        if (amv2 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! Coloque o AMV 2 em Reversa para entrar na curva à esquerda da Linha L-166 (Linha do Sopro).' };
        return { status: 'ROTA SEGURA (L-166 • LINHA DO SOPRO)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMV 1 na Reta e AMV 2 em Reversa. Rota alinhada para a curva à esquerda da L-166 (Linha do Sopro).' };
      }

      if (amv2 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: `Destino incorreto! O AMV 2 desviará o trem para a L-166 ao invés de seguir para L-${destLine}.` };
      if (amv3 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 3 (165/Reta). Descarrilamento iminente.' };

      if (destLine === '165') {
        if (amv3 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! Coloque o AMV 3 em Reversa para acessar a Linha L-165.' };
        return { status: 'ROTA SEGURA (LINHA L-165)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMVs 1 e 2 na Reta e AMV 3 em Reversa. Composição alinhada para a Linha L-165.' };
      }

      // destLine === '152' (Reta)
      if (amv3 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O AMV 3 desviará o trem para a L-165 ao invés de seguir na Reta (152).' };
      return { status: 'ROTA SEGURA (RETA • 152 TRAVESSÕES)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMVs 1, 2 e 3 alinhados na Reta. Via livre diretamente para 152 travessões.' };
    } else {
      if (spawnLine === '167') {
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha L-167 talonará o AMV 1 se não estiver em Reversa.' };
      } else if (spawnLine === '166') {
        if (amv2 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha L-166 talonará o AMV 2 se não estiver em Reversa.' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha L-166 talonará o AMV 1 se não estiver na Reta.' };
      } else if (spawnLine === '165') {
        if (amv3 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha L-165 talonará o AMV 3 se não estiver em Reversa.' };
        if (amv2 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha L-165 talonará o AMV 2 se não estiver na Reta.' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha L-165 talonará o AMV 1 se não estiver na Reta.' };
      } else {
        if (amv3 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem na Reta (152) talonará o AMV 3 se não estiver na Reta.' };
        if (amv2 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem na Reta (152) talonará o AMV 2 se não estiver na Reta.' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem na Reta (152) talonará o AMV 1 se não estiver na Reta.' };
      }
      return { status: `ROTA SEGURA (SAÍDA L-${spawnLine})`, bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Saída da oficina alinhada com segurança pelos 3 AMVs.' };
    }
  } else if (layoutType === 'reclassificacao') {
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 1.' };
      
      if (destLine === '105A') {
        if (amv1 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na L-107A ao invés de seguir na reta principal L-105A.' };
        return { status: 'ROTA SEGURA (LINHA 105A)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha L-105A.' };
      }
      
      if (destLine === '107A') {
        if (amv1 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá direto para L-105A ao invés de entrar na L-107A.' };
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 2.' };
        if (amv2 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na L-106A ao invés de prosseguir para a L-107A.' };
        return { status: 'ROTA SEGURA (LINHA 107A)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha L-107A.' };
      }

      if (destLine === '106A') {
        if (amv1 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá direto para L-105A.' };
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 2.' };
        if (amv2 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá direto para L-107A ao invés de entrar na L-106A.' };
        return { status: 'ROTA SEGURA (LINHA 106A)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha L-106A.' };
      }
    } else {
      if (spawnLine === '107A') {
        if (amv2 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha L-107A talonará o AMV 2 se não estiver Normal.' };
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha L-107A talonará o AMV 1 se não estiver Reverso.' };
      } else if (spawnLine === '106A') {
        if (amv2 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha L-106A talonará o AMV 2 se não estiver Reverso.' };
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha L-106A talonará o AMV 1 se não estiver Reverso.' };
      } else {
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem na principal talonará o AMV 1 se não estiver Normal.' };
      }
      return { status: 'ROTA SEGURA (SAÍDA)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Saída da reclassificação alinhada com segurança.' };
    }
  } else if (layoutType === 'reclassificacao_02') {
    const amv3 = amvs[2] || 'NORMAL';
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 1 (109A/109)! Descarrilamento iminente.' };

      if (destLine === '109') {
        if (amv1 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! Coloque os AMVs 1 e 2 em Reversa para desviar pelo travessão para a Linha L-109.' };
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 2 (L-109)! Descarrilamento iminente.' };
        if (amv2 !== 'REVERSO') return { status: 'PERIGO: BATER CONTRA A CHAVE (AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Travessão do AMV 1 ativo para a L-109, mas o AMV 2 está na Reta (fechado)! Coloque o AMV 2 em Reversa.' };
        return { status: 'ROTA SEGURA (LINHA L-109)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMVs 1 e 2 em Reversa. Rota alinhada pelo travessão principal para a Linha L-109.' };
      }

      if (amv1 === 'REVERSO') {
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 2 (L-109)! Descarrilamento iminente.' };
        if (amv2 !== 'REVERSO') return { status: 'PERIGO: BATER CONTRA A CHAVE (AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'AMV 1 desviou para o travessão da L-109, mas o AMV 2 está na Reta (fechado)! O trem baterá contra a chave.' };
        return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: `Destino incorreto! O AMV 1 desviará o trem para a L-109 ao invés de seguir para L-${destLine}.` };
      }

      if (amv3 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 3 (121/122)! Descarrilamento iminente.' };

      if (destLine === '122') {
        if (amv3 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! Coloque o AMV 3 (121/122) em Reversa para acessar a Linha L-122.' };
        return { status: 'ROTA SEGURA (LINHA L-122)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMV 1 na Reta e AMV 3 em Reversa. Rota alinhada da L-109A para a Linha L-122.' };
      }

      // destLine === '121' or '109A'
      if (amv3 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O AMV 3 desviará o trem à esquerda para a L-122 ao invés de seguir reto na L-121.' };
      return { status: 'ROTA SEGURA (LINHA L-121)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMVs 1 e 3 alinhados na Reta. Rota direta da L-109A para a Linha L-121.' };
    } else {
      // SUL_NORTE (Saindo de L-109, L-122 ou L-121 rumo à L-109A)
      if (spawnLine === '109') {
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 2 (L-109)!' };
        if (amv2 !== 'REVERSO') return { status: 'ROTA SEGURA (RAMO ESQUERDO L-109)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMV 2 na Reta: composição segue direto pelo ramo esquerdo da L-109 (coloque AMVs 2 e 1 em Reversa para ir à L-109A).' };
        if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 1 (109A/109)!' };
        if (amv1 !== 'REVERSO') return { status: 'PERIGO: BATER CONTRA A CHAVE (AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo pelo travessão da L-109 baterá contra a chave no AMV 1 se não estiver em Reversa!' };
        return { status: 'ROTA SEGURA (SAÍDA L-109 ➔ L-109A)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Saída da Linha L-109 pelo travessão (AMVs 2 e 1 em Reversa) alinhada para a L-109A.' };
      }
      if (spawnLine === '122') {
        if (amv3 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 3 (121/122)!' };
        if (amv3 !== 'REVERSO') return { status: 'PERIGO: BATER CONTRA A CHAVE (AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-122 baterá contra a chave no AMV 3 se não estiver em Reversa!' };
        if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 1 (109A/109)!' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO: BATER CONTRA A CHAVE (AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-122 baterá contra a chave no AMV 1 se não estiver na Reta!' };
        return { status: 'ROTA SEGURA (SAÍDA L-122 ➔ L-109A)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMV 3 em Reversa e AMV 1 na Reta. Saída da Linha L-122 alinhada para a L-109A.' };
      }
      // spawnLine === '121' or '109A'
      if (amv3 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 3 (121/122)!' };
      if (amv3 !== 'NORMAL') return { status: 'PERIGO: BATER CONTRA A CHAVE (AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-121 baterá contra a chave no AMV 3 se não estiver na Reta!' };
      if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Agulha entreaberta no AMV 1 (109A/109)!' };
      if (amv1 !== 'NORMAL') return { status: 'PERIGO: BATER CONTRA A CHAVE (AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-121 baterá contra a chave no AMV 1 se não estiver na Reta!' };
      return { status: 'ROTA SEGURA (SAÍDA L-121 ➔ L-109A)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'AMVs 3 e 1 na Reta. Saída direta da Linha L-121 para a L-109A.' };
    }
  }

  if (layoutType === 'freio_02') {
    const amv1_02 = amvs[0]; // AMV 02
    const amv2_02 = amvs[1]; // AMV 01
    const amv3_02 = amvs[2]; // AMV 128

    if (direction === 'NORTE_SUL') {
      if (amv1_02 === 'FALHA') {
        return {
          status: 'PERIGO CRÍTICO (FALHA AMV 02)',
          bg: 'bg-red-500/10 border-red-500/20',
          color: 'text-red-500',
          icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
          desc: 'Falha grave no AMV 02 (Entrada). Agulha entreaberta! O trem descarrilará na primeira agulha.'
        };
      }

      if (amv1_02 === 'NORMAL') {
        if (amv2_02 === 'FALHA') {
          return {
            status: 'PERIGO CRÍTICO (FALHA AMV 01)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'AMV 02 está normal, mas o AMV 01 à frente na esquerda está com agulha entreaberta! Descarrilamento na agulha esquerda.'
          };
        }
        if (amv2_02 === 'NORMAL') {
          return {
            status: 'ROTA SEGURA (VIA L-02)',
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            color: 'text-emerald-500',
            icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
            desc: 'Rota segura alinhada para a linha L-02 (Reta no AMV 02 e AMV 01). Via livre para trânsito.'
          };
        } else {
          return {
            status: 'ROTA SEGURA (VIA L-01)',
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            color: 'text-emerald-500',
            icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
            desc: 'Rota segura alinhada para a linha L-01 (NORMAL no AMV 02 e REVERSO no AMV 01). Via livre para trânsito.'
          };
        }
      } else {
        if (amv3_02 === 'FALHA') {
          return {
            status: 'PERIGO CRÍTICO (FALHA AMV 128)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'AMV 02 está desviado para a direita, mas o AMV 128 à frente está com agulha entreaberta! Descarrilamento na agulha direita.'
          };
        }
        if (amv3_02 === 'NORMAL') {
          return {
            status: 'ROTA SEGURA (VIA L-128)',
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            color: 'text-emerald-500',
            icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
            desc: 'Rota segura alinhada para a linha L-128 (REVERSO no AMV 02 e NORMAL no AMV 128). O trem contornará os vagões bloqueados com sucesso.'
          };
        } else {
          return {
            status: 'ROTA SEGURA (VIA EXTRA DIREITA)',
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            color: 'text-emerald-500',
            icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
            desc: 'Rota segura alinhada para a linha secundária mais à direita (REVERSO no AMV 02 e REVERSO no AMV 128). Via livre de bloqueios.'
          };
        }
      }
    } else {
      return {
        status: 'ROTA INVERSA (SUL-NORTE)',
        bg: 'bg-indigo-500/10 border-indigo-500/20',
        color: 'text-indigo-400',
        icon: <ShieldCheck className="w-8 h-8 text-indigo-400" />,
        desc: 'Trem subindo de Sul para Norte. Certifique o alinhamento correto das 3 agulhas por trás para evitar AMV contra.'
      };
    }
  }


  if (layoutType === 'patio_oficina') {
    const amv1 = amvs[0];
    const amv2 = amvs[1];
    const amv3 = amvs[2];
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 1.' };
      
      if (destLine === '28') {
        if (amv1 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá em frente ao invés de entrar na L-28.' };
        return { status: 'ROTA SEGURA (L-28)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha 28.' };
      }

      if (amv1 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na L-28.' };
      if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 2.' };

      if (destLine === '31') {
        if (amv2 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá em frente ao invés de entrar na L-31.' };
        return { status: 'ROTA SEGURA (L-31)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha 31.' };
      }

      if (amv2 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na L-31.' };
      if (amv3 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 3.' };

      if (destLine === '27') {
        if (amv3 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá para a L-32 ao invés da L-27.' };
        return { status: 'ROTA SEGURA (L-27)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha 27.' };
      }

      if (amv3 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na L-27.' };
      return { status: 'ROTA SEGURA (L-32)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha 32 principal.' };

    } else {
      if (spawnLine === '28' && amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem talonará o AMV 1 se não estiver Reverso.' };
      if (spawnLine === '31') {
        if (amv2 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem talonará o AMV 2 se não estiver Reverso.' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem talonará o AMV 1.' };
      }
      if (spawnLine === '27') {
        if (amv3 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 3)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem talonará o AMV 3 se não estiver Reverso.' };
        if (amv2 !== 'NORMAL' || amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem talonará AMV à frente.' };
      }
      if (spawnLine === '32' || spawnLine === 'P13A') {
        if (amv3 !== 'NORMAL' || amv2 !== 'NORMAL' || amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem talonará AMV à frente.' };
      }
      return { status: 'ROTA SEGURA', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Caminho livre.' };
    }
  }

  if (layoutType === 'carga_geral_02') {
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 1.' };
      
      if (destLine === '24A') {
        if (amv1 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá direto para 22A ao invés de entrar na Auxiliar (24A).' };
        return { status: 'ROTA SEGURA (AUXILIAR 24A)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a linha Auxiliar (24A).' };
      }
      
      if (destLine === '23A') {
        if (amv1 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na Auxiliar (24A) ao invés de prosseguir para a L-23A.' };
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 2.' };
        if (amv2 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá direto para L-22A ao invés de entrar na L-23A.' };
        return { status: 'ROTA SEGURA (LINHA 23A)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha 23A.' };
      }

      if (destLine === '22A') {
        if (amv1 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na Auxiliar (24A) ao invés de seguir na reta principal L-22A.' };
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 2.' };
        if (amv2 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na L-23A ao invés de seguir na reta principal L-22A.' };
        return { status: 'ROTA SEGURA (LINHA 22A)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha Principal 22A.' };
      }
    } else {
      if (spawnLine === '24A') {
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Auxiliar (24A) talonará o AMV 1 se não estiver Reverso.' };
      } else if (spawnLine === '23A') {
        if (amv2 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-23A talonará o AMV 2 se não estiver Reverso.' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da L-23A talonará o AMV 1 se não estiver Normal.' };
      } else {
        if (amv2 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem na principal 22A talonará o AMV 2 se não estiver Normal.' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem na principal 22A talonará o AMV 1 se não estiver Normal.' };
      }
      return { status: 'ROTA SEGURA (SAÍDA)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Saída da Carga Geral 02 alinhada com segurança.' };
    }
  }

  if (layoutType === 'freio') {
    // Linha do Freio Safety Diagnosis (1 AMV)
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA') {
        return {
          status: 'PERIGO CRÍTICO (FALHA AMV 1)',
          bg: 'bg-red-500/10 border-red-500/20',
          color: 'text-red-500',
          icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
          desc: 'Falha no AMV 1. A agulha está entreaberta! A locomotiva descarrilará imediatamente ao entrar na chave.'
        };
      }
      
      if (destLine === '2') {
        if (amv1 === 'REVERSO') {
          return {
            status: 'ROTA INCORRETA (DESVIO)',
            bg: 'bg-orange-500/10 border-orange-500/30',
            color: 'text-orange-400',
            icon: <MapIcon className="w-8 h-8 text-orange-400" />,
            desc: 'Destino incorreto! O trem entrará nos ramais de desvio ao invés de seguir pela via reta até a L-02.'
          };
        }
        return {
          status: 'ROTA SEGURA (LINHA L-02)',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          color: 'text-emerald-500',
          icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
          desc: 'O trajeto está perfeitamente alinhado. O trem seguirá direto na via principal até a L-02.'
        };
      }

      if (destLine === '1') {
        if (amv1 === 'NORMAL') {
          return {
            status: 'ROTA INCORRETA (PRINCIPAL)',
            bg: 'bg-orange-500/10 border-orange-500/30',
            color: 'text-orange-400',
            icon: <MapIcon className="w-8 h-8 text-orange-400" />,
            desc: 'Destino incorreto! O trem seguirá direto na via principal ao invés de entrar nos desvios para a L-01.'
          };
        }
        if (amv2 === 'FALHA') {
          return {
            status: 'PERIGO CRÍTICO (FALHA AMV 2)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'Falha no AMV 2. A agulha está entreaberta. O trem passará o desvio e descarrilará na segunda chave.'
          };
        }
        if (amv2 === 'REVERSO') {
          return {
            status: 'ROTA INCORRETA (LINHA L-128)',
            bg: 'bg-orange-500/10 border-orange-500/30',
            color: 'text-orange-400',
            icon: <MapIcon className="w-8 h-8 text-orange-400" />,
            desc: 'Destino incorreto! O trem entrou nos desvios mas o AMV 2 o levará para a L-128 ao invés da L-01.'
          };
        }
        return {
          status: 'ROTA SEGURA (LINHA L-01)',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          color: 'text-emerald-500',
          icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
          desc: 'Trajeto perfeitamente alinhado. O trem passará pelo primeiro desvio e alinhará no segundo para a L-01.'
        };
      }

      if (destLine === '128') {
        if (amv1 === 'NORMAL') {
          return {
            status: 'ROTA INCORRETA (PRINCIPAL)',
            bg: 'bg-orange-500/10 border-orange-500/30',
            color: 'text-orange-400',
            icon: <MapIcon className="w-8 h-8 text-orange-400" />,
            desc: 'Destino incorreto! O trem seguirá direto na via principal ao invés de entrar nos desvios para a L-128.'
          };
        }
        if (amv2 === 'FALHA') {
          return {
            status: 'PERIGO CRÍTICO (FALHA AMV 2)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'Falha no AMV 2. A agulha está entreaberta. O trem passará o desvio e descarrilará na segunda chave.'
          };
        }
        if (amv2 === 'NORMAL') {
          return {
            status: 'ROTA INCORRETA (LINHA L-01)',
            bg: 'bg-orange-500/10 border-orange-500/30',
            color: 'text-orange-400',
            icon: <MapIcon className="w-8 h-8 text-orange-400" />,
            desc: 'Destino incorreto! O trem entrou nos desvios mas o AMV 2 o levará para a L-01 ao invés da L-128.'
          };
        }
        return {
          status: 'ROTA SEGURA (LINHA L-128)',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          color: 'text-emerald-500',
          icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
          desc: 'Trajeto perfeitamente alinhado. O trem passará pelo primeiro desvio e alinhará no segundo para a L-128.'
        };
      }
    } else {
      // SUL para NORTE (Trailing Points / Subida)
      if (spawnLine === '128') {
        if (amv2 === 'FALHA') {
          return {
            status: 'PERIGO CRÍTICO (FALHA AMV 2)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'Falha no AMV 2. A locomotiva atingirá a ponta morta da agulha entreaberta logo na saída.'
          };
        }
        if (amv2 === 'NORMAL') {
          return {
            status: 'PERIGO (AMV CONTRA 2)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'AMV Contra no 65A. O trem partindo da L-128 cruza a agulha que está fechada para a Reta.'
          };
        }
        if (amv1 === 'FALHA') {
          return {
            status: 'PERIGO CRÍTICO (FALHA AMV 1)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'Falha no AMV 1. Agulha entreaberta, o trem descarrilará mesmo vindo por trás (ponta do talão).'
          };
        }
        if (amv1 === 'NORMAL') {
          return {
            status: 'PERIGO (AMV CONTRA 1)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'AMV Contra no 65B. O trem vindo das linhas secundárias encontra a última agulha fechada contra si.'
          };
        }
        return {
          status: 'ROTA SEGURA (LINHA L-128)',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          color: 'text-emerald-500',
          icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
          desc: 'Trem despachado da L-128 transitará em zig-zag pelos desvios de ambos os AMVs de forma fluída e segura.'
        };
      }

      if (spawnLine === '1') {
        if (amv2 === 'FALHA') {
          return {
            status: 'PERIGO CRÍTICO (FALHA AMV 2)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'Falha no AMV 2. A locomotiva atingirá a ponta morta da agulha entreaberta logo na saída.'
          };
        }
        if (amv2 === 'REVERSO') {
          return {
            status: 'PERIGO (AMV CONTRA 2)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'AMV Contra no 65A. O trem partindo da L-01 cruza a agulha que está aberta para a via secundária L-128.'
          };
        }
        if (amv1 === 'FALHA') {
          return {
            status: 'PERIGO CRÍTICO (FALHA AMV 1)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'Falha no AMV 1. Agulha entreaberta, o trem descarrilará mesmo vindo por trás (ponta do talão).'
          };
        }
        if (amv1 === 'NORMAL') {
          return {
            status: 'PERIGO (AMV CONTRA 1)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'AMV Contra no 65B. O trem vindo das linhas secundárias encontra a última agulha fechada contra si.'
          };
        }
        return {
          status: 'ROTA SEGURA (LINHA L-01)',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          color: 'text-emerald-500',
          icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
          desc: 'Trem despachado da L-01 seguirá direto no primeiro AMV e adentrará a via principal de forma segura pelo AMV 1 aberto.'
        };
      }

      if (spawnLine === '2') {
        if (amv1 === 'FALHA') {
          return {
            status: 'PERIGO CRÍTICO (FALHA AMV 1)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'Falha no AMV 1. Agulha entreaberta, o trem descarrilará mesmo vindo por trás (ponta do talão).'
          };
        }
        if (amv1 === 'REVERSO') {
          return {
            status: 'PERIGO (AMV CONTRA 1)',
            bg: 'bg-red-500/10 border-red-500/20',
            color: 'text-red-500',
            icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />,
            desc: 'AMV Contra no 65B. O trem subindo pela L-02 encontra a agulha alinhada para os desvios.'
          };
        }
        return {
          status: 'ROTA SEGURA (LINHA L-02)',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          color: 'text-emerald-500',
          icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
          desc: 'Movimento seguro subindo a Extensão. O trem passará livremente pela via principal com o AMV 1 posicionado na Normal.'
        };
      }
    }
  }

  // Default double AMV Layout Safety Diagnosis
  const amvFacing = direction === 'NORTE_SUL' ? 0 : 1;
  const amvTrailing = direction === 'NORTE_SUL' ? 1 : 0;
  const facingState = amvs[amvFacing];
  const trailingState = amvs[amvTrailing];

  if (facingState === 'FALHA') {
    return { 
      status: 'PERIGO CRÍTICO (FALHA)', 
      bg: 'bg-red-500/10 border-red-500/20', 
      color: 'text-red-500', 
      icon: <AlertTriangle className="w-8 h-8 text-red-500" />,
      desc: `Falha no AMV ${amvFacing + 1}. A agulha está entreaberta. Trem vai descarrilar ao entrar na chave principal.` 
    };
  }

  const onBranch = facingState === 'REVERSO';

  if (trailingState === 'FALHA') {
    return { 
      status: 'PERIGO CRÍTICO (FALHA)', 
      bg: 'bg-red-500/10 border-red-500/20', 
      color: 'text-red-500', 
      icon: <AlertTriangle className="w-8 h-8 text-red-500" />,
      desc: `Falha no AMV ${amvTrailing + 1}. Trem passará pelo desvio mas descarrilará no talão devido a agulha entreaberta.` 
    };
  }

  if (onBranch) {
    if (trailingState === 'NORMAL') {
      return { 
        status: 'PERIGO (TALONAMENTO)', 
        bg: 'bg-red-500/10 border-red-500/20', 
        color: 'text-red-500', 
        icon: <AlertTriangle className="w-8 h-8 text-red-500" />,
        desc: `O AMV ${amvFacing + 1} forçou o trem para a via de desvio. O AMV ${amvTrailing + 1} está na posição Normal (fechado para reta). Ocorre talonamento grave, rasgando a agulha!` 
      };
    } else {
      return { 
        status: 'ROTA SEGURA (DESVIO)', 
        bg: 'bg-emerald-500/10 border-emerald-500/20', 
        color: 'text-emerald-500', 
        icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
        desc: `Trem viaja de forma segura pela via de desvio. Os AMVs 1 e 2 estão alinhados para cruzamento (Trajeto reverso sincronizado).` 
      };
    }
  } else {
    if (trailingState === 'REVERSO') {
      return { 
        status: 'PERIGO (TALONAMENTO)', 
        bg: 'bg-red-500/10 border-red-500/20', 
        color: 'text-red-500', 
        icon: <AlertTriangle className="w-8 h-8 text-red-500" />,
        desc: `Trem segue pela via reta principal. Mas o AMV ${amvTrailing + 1} está alinhado para o desvio. Trem atingirá o lado cego da agulha (Talonamento).` 
      };
    } else {
      return { 
        status: 'ROTA SEGURA (PRINCIPAL)', 
        bg: 'bg-emerald-500/10 border-emerald-500/20', 
        color: 'text-emerald-500', 
        icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
        desc: `Via principal livre e reta. Ambos os AMVs estão corretamente alinhados na posição Normal, garantindo caminho expresso seguro.` 
      };
    }
  }
}

// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH
// ---------------------------------------------------------

function getRoutePosRot(
  layoutType: LayoutType,
  direction: Direction,
  amvs: SwitchState[],
  progress: number,
  carIndex: number = 0,
  spawnLine: SpawnLine = '128'
) {
  const amv1 = amvs[0];
  const amv2 = amvs[1];
  const amv3 = amvs[2];
  
  let tz = direction === 'NORTE_SUL' ? 50 - progress * 100 : -50 + progress * 100;
  
  let x = 0;
  let y = 0.075;
  let rotX = 0;
  let rotY = direction === 'NORTE_SUL' ? Math.PI : 0;
  let rotZ = 0;
  let ledColor = '#10b981'; // Default green

  if (layoutType === 'passageiro_02') {
    const amvTP2B = amvs[0];
    const amvTP3B = amvs[1];
    const amvTP04 = amvs[2];
    const amvTP05 = amvs[3] || 'NORMAL';
    const isRightTrunk = spawnLine === 'TP2B' || (direction === 'NORTE_SUL' && spawnLine === 'TP3B' && amvTP2B === 'REVERSO');
    const bogieHalfSpan = carIndex === 0 ? 1.52 : 1.35;

    const alignOnCurve = (curveFn: (zVal: number) => number, zCenter: number, dirSign: number) => {
      const zFront = zCenter + dirSign * bogieHalfSpan;
      const zRear = zCenter - dirSign * bogieHalfSpan;
      const xFront = curveFn(zFront);
      const xRear = curveFn(zRear);
      return {
        cx: 0.5 * (xFront + xRear),
        cRotY: Math.atan2(xFront - xRear, zFront - zRear)
      };
    };

    if (direction === 'NORTE_SUL') {
      if (isRightTrunk) {
        // Right Trunk (TP-2B or crossover to TP-3B) starting at x = 2.8
        x = 2.8;
        if (amvTP2B === 'FALHA' && tz <= (25 + carIndex * 5.2) && tz >= -10) {
          const clampZ = 24 + carIndex * 5.2;
          if (tz <= clampZ + 2) ledColor = '#ef4444';
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) { x = 2.3; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
        } else if (amvTP2B === 'NORMAL') {
          x = 2.8;
        } else {
          // amvTP2B === 'REVERSO' -> crosses stretched diagonal travessão from z=25 (x=2.8) to z=-10 (x=-1.2, TP-3B)
          if (tz <= (25 + carIndex * 5.2)) ledColor = '#fbbf24';
          if (amvTP3B !== 'REVERSO' && tz <= (-9 + carIndex * 5.2)) {
            const clampZ = -10 + carIndex * 5.2;
            if (tz <= clampZ + 2) ledColor = '#ef4444';
            tz = Math.max(tz, clampZ);
            const { cx, cRotY } = alignOnCurve(getPassageiro02CrossoverX, tz, -1);
            x = cx;
            rotY = cRotY;
            if (tz === clampZ) { y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
          } else {
            const { cx, cRotY } = alignOnCurve(getPassageiro02CrossoverX, tz, -1);
            x = cx;
            rotY = cRotY;
          }
        }
      } else {
        // Left Trunk starting at x = -1.2 (TP-3B -> TP-04 -> TP-05)
        x = -1.2;
        if (amvTP04 === 'FALHA' && tz <= (25 + carIndex * 5.2) && tz >= 5) {
          const clampZ = 24 + carIndex * 5.2;
          if (tz <= clampZ + 2) ledColor = '#ef4444';
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) { x = -1.7; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
        } else if (amvTP04 === 'NORMAL') {
          // Follows TP-3B straight at x = -1.2
          x = -1.2;
          if (amvTP3B !== 'NORMAL' && tz <= (-9 + carIndex * 5.2)) {
            const clampZ = -10 + carIndex * 5.2;
            if (tz <= clampZ + 2) ledColor = '#ef4444';
            tz = Math.max(tz, clampZ);
            if (tz === clampZ) { x = -1.5; y = -0.1; rotX = 0.1; rotY -= 0.25; rotZ = -0.25; }
          }
        } else {
          // amvTP04 === 'REVERSO' -> diverges toward TP-04 / TP-05
          if (tz <= (25 + carIndex * 5.2)) ledColor = '#fbbf24';
          if (tz >= 5) {
            const { cx, cRotY } = alignOnCurve(getPassageiro02TrackTP04X, tz, -1);
            x = cx;
            rotY = cRotY;
          } else {
            if (amvTP05 === 'FALHA' && tz <= (5 + carIndex * 5.2) && tz >= -15) {
              const clampZ = 4 + carIndex * 5.2;
              if (tz <= clampZ + 2) ledColor = '#ef4444';
              tz = Math.max(tz, clampZ);
              const { cx, cRotY } = alignOnCurve(getPassageiro02TrackTP04X, tz, -1);
              x = cx;
              rotY = cRotY;
              if (tz === clampZ) { x -= 0.5; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
            } else if (amvTP05 === 'NORMAL') {
              const { cx, cRotY } = alignOnCurve(getPassageiro02TrackTP04X, tz, -1);
              x = cx;
              rotY = cRotY;
            } else {
              // amvTP05 === 'REVERSO' -> TP-05
              const { cx, cRotY } = alignOnCurve(getPassageiro02TrackTP05X, tz, -1);
              x = cx;
              rotY = cRotY;
            }
          }
        }
      }
    } else {
      // SUL_NORTE (Saindo do Galpão de Passageiro 02)
      let maxZ = 100;
      if (spawnLine === 'TP2B') {
        if (amvTP2B !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.2);
      } else if (spawnLine === 'TP3B') {
        if (amvTP3B === 'FALHA') {
          maxZ = Math.min(maxZ, -10 - carIndex * 5.2);
        } else if (amvTP3B === 'REVERSO') {
          if (amvTP2B !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.2);
        } else {
          if (amvTP04 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.2);
        }
      } else if (spawnLine === 'TP04') {
        if (amvTP05 !== 'NORMAL') maxZ = Math.min(maxZ, 4 - carIndex * 5.2);
        if (amvTP04 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.2);
      } else if (spawnLine === 'TP05') {
        if (amvTP05 !== 'REVERSO') maxZ = Math.min(maxZ, 4 - carIndex * 5.2);
        if (amvTP04 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.2);
      }

      const isApproaching = tz >= maxZ - 2;
      if (isApproaching && maxZ < 100) ledColor = '#ef4444';
      const isDerailed = tz >= maxZ;
      tz = Math.min(tz, maxZ);

      const getXForSpawn = (zVal: number) => {
        if (spawnLine === 'TP05') return getPassageiro02TrackTP05X(zVal);
        if (spawnLine === 'TP04') return getPassageiro02TrackTP04X(zVal);
        if (spawnLine === 'TP2B') return 2.8;
        if (amvTP3B === 'REVERSO' && zVal >= -10) return getPassageiro02CrossoverX(zVal);
        return -1.2;
      };

      if (spawnLine === 'TP3B' && amvTP3B === 'REVERSO' && tz >= -10 && !isApproaching) {
        ledColor = '#fbbf24';
      }

      const { cx, cRotY } = alignOnCurve(getXForSpawn, tz, 1);
      x = cx;
      rotY = cRotY;

      if (isDerailed) { y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
    }
    return { pos: [x, y, tz], rot: [rotX, rotY, rotZ], color: ledColor };
  }

  if (layoutType === 'abaixo_oficina') {
    const amv4 = amvs[3] || 'NORMAL';
    const amv5 = amvs[4] || 'NORMAL';
    const amv6 = amvs[5] || 'NORMAL';
    const bogieHalfSpan = carIndex === 0 ? 1.52 : 1.35;

    const alignOnCurve = (curveFn: (zVal: number) => number, zCenter: number, dirSign: number) => {
      const zFront = zCenter + dirSign * bogieHalfSpan;
      const zRear = zCenter - dirSign * bogieHalfSpan;
      const xFront = curveFn(zFront);
      const xRear = curveFn(zRear);
      return {
        cx: 0.5 * (xFront + xRear),
        cRotY: Math.atan2(xFront - xRear, zFront - zRear)
      };
    };

    const isLeftTrunk = spawnLine === '165' || spawnLine === '166';

    if (direction === 'NORTE_SUL') {
      if (isLeftTrunk) {
        if (spawnLine === '166') {
          x = -10.6;
          if (amv3 !== 'REVERSO' && tz <= (-16 + carIndex * 5.2)) {
            const clampZ = -17 + carIndex * 5.2;
            if (tz <= clampZ + 2) ledColor = '#ef4444';
            tz = Math.max(tz, clampZ);
            if (tz === clampZ) { x = -10.1; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
          }
        } else {
          // L-165 curving from -4.0 at z=22 to -10.6 at z=-21.. -55
          const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack165X, tz, -1);
          x = cx;
          rotY = cRotY;
          if (amv3 !== 'NORMAL' && tz <= (-16 + carIndex * 5.2)) {
            const clampZ = -17 + carIndex * 5.2;
            if (tz <= clampZ + 2) ledColor = '#ef4444';
            tz = Math.max(tz, clampZ);
            if (tz === clampZ) { x -= 0.4; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
          }
        }
      } else {
        // Right Trunk starting at x = 1.6
        x = 1.6;
        if (amv1 === 'FALHA' && tz <= (26 + carIndex * 5.2) && tz >= 6) {
          const clampZ = 25 + carIndex * 5.2;
          if (tz <= clampZ + 2) ledColor = '#ef4444';
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) { x = 1.1; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
        } else if (amv1 === 'REVERSO') {
          if (tz <= (26 + carIndex * 5.2)) ledColor = '#fbbf24';
          if (tz >= 6) {
            const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack163X, tz, -1);
            x = cx;
            rotY = cRotY;
          } else if (amv5 === 'FALHA' && tz <= (6 + carIndex * 5.2) && tz >= -12) {
            const clampZ = 5 + carIndex * 5.2;
            if (tz <= clampZ + 2) ledColor = '#ef4444';
            tz = Math.max(tz, clampZ);
            const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack163X, tz, -1);
            x = cx;
            rotY = cRotY;
            if (tz === clampZ) { x -= 0.5; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
          } else if (amv5 === 'REVERSO') {
            const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack164X, tz, -1);
            x = cx;
            rotY = cRotY;
          } else {
            const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack163X, tz, -1);
            x = cx;
            rotY = cRotY;
          }
        } else {
          // amv1 === 'NORMAL' -> continues on x = 1.6 toward AMV 2 (z = 12)
          if (tz >= 12) {
            x = 1.6;
          } else if (amv2 === 'FALHA' && tz <= (12 + carIndex * 5.2) && tz >= -6) {
            const clampZ = 11 + carIndex * 5.2;
            if (tz <= clampZ + 2) ledColor = '#ef4444';
            tz = Math.max(tz, clampZ);
            if (tz === clampZ) { x = 2.1; y = -0.1; rotX = 0.1; rotY -= 0.25; rotZ = -0.25; }
          } else if (amv2 === 'NORMAL') {
            x = 1.6;
          } else {
            // amv2 === 'REVERSO' -> pulls right onto L-173 toward AMV 4 (z=0) and AMV 6 (z=-13)
            if (tz <= (12 + carIndex * 5.2)) ledColor = '#fbbf24';
            if (tz >= 0) {
              const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack173X, tz, -1);
              x = cx;
              rotY = cRotY;
            } else if (amv4 === 'FALHA' && tz <= (0 + carIndex * 5.2) && tz >= -20) {
              const clampZ = -1 + carIndex * 5.2;
              if (tz <= clampZ + 2) ledColor = '#ef4444';
              tz = Math.max(tz, clampZ);
              const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack173X, tz, -1);
              x = cx;
              rotY = cRotY;
              if (tz === clampZ) { x -= 0.45; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
            } else if (amv4 === 'REVERSO') {
              // Curva à esquerda para L-161
              const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack161X, tz, -1);
              x = cx;
              rotY = cRotY;
            } else if (tz >= -13) {
              // Segue na L-173 até o AMV 6 (z = -13)
              const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack173X, tz, -1);
              x = cx;
              rotY = cRotY;
            } else if (amv6 === 'FALHA' && tz <= (-13 + carIndex * 5.2) && tz >= -33) {
              const clampZ = -14 + carIndex * 5.2;
              if (tz <= clampZ + 2) ledColor = '#ef4444';
              tz = Math.max(tz, clampZ);
              const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack173X, tz, -1);
              x = cx;
              rotY = cRotY;
              if (tz === clampZ) { x -= 0.45; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
            } else if (amv6 === 'REVERSO') {
              // Curva à esquerda para L-160
              const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack160X, tz, -1);
              x = cx;
              rotY = cRotY;
            } else {
              // Segue toda a extensão da L-173
              const { cx, cRotY } = alignOnCurve(getAbaixoOficinaTrack173X, tz, -1);
              x = cx;
              rotY = cRotY;
            }
          }
        }
      }
    } else {
      // SUL_NORTE
      let maxZ = 100;
      if (spawnLine === '166') {
        if (amv3 === 'FALHA') maxZ = Math.min(maxZ, -22 - carIndex * 5.2);
      } else if (spawnLine === '165') {
        if (amv3 === 'FALHA') maxZ = Math.min(maxZ, -22 - carIndex * 5.2);
      } else if (spawnLine === '164') {
        if (amv5 !== 'REVERSO') maxZ = Math.min(maxZ, 5 - carIndex * 5.2);
        if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 25 - carIndex * 5.2);
      } else if (spawnLine === '163') {
        if (amv5 !== 'NORMAL') maxZ = Math.min(maxZ, 5 - carIndex * 5.2);
        if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 25 - carIndex * 5.2);
      } else if (spawnLine === '162') {
        if (amv2 !== 'NORMAL') maxZ = Math.min(maxZ, 11 - carIndex * 5.2);
        if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 25 - carIndex * 5.2);
      } else if (spawnLine === '161') {
        if (amv4 !== 'REVERSO') maxZ = Math.min(maxZ, -1 - carIndex * 5.2);
        if (amv2 !== 'REVERSO') maxZ = Math.min(maxZ, 11 - carIndex * 5.2);
        if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 25 - carIndex * 5.2);
      } else if (spawnLine === '160') {
        if (amv6 !== 'REVERSO') maxZ = Math.min(maxZ, -14 - carIndex * 5.2);
        if (amv4 !== 'NORMAL') maxZ = Math.min(maxZ, -1 - carIndex * 5.2);
        if (amv2 !== 'REVERSO') maxZ = Math.min(maxZ, 11 - carIndex * 5.2);
        if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 25 - carIndex * 5.2);
      } else if (spawnLine === '173') {
        if (amv6 !== 'NORMAL') maxZ = Math.min(maxZ, -14 - carIndex * 5.2);
        if (amv4 !== 'NORMAL') maxZ = Math.min(maxZ, -1 - carIndex * 5.2);
        if (amv2 !== 'REVERSO') maxZ = Math.min(maxZ, 11 - carIndex * 5.2);
        if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 25 - carIndex * 5.2);
      }

      const isApproaching = tz >= maxZ - 2;
      if (isApproaching && maxZ < 100) ledColor = '#ef4444';
      const isDerailed = tz >= maxZ;
      tz = Math.min(tz, maxZ);

      const getXForSpawn = (zVal: number) => {
        if (spawnLine === '166') return amv3 === 'REVERSO' ? -10.6 : getAbaixoOficinaTrack165X(zVal);
        if (spawnLine === '165') return amv3 === 'REVERSO' ? -10.6 : getAbaixoOficinaTrack165X(zVal);
        if (spawnLine === '164') return getAbaixoOficinaTrack164X(zVal);
        if (spawnLine === '163') return getAbaixoOficinaTrack163X(zVal);
        if (spawnLine === '162') return getAbaixoOficinaTrack162X(zVal);
        if (spawnLine === '161') return getAbaixoOficinaTrack161X(zVal);
        if (spawnLine === '160') return getAbaixoOficinaTrack160X(zVal);
        return getAbaixoOficinaTrack173X(zVal);
      };

      const { cx, cRotY } = alignOnCurve(getXForSpawn, tz, 1);
      x = cx;
      rotY = cRotY;

      if (isDerailed) { y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
    }
    return { pos: [x, y, tz], rot: [rotX, rotY, rotZ], color: ledColor };
  }

  if (layoutType === 'oficina_central') {
    const amv4 = amvs[3] || 'NORMAL';
    if (spawnLine === '158') {
      x = getOficinaCentralTrack158X(tz);
      const dt = direction === 'NORTE_SUL' ? -0.1 : 0.1;
      const nextX = getOficinaCentralTrack158X(tz + dt);
      rotY = Math.atan2(nextX - x, dt);
      return { pos: [x, y, tz], rot: [rotX, rotY, rotZ], color: ledColor };
    }

    const isRightGroup = spawnLine === '163' || spawnLine === '164' || spawnLine === '165';

    if (direction === 'NORTE_SUL') {
      if (!isRightGroup) {
        // Center Trunk (L-162, L-161, L-160) starting at x = -1.2
        x = -1.2;
        if (amv1 === 'FALHA' && tz <= (25 + carIndex * 5.5) && tz >= 5) {
          const clampZ = 24 + carIndex * 5.5;
          if (tz <= clampZ + 2) ledColor = '#ef4444';
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) { x = -1.7; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
        } else if (amv1 === 'NORMAL') {
          x = -1.2;
        } else {
          // amv1 === 'REVERSO' -> diverges toward L-161 / L-160
          if (tz <= (25 + carIndex * 5.5)) ledColor = '#fbbf24';
          if (tz >= 5) {
            x = getOficinaCentralTrack161X(tz);
            const nextX = getOficinaCentralTrack161X(tz - 0.1);
            rotY = Math.atan2(nextX - x, -0.1);
          } else {
            if (amv2 === 'FALHA' && tz <= (5 + carIndex * 5.5) && tz >= -15) {
              const clampZ = 4 + carIndex * 5.5;
              if (tz <= clampZ + 2) ledColor = '#ef4444';
              tz = Math.max(tz, clampZ);
              x = getOficinaCentralTrack161X(tz);
              if (tz === clampZ) { x -= 0.5; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
            } else if (amv2 === 'NORMAL') {
              x = -4.0;
            } else {
              // amv2 === 'REVERSO' -> L-160
              x = getOficinaCentralTrack160X(tz);
              const nextX = getOficinaCentralTrack160X(tz - 0.1);
              rotY = Math.atan2(nextX - x, -0.1);
            }
          }
        }
      } else {
        // Right Trunk (L-165, L-164, L-163) starting at x = 7.6
        x = 7.6;
        if (amv3 === 'FALHA' && tz <= (25 + carIndex * 5.5) && tz >= 5) {
          const clampZ = 24 + carIndex * 5.5;
          if (tz <= clampZ + 2) ledColor = '#ef4444';
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) { x = 7.1; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
        } else if (amv3 === 'NORMAL') {
          x = 7.6;
        } else {
          // amv3 === 'REVERSO' -> diverges toward L-164 / L-163
          if (tz <= (25 + carIndex * 5.5)) ledColor = '#fbbf24';
          if (tz >= 5) {
            x = getOficinaCentralTrack164X(tz);
            const nextX = getOficinaCentralTrack164X(tz - 0.1);
            rotY = Math.atan2(nextX - x, -0.1);
          } else {
            if (amv4 === 'FALHA' && tz <= (5 + carIndex * 5.5) && tz >= -15) {
              const clampZ = 4 + carIndex * 5.5;
              if (tz <= clampZ + 2) ledColor = '#ef4444';
              tz = Math.max(tz, clampZ);
              x = getOficinaCentralTrack164X(tz);
              if (tz === clampZ) { x -= 0.5; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
            } else if (amv4 === 'NORMAL') {
              x = 4.8;
            } else {
              // amv4 === 'REVERSO' -> L-163
              x = getOficinaCentralTrack163X(tz);
              const nextX = getOficinaCentralTrack163X(tz - 0.1);
              rotY = Math.atan2(nextX - x, -0.1);
            }
          }
        }
      }
    } else {
      // SUL_NORTE
      let maxZ = 100;
      if (spawnLine === '160') {
        if (amv2 !== 'REVERSO') maxZ = Math.min(maxZ, 4 - carIndex * 5.5);
        if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
      } else if (spawnLine === '161') {
        if (amv2 !== 'NORMAL') maxZ = Math.min(maxZ, 4 - carIndex * 5.5);
        if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
      } else if (spawnLine === '162') {
        if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
      } else if (spawnLine === '163') {
        if (amv4 !== 'REVERSO') maxZ = Math.min(maxZ, 4 - carIndex * 5.5);
        if (amv3 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
      } else if (spawnLine === '164') {
        if (amv4 !== 'NORMAL') maxZ = Math.min(maxZ, 4 - carIndex * 5.5);
        if (amv3 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
      } else if (spawnLine === '165') {
        if (amv3 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
      }

      const isApproaching = tz >= maxZ - 2;
      if (isApproaching && maxZ < 100) ledColor = '#ef4444';
      const isDerailed = tz >= maxZ;
      tz = Math.min(tz, maxZ);

      const getXForSpawn = (zVal: number) => {
        if (spawnLine === '160') return getOficinaCentralTrack160X(zVal);
        if (spawnLine === '161') return getOficinaCentralTrack161X(zVal);
        if (spawnLine === '162') return getOficinaCentralTrack162X(zVal);
        if (spawnLine === '163') return getOficinaCentralTrack163X(zVal);
        if (spawnLine === '164') return getOficinaCentralTrack164X(zVal);
        return getOficinaCentralTrack165X(zVal);
      };

      x = getXForSpawn(tz);
      const nextX = getXForSpawn(tz + 0.1);
      rotY = Math.atan2(nextX - x, 0.1);

      if (isDerailed) { y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
    }
    return { pos: [x, y, tz], rot: [rotX, rotY, rotZ], color: ledColor };
  }

  if (layoutType === 'passageiro_01') {
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA' && tz <= (25 + carIndex * 5.5) && tz >= 5) {
        const clampZ = 24 + carIndex * 5.5;
        if (tz <= clampZ + 2) ledColor = '#ef4444';
        tz = Math.max(tz, clampZ);
        if (tz === clampZ) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
      } else if (amv1 === 'NORMAL') {
        // Follows TP-01 curving left
        x = getPassageiro01TrackTP01X(tz);
        const nextX = getPassageiro01TrackTP01X(tz - 0.1);
        rotY = Math.atan2(nextX - x, -0.1);
      } else {
        // amv1 === 'REVERSO' -> left branch toward AMV 2 (TP-2A / TP-3A)
        if (tz <= (25 + carIndex * 5.5)) ledColor = '#fbbf24';
        if (tz >= 5) {
          x = getPassageiro01TrackTP2AX(tz);
          const nextX = getPassageiro01TrackTP2AX(tz - 0.1);
          rotY = Math.atan2(nextX - x, -0.1);
        } else {
          if (amv2 === 'FALHA' && tz <= (5 + carIndex * 5.5) && tz >= -15) {
            const clampZ = 4 + carIndex * 5.5;
            if (tz <= clampZ + 2) ledColor = '#ef4444';
            tz = Math.max(tz, clampZ);
            x = getPassageiro01TrackTP2AX(tz);
            const nextX = getPassageiro01TrackTP2AX(tz - 0.1);
            rotY = Math.atan2(nextX - x, -0.1);
            if (tz === clampZ) { x -= 0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
          } else if (amv2 === 'NORMAL') {
            // Follows TP-2A (middle left curve)
            x = getPassageiro01TrackTP2AX(tz);
            const nextX = getPassageiro01TrackTP2AX(tz - 0.1);
            rotY = Math.atan2(nextX - x, -0.1);
          } else {
            // amv2 === 'REVERSO' -> Follows TP-3A (outermost left curve)
            x = getPassageiro01TrackTP3AX(tz);
            const nextX = getPassageiro01TrackTP3AX(tz - 0.1);
            rotY = Math.atan2(nextX - x, -0.1);
          }
        }
      }
    } else {
      // SUL_NORTE
      let maxZ = 100;
      if (spawnLine === 'TP3A') {
        if (amv2 !== 'REVERSO') maxZ = Math.min(maxZ, 4 - carIndex * 5.5);
        if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
      } else if (spawnLine === 'TP2A') {
        if (amv2 !== 'NORMAL') maxZ = Math.min(maxZ, 4 - carIndex * 5.5);
        if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
      } else { // TP01
        if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
      }

      const isApproaching = tz >= maxZ - 2;
      if (isApproaching && maxZ < 100) ledColor = '#ef4444';
      const isDerailed = tz >= maxZ;
      tz = Math.min(tz, maxZ);

      const getXForSpawn = (zVal: number) => {
        if (spawnLine === 'TP3A') return getPassageiro01TrackTP3AX(zVal);
        if (spawnLine === 'TP2A') return getPassageiro01TrackTP2AX(zVal);
        return getPassageiro01TrackTP01X(zVal);
      };

      x = getXForSpawn(tz);
      const nextX = getXForSpawn(tz + 0.1);
      rotY = Math.atan2(nextX - x, 0.1);

      if (isDerailed) { rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
    }
  } else if (layoutType === 'patio_oficina') {
    const amv3 = amvs[2];
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA' && tz <= (20 + carIndex * 5.5) && tz >= 0) {
        const clampZ = 19 + carIndex * 5.5;
        if (tz <= clampZ + 2) ledColor = '#ef4444';
        tz = Math.max(tz, clampZ);
        if (tz === clampZ) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
      } else if (amv1 === 'REVERSO') {
        if (tz <= (20 + carIndex * 5.5)) ledColor = '#fbbf24';
        if (tz <= (20 + carIndex * 5.5) && tz >= 0) {
          x = getPatioOficinaTrack1X(tz);
          const nextX = getPatioOficinaTrack1X(tz - 0.1);
          rotY = Math.atan2(nextX - x, -0.1);
        } else if (tz < 0) {
          x = 5.0; // Straight on L-28
        }
      } else {
        // amv1 is NORMAL
        if (amv2 === 'FALHA' && tz <= (0 + carIndex * 5.5) && tz >= -20) {
          const clampZ = -1 + carIndex * 5.5;
          if (tz <= clampZ + 2) ledColor = '#ef4444';
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
        } else if (amv2 === 'REVERSO') {
          if (tz <= (0 + carIndex * 5.5)) ledColor = '#fbbf24';
          if (tz <= (0 + carIndex * 5.5) && tz >= -20) {
            x = getPatioOficinaTrack2X(tz);
            const nextX = getPatioOficinaTrack2X(tz - 0.1);
            rotY = Math.atan2(nextX - x, -0.1);
          } else if (tz < -20) {
            x = -5.0; // Straight on L-31
          }
        } else {
          // amv2 is NORMAL
          if (amv3 === 'FALHA' && tz <= (-20 + carIndex * 5.5) && tz >= -40) {
            const clampZ = -21 + carIndex * 5.5;
            if (tz <= clampZ + 2) ledColor = '#ef4444';
            tz = Math.max(tz, clampZ);
            if (tz === clampZ) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
          } else if (amv3 === 'REVERSO') {
            if (tz <= (-20 + carIndex * 5.5)) ledColor = '#fbbf24';
            if (tz <= (-20 + carIndex * 5.5) && tz >= -40) {
              x = getPatioOficinaTrack3X(tz);
              const nextX = getPatioOficinaTrack3X(tz - 0.1);
              rotY = Math.atan2(nextX - x, -0.1);
            } else if (tz < -40) {
              x = -5.0; // Straight on L-27
            }
          }
        }
      }
    } else {
       // SUL_NORTE
       let maxZ = 100;
       if (spawnLine === '28') {
         if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 19 - carIndex * 5.5);
       } else if (spawnLine === '31') {
         if (amv2 !== 'REVERSO') maxZ = Math.min(maxZ, -1 - carIndex * 5.5);
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 19 - carIndex * 5.5);
       } else if (spawnLine === '27') {
         if (amv3 !== 'REVERSO') maxZ = Math.min(maxZ, -21 - carIndex * 5.5);
         if (amv2 !== 'NORMAL') maxZ = Math.min(maxZ, -1 - carIndex * 5.5);
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 19 - carIndex * 5.5);
       } else { // 32
         if (amv3 !== 'NORMAL') maxZ = Math.min(maxZ, -21 - carIndex * 5.5);
         if (amv2 !== 'NORMAL') maxZ = Math.min(maxZ, -1 - carIndex * 5.5);
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 19 - carIndex * 5.5);
       }
       
       const isDerailed = tz >= maxZ;
       tz = Math.min(tz, maxZ);
       
       if (spawnLine === '28') {
         x = 5.0;
         if (tz >= 0 && tz <= 20) {
           x = getPatioOficinaTrack1X(tz);
           const nextX = getPatioOficinaTrack1X(tz + 0.1);
           rotY = Math.atan2(nextX - x, 0.1);
         } else if (tz > 20) {
           x = 0;
         }
       } else if (spawnLine === '31') {
         x = -5.0;
         if (tz >= -20 && tz <= 0) {
           x = getPatioOficinaTrack2X(tz);
           const nextX = getPatioOficinaTrack2X(tz + 0.1);
           rotY = Math.atan2(nextX - x, 0.1);
         } else if (tz > 0) {
           x = 0;
         }
       } else if (spawnLine === '27') {
         x = -5.0;
         if (tz >= -40 && tz <= -20) {
           x = getPatioOficinaTrack3X(tz);
           const nextX = getPatioOficinaTrack3X(tz + 0.1);
           rotY = Math.atan2(nextX - x, 0.1);
         } else if (tz > -20) {
           x = 0;
         }
       } else {
         x = 0;
       }

       if (isDerailed) { rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
    }
  } else if (layoutType === 'pn_oficina') {
    // ------------------ PN OFICINA ------------------
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA' && tz <= (5 + carIndex * 5.5) && tz >= -15) {
        const clampZ = 4 + carIndex * 5.5;
        const isApproaching = tz <= clampZ + 2;
        tz = Math.max(tz, clampZ);
        if (isApproaching) ledColor = '#ef4444';
        if (tz === clampZ) { x = -0.5; y = -0.1; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
      } else if (amv1 === 'REVERSO') {
        if (tz <= (5 + carIndex * 5.5)) ledColor = '#fbbf24';
        if (tz <= (5 + carIndex * 5.5) && tz >= -15) {
          x = getPnOficinaTrack1X(tz);
          const nextX = getPnOficinaTrack1X(tz - 0.1);
          rotY = Math.atan2(nextX - x, -0.1);
        } else if (tz < -15) {
          x = -2.5; // L-159
        }
      } else {
        // amv1 is NORMAL, so train stays on main line (L-173)
        x = 0;
      }
    } else {
      // SUL_NORTE
      const startedOnBranch = spawnLine === '159';
      let isDerailed = false;
      
      if (startedOnBranch) {
        if (amv1 === 'FALHA' || amv1 !== 'REVERSO') {
          const clampZ = -2.5 - carIndex * 5.5; // -2.5 is exactly 2 LEDs (2 * 1.25m) before the original z=0 collision point
          if (tz >= clampZ - 2) ledColor = '#ef4444';
          if (tz >= clampZ) {
            tz = clampZ;
            isDerailed = true;
          }
        }
        
        if (tz >= -15 && tz <= 5) {
          x = getPnOficinaTrack1X(tz);
          const nextX = getPnOficinaTrack1X(tz + 0.1);
          rotY = Math.atan2(nextX - x, 0.1);
        } else if (tz > 5) {
          x = 0;
        } else {
          x = -2.5;
        }
        
        if (isDerailed) {
          x += 0.5; y = -0.1; rotX = -0.1; rotY -= 0.25; rotZ = -0.25;
        }
      } else {
        // Started on L-173 (straight)
        if (amv1 === 'FALHA' || amv1 !== 'NORMAL') {
          const clampZ = -2 - carIndex * 5.5; // Frog is at z=-2
          if (tz >= clampZ - 2) ledColor = '#ef4444';
          if (tz >= clampZ) {
            tz = clampZ;
            isDerailed = true;
          }
        }
        x = 0;
        if (isDerailed) {
          x += 0.5; y = -0.1; rotX = -0.1; rotY -= 0.25; rotZ = -0.25;
        }
      }
    }
  } else if (layoutType === 'oficina') {
    // ------------------ 3 AMVs LAYOUT (oficina: L-167, L-166, L-165, 152 Reta) ------------------
    const amv3 = amvs[2] || 'NORMAL';
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA' && tz <= (25 + carIndex * 5.5) && tz >= -5) {
        const clampZ = 24 + carIndex * 5.5;
        if (tz <= clampZ + 2) ledColor = '#ef4444';
        tz = Math.max(tz, clampZ);
        if (tz === clampZ) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
      } else if (amv1 === 'REVERSO') {
        if (tz <= (25 + carIndex * 5.5)) ledColor = '#fbbf24';
        x = getOficinaTrack1X(tz);
        const nextX = getOficinaTrack1X(tz - 0.1);
        rotY = Math.atan2(nextX - x, -0.1);
      } else {
        // amv1 is NORMAL -> continues to AMV 2 (z = 8)
        if (amv2 === 'FALHA' && tz <= (8 + carIndex * 5.5) && tz >= -15) {
          const clampZ = 7 + carIndex * 5.5;
          if (tz <= clampZ + 2) ledColor = '#ef4444';
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
        } else if (amv2 === 'REVERSO') {
          if (tz <= (8 + carIndex * 5.5)) ledColor = '#fbbf24';
          x = getOficinaTrack2X(tz);
          const nextX = getOficinaTrack2X(tz - 0.1);
          rotY = Math.atan2(nextX - x, -0.1);
        } else {
          // amv2 is NORMAL -> continues to AMV 3 (z = -12)
          if (amv3 === 'FALHA' && tz <= (-12 + carIndex * 5.5) && tz >= -35) {
            const clampZ = -13 + carIndex * 5.5;
            if (tz <= clampZ + 2) ledColor = '#ef4444';
            tz = Math.max(tz, clampZ);
            if (tz === clampZ) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
          } else if (amv3 === 'REVERSO') {
            if (tz <= (-12 + carIndex * 5.5)) ledColor = '#fbbf24';
            x = getOficinaTrack3X(tz);
            const nextX = getOficinaTrack3X(tz - 0.1);
            rotY = Math.atan2(nextX - x, -0.1);
          } else {
            x = 0;
          }
        }
      }
    } else {
       // SUL_NORTE (spawnLine dictates path)
       let maxZ = 100;
       if (spawnLine === '167') {
         if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       } else if (spawnLine === '166') {
         if (amv2 !== 'REVERSO') maxZ = Math.min(maxZ, 7 - carIndex * 5.5);
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       } else if (spawnLine === '165') {
         if (amv3 !== 'REVERSO') maxZ = Math.min(maxZ, -13 - carIndex * 5.5);
         if (amv2 !== 'NORMAL') maxZ = Math.min(maxZ, 7 - carIndex * 5.5);
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       } else { // 152 (Reta)
         if (amv3 !== 'NORMAL') maxZ = Math.min(maxZ, -13 - carIndex * 5.5);
         if (amv2 !== 'NORMAL') maxZ = Math.min(maxZ, 7 - carIndex * 5.5);
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       }
       
       const isApproaching = tz >= maxZ - 2;
       if (isApproaching && maxZ < 100) ledColor = '#ef4444';
       const isDerailed = tz >= maxZ;
       tz = Math.min(tz, maxZ);
       
       if (spawnLine === '167') {
         x = getOficinaTrack1X(tz);
         const nextX = getOficinaTrack1X(tz + 0.1);
         rotY = Math.atan2(nextX - x, 0.1);
       } else if (spawnLine === '166') {
         x = getOficinaTrack2X(tz);
         const nextX = getOficinaTrack2X(tz + 0.1);
         rotY = Math.atan2(nextX - x, 0.1);
       } else if (spawnLine === '165') {
         x = getOficinaTrack3X(tz);
         const nextX = getOficinaTrack3X(tz + 0.1);
         rotY = Math.atan2(nextX - x, 0.1);
       } else {
         x = 0;
       }

       if (isDerailed) { rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
    }
  } else if (layoutType === 'reclassificacao') {
    // ------------------ RECLASSIFICACAO LAYOUT ------------------
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA' && tz <= (25 + carIndex * 5.5) && tz >= 5) {
        const clampZ = 24 + carIndex * 5.5;
        if (tz <= clampZ + 2) ledColor = '#ef4444';
        tz = Math.max(tz, clampZ);
        if (tz === clampZ) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
      } else if (amv1 === 'NORMAL') {
        // stays on main line (L-105A)
        x = 0;
      } else {
        // amv1 === 'REVERSO', goes to left branch
        if (tz <= (25 + carIndex * 5.5)) ledColor = '#fbbf24';
        if (tz <= (25 + carIndex * 5.5) && tz >= 5) {
          x = getReclassificacaoTrack1X(tz);
          const nextX = getReclassificacaoTrack1X(tz - 0.1);
          rotY = Math.atan2(nextX - x, -0.1);
        } else if (tz < 5) {
          // on left branch, approaching AMV 2
          if (amv2 === 'FALHA' && tz <= (5 + carIndex * 5.5) && tz >= -15) {
            const clampZ = 4 + carIndex * 5.5;
            if (tz <= clampZ + 2) ledColor = '#ef4444';
            tz = Math.max(tz, clampZ);
            if (tz === clampZ) { x = -5.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
          } else if (amv2 === 'NORMAL') {
            // stays on L-107A
            x = -5.0;
          } else {
            // amv2 === 'REVERSO', curves to L-106A
            if (tz <= (5 + carIndex * 5.5)) ledColor = '#fbbf24';
            if (tz <= (5 + carIndex * 5.5) && tz >= -15) {
              x = getReclassificacaoTrack2X(tz);
              const nextX = getReclassificacaoTrack2X(tz - 0.1);
              rotY = Math.atan2(nextX - x, -0.1);
            } else if (tz < -15) {
              x = -2.5;
            }
          }
        }
      }
    } else {
       // SUL_NORTE
       let maxZ = 100;
       if (spawnLine === '107A') {
         if (amv2 !== 'NORMAL') maxZ = Math.min(maxZ, 4 - carIndex * 5.5);
         if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       } else if (spawnLine === '106A') {
         if (amv2 !== 'REVERSO') maxZ = Math.min(maxZ, 4 - carIndex * 5.5);
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       } else { // 105A
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       }
       
       const isApproaching = tz >= maxZ - 2;
       if (isApproaching && maxZ < 100) ledColor = '#ef4444';
       const isDerailed = tz >= maxZ;
       tz = Math.min(tz, maxZ);
       
       if (spawnLine === '107A') { // furthest left (x = -5.0)
         x = -5.0;
         if (tz > 5 && tz <= 25) {
           x = getReclassificacaoTrack1X(tz);
           const nextX = getReclassificacaoTrack1X(tz + 0.1);
           rotY = Math.atan2(nextX - x, 0.1);
         } else if (tz > 25) {
           x = 0;
         }
       } else if (spawnLine === '106A') { // middle (x = -2.5)
         x = -2.5;
         if (tz >= -15 && tz <= 5) {
           x = getReclassificacaoTrack2X(tz);
           const nextX = getReclassificacaoTrack2X(tz + 0.1);
           rotY = Math.atan2(nextX - x, 0.1);
         } else if (tz > 5 && tz <= 25) {
           x = getReclassificacaoTrack1X(tz);
           const nextX = getReclassificacaoTrack1X(tz + 0.1);
           rotY = Math.atan2(nextX - x, 0.1);
         } else if (tz > 25) {
           x = 0;
         }
       } else {
         // Main line (105A)
         x = 0;
       }

       if (isDerailed) { rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
    }
  } else if (layoutType === 'reclassificacao_02') {
    if (direction === 'NORTE_SUL') {
      let minZ = -100;
      if (amv1 === 'FALHA') {
        minZ = Math.max(minZ, 16 + carIndex * 5.5);
      } else if (amv1 === 'REVERSO') {
        if (amv2 !== 'REVERSO') {
          minZ = Math.max(minZ, -7 + carIndex * 5.5);
        }
      } else {
        if (amv3 === 'FALHA') {
          minZ = Math.max(minZ, -16 + carIndex * 5.5);
        }
      }

      const isApproaching = tz <= minZ + 2;
      if (isApproaching && minZ > -100) ledColor = '#ef4444';
      const isDerailed = tz <= minZ;
      tz = Math.max(tz, minZ);

      if (amv1 === 'REVERSO') {
        if (tz <= (17 + carIndex * 5.5)) ledColor = '#fbbf24';
        if (tz >= 17) x = 0;
        else if (tz >= -8) {
          x = getReclassificacao02Crossover109X(tz);
          const nextX = getReclassificacao02Crossover109X(tz - 0.1);
          rotY = Math.atan2(nextX - x, -0.1);
        } else {
          x = -3.8;
        }
      } else if (amv3 === 'REVERSO') {
        if (tz <= (-15 + carIndex * 5.5)) ledColor = '#fbbf24';
        if (tz >= -15) x = 0;
        else {
          x = getReclassificacao02UpperBranch122X(tz);
          const nextX = getReclassificacao02UpperBranch122X(tz - 0.1);
          rotY = Math.atan2(nextX - x, -0.1);
        }
      } else {
        x = 0;
      }

      if (isDerailed) { rotX = -0.1; rotY += 0.25; rotZ = -0.25; }
    } else {
      let maxZ = 100;
      if (spawnLine === '109') {
        if (amv2 === 'FALHA') {
          maxZ = Math.min(maxZ, -9 - carIndex * 5.5);
        } else if (amv2 === 'REVERSO') {
          if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 16 - carIndex * 5.5);
        }
      } else if (spawnLine === '122') {
        if (amv3 !== 'REVERSO') maxZ = Math.min(maxZ, -16 - carIndex * 5.5);
        if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 16 - carIndex * 5.5);
      } else {
        if (amv3 !== 'NORMAL') maxZ = Math.min(maxZ, -16 - carIndex * 5.5);
        if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 16 - carIndex * 5.5);
      }

      const isApproaching = tz >= maxZ - 2;
      if (isApproaching && maxZ < 100) ledColor = '#ef4444';
      const isDerailed = tz >= maxZ;
      tz = Math.min(tz, maxZ);

      if (spawnLine === '109') {
        if (tz <= -8) {
          x = -3.8;
        } else if (amv2 === 'NORMAL') {
          x = getReclassificacao02LeftTrunk109X(tz);
          const nextX = getReclassificacao02LeftTrunk109X(tz + 0.1);
          rotY = Math.atan2(nextX - x, 0.1);
        } else if (tz <= 17) {
          x = getReclassificacao02Crossover109X(tz);
          const nextX = getReclassificacao02Crossover109X(tz + 0.1);
          rotY = Math.atan2(nextX - x, 0.1);
        } else {
          x = 0;
        }
      } else if (spawnLine === '122') {
        if (tz <= -15) {
          x = getReclassificacao02UpperBranch122X(tz);
          const nextX = getReclassificacao02UpperBranch122X(tz + 0.1);
          rotY = Math.atan2(nextX - x, 0.1);
        } else {
          x = 0;
        }
      } else {
        x = 0;
      }

      if (isDerailed) { rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
    }
  } else if (layoutType === 'freio_02') {
    // ------------------ 3 AMVs / YARD LAYOUT (freio_02) ------------------
    let side1: 'L' | 'R' = amv1 === 'REVERSO' ? 'R' : 'L';
    let side23: 'L' | 'R' = 'L';
    
    if (side1 === 'L') {
      side23 = amv2 === 'REVERSO' ? 'R' : 'L';
    } else {
      side23 = amv3 === 'REVERSO' ? 'R' : 'L';
    }

    if (direction === 'NORTE_SUL') {
      // Falha e descarrilamento no AMV 1 (z = 22)
      if (tz <= (22 + carIndex * 5.5) && tz >= 12) {
        const clampZ = 21 + carIndex * 5.5;
        if (amv1 === 'FALHA') {
          tz = Math.max(tz, clampZ);
          const isDerailed = tz === clampZ;
          if (isDerailed) {
            x = 0.3 + carIndex * 0.12;
            y = -0.1;
            rotX = 0.1;
            rotY += 0.25;
            rotZ = 0.25;
          }
        }
      }

      // Falha e descarrilamento no AMV 2 (z = 5, esquerda)
      if (side1 === 'L' && tz <= (5 + carIndex * 5.5) && tz >= -8) {
        const clampZ = 4 + carIndex * 5.5;
        if (amv2 === 'FALHA') {
          tz = Math.max(tz, clampZ);
          const isDerailed = tz === clampZ;
          if (isDerailed) {
            x = -1.5 + 0.3 + carIndex * 0.12;
            y = -0.1;
            rotX = 0.1;
            rotY += 0.25;
            rotZ = 0.25;
          }
        }
      }

      // Falha e descarrilamento no AMV 3 (z = 5, direita)
      if (side1 === 'R' && tz <= (5 + carIndex * 5.5) && tz >= -8) {
        const clampZ = 4 + carIndex * 5.5;
        if (amv3 === 'FALHA') {
          tz = Math.max(tz, clampZ);
          const isDerailed = tz === clampZ;
          if (isDerailed) {
            x = 1.5 + 0.3 + carIndex * 0.12;
            y = -0.1;
            rotX = 0.1;
            rotY += 0.25;
            rotZ = 0.25;
          }
        }
      }


    }

    if (y > 0) {
      if (tz >= 25) {
        x = 0;
      } else if (tz < 25 && tz >= 10) {
        x = getFreio02Track1X(tz, side1);
      } else {
        if (side1 === 'L') {
          x = getFreio02Track2X(tz, side23);
        } else {
          x = getFreio02Track3X(tz, side23);
        }
      }

      // Calcular rotação
      const dt = 0.1;
      let nextX = x;
      if (direction === 'NORTE_SUL') {
        if ((tz - dt) >= 25) {
          nextX = 0;
        } else if ((tz - dt) < 25 && (tz - dt) >= 10) {
          nextX = getFreio02Track1X(tz - dt, side1);
        } else {
          if (side1 === 'L') nextX = getFreio02Track2X(tz - dt, side23);
          else nextX = getFreio02Track3X(tz - dt, side23);
        }
        rotY = Math.atan2(nextX - x, -dt);
      } else {
        if ((tz + dt) >= 25) {
          nextX = 0;
        } else if ((tz + dt) < 25 && (tz + dt) >= 10) {
          nextX = getFreio02Track1X(tz + dt, side1);
        } else {
          if (side1 === 'L') nextX = getFreio02Track2X(tz + dt, side23);
          else nextX = getFreio02Track3X(tz + dt, side23);
        }
        rotY = Math.atan2(nextX - x, dt);
      }
    }
  } else if (layoutType === 'freio') {
    let isOnBranch1 = false;
    let isOnBranch2 = false;
    
    // Determine the route of the train based on Z position and AMV states
    if (direction === 'NORTE_SUL') {
      // Train starts at top (z = 50) and moves to bottom (z = -50)
      if (tz <= -2) {
        isOnBranch2 = amv1 === 'REVERSO' && amv2 === 'REVERSO';
        isOnBranch1 = amv1 === 'REVERSO' && amv2 === 'NORMAL';
      } else if (tz <= 18) {
        isOnBranch2 = false;
        isOnBranch1 = amv1 === 'REVERSO';
      } else {
        isOnBranch2 = false;
        isOnBranch1 = false;
      }

      // Helper to calculate X at any Z based on resolved route
      const getFreioXForZ = (zVal: number) => {
        let branch2 = false;
        let branch1 = false;
        if (zVal <= -2) {
          branch2 = amv1 === 'REVERSO' && amv2 === 'REVERSO';
          branch1 = amv1 === 'REVERSO' && amv2 === 'NORMAL';
        } else if (zVal <= 18) {
          branch1 = amv1 === 'REVERSO';
        }
        if (branch2) return getFreioTrack2X(zVal);
        if (branch1) return getFreioTrack1X(zVal);
        return 0;
      };

      // Calculate position X
      x = getFreioXForZ(tz);
      const nextX = getFreioXForZ(tz - 0.1);
      rotY = Math.atan2(nextX - x, -0.1);
      
      if (isOnBranch1 || isOnBranch2) {
        ledColor = '#fbbf24';
      }

      // ----------------------------------------------------
      // FACING POINT DERAILMENTS (North to South)
      // ----------------------------------------------------
      
      // AMV 1 (65B) - Descarrilamento se falha na ponta
      if (tz <= (18 + carIndex * 5.5) && tz >= 0) {
        const clampZ1 = 17 + carIndex * 5.5;
        if (amv1 === 'FALHA') {
          tz = Math.max(tz, clampZ1);
          if (tz === clampZ1) { x = 0.35 + carIndex * 0.12; y = -0.1; rotY -= 0.25; rotZ = -0.25; isOnBranch1 = false; }
        }
      }

      // AMV 2 (65A) - Descarrilamento se falha na ponta
      if (isOnBranch1 && tz <= (-2 + carIndex * 5.5) && tz >= -12) {
        const clampZ2 = -3 + carIndex * 5.5;
        if (amv2 === 'FALHA') {
          tz = Math.max(tz, clampZ2);
          if (tz === clampZ2) { x = 2.5 + 0.35 + carIndex * 0.12; y = -0.1; rotY -= 0.25; rotZ = -0.25; isOnBranch2 = false; }
        }
      }

    } else {
      // SUL -> NORTE (Trailing points)
      const startedOnBranch2 = spawnLine === '2';
      const startedOnBranch1 = spawnLine === '1';

      if (tz <= -2) {
        isOnBranch2 = startedOnBranch2;
        isOnBranch1 = startedOnBranch1;
      } else if (tz <= 18) {
        isOnBranch2 = false;
        isOnBranch1 = startedOnBranch2 || startedOnBranch1;
      } else {
        isOnBranch2 = false;
        isOnBranch1 = false;
      }

      const getFreioXForZ = (zVal: number) => {
        let branch2 = false;
        let branch1 = false;
        if (zVal <= -2) {
          branch2 = startedOnBranch2;
          branch1 = startedOnBranch1;
        } else if (zVal <= 18) {
          branch1 = startedOnBranch2 || startedOnBranch1;
        }
        if (branch2) return getFreioTrack2X(zVal);
        if (branch1) return getFreioTrack1X(zVal);
        return 0;
      };

      x = getFreioXForZ(tz);
      const nextX = getFreioXForZ(tz + 0.1);
      rotY = Math.atan2(nextX - x, 0.1);
      
      if (isOnBranch1 || isOnBranch2) {
        ledColor = '#fbbf24';
      }
      
      // Talonamento / Falha no AMV 2 (65A, z = -2)
      if (tz >= (-2 - carIndex * 5.5) && tz <= 5) {
        const clampZ2 = -3 - carIndex * 5.5;
        if (startedOnBranch2 && (amv2 === 'NORMAL' || amv2 === 'FALHA')) {
          tz = Math.min(tz, clampZ2);
          if (tz === clampZ2) { x = 5.0 - 0.35 - carIndex * 0.12; y = -0.1; rotY += 0.3; rotZ = -0.3; }
        } else if (startedOnBranch1 && (amv2 === 'REVERSO' || amv2 === 'FALHA')) {
          tz = Math.min(tz, clampZ2);
          if (tz === clampZ2) { x = 2.5 + 0.35 + carIndex * 0.12; y = -0.1; rotY -= 0.3; rotZ = 0.3; }
        }
      }

      // Talonamento / Falha no AMV 1 (65B, z = 18)
      if (tz >= (18 - carIndex * 5.5) && tz <= 25) {
        const clampZ1 = 17 - carIndex * 5.5;
        const comingFromBranches = startedOnBranch1 || startedOnBranch2;
        if (comingFromBranches && (amv1 === 'NORMAL' || amv1 === 'FALHA')) {
          tz = Math.min(tz, clampZ1);
          if (tz === clampZ1) { x = 2.5 - 0.35 - carIndex * 0.12; y = -0.1; rotY += 0.3; rotZ = -0.3; }
        } else if (!comingFromBranches && (amv1 === 'REVERSO' || amv1 === 'FALHA')) {
          tz = Math.min(tz, clampZ1);
          if (tz === clampZ1) { x = 0.35 + carIndex * 0.12; y = -0.1; rotY -= 0.3; rotZ = 0.3; }
        }
      }
    }


  } else if (layoutType === 'carga_geral_02') {
    // ------------------ CARGA GERAL 02 LAYOUT ------------------
    if (direction === 'NORTE_SUL') {
      // Main Line (L-22A) unless turning
      if (amv1 === 'FALHA' && tz <= (25 + carIndex * 5.5) && tz >= 5) {
        const clampZ = 24 + carIndex * 5.5;
        if (tz <= clampZ + 2) ledColor = '#ef4444';
        tz = Math.max(tz, clampZ);
        if (tz === clampZ) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
      } else if (amv1 === 'REVERSO') {
        if (tz <= (25 + carIndex * 5.5)) ledColor = '#fbbf24';
        if (tz <= (25 + carIndex * 5.5) && tz >= 5) {
          x = getCargaGeral02Track1X(tz);
          const nextX = getCargaGeral02Track1X(tz - 0.1);
          rotY = Math.atan2(nextX - x, -0.1);
        } else if (tz < 5) {
          x = -5.0; // Straight on L-24A
        }
      } else {
        // amv1 is NORMAL, so train stays on main line until AMV 2
        if (amv2 === 'FALHA' && tz <= (10 + carIndex * 5.5) && tz >= -10) {
          const clampZ = 9 + carIndex * 5.5;
          if (tz <= clampZ + 2) ledColor = '#ef4444';
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
        } else if (amv2 === 'REVERSO') {
          if (tz <= (10 + carIndex * 5.5)) ledColor = '#fbbf24';
          if (tz <= (10 + carIndex * 5.5) && tz >= -10) {
            x = getCargaGeral02Track2X(tz);
            const nextX = getCargaGeral02Track2X(tz - 0.1);
            rotY = Math.atan2(nextX - x, -0.1);
          } else if (tz < -10) {
            x = -2.5; // Straight on L-23A
          }
        }
      }
    } else {
       // SUL_NORTE (spawnLine dictates path)
       let maxZ = 100;
       if (spawnLine === '24A') {
         if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       } else if (spawnLine === '23A') {
         if (amv2 !== 'REVERSO') maxZ = Math.min(maxZ, 9 - carIndex * 5.5);
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       } else { // 22A
         if (amv2 !== 'NORMAL') maxZ = Math.min(maxZ, 9 - carIndex * 5.5);
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       }
       
       const isDerailed = tz >= maxZ;
       tz = Math.min(tz, maxZ);
       
       if (spawnLine === '24A') {
         x = -5.0;
         if (tz >= 5 && tz <= 25) {
           x = getCargaGeral02Track1X(tz);
           const nextX = getCargaGeral02Track1X(tz + 0.1);
           rotY = Math.atan2(nextX - x, 0.1);
         } else if (tz > 25) {
           x = 0;
         }
       } else if (spawnLine === '23A') {
         x = -2.5;
         if (tz >= -10 && tz <= 10) {
           x = getCargaGeral02Track2X(tz);
           const nextX = getCargaGeral02Track2X(tz + 0.1);
           rotY = Math.atan2(nextX - x, 0.1);
         } else if (tz > 10) {
           x = 0;
         }
       } else {
         // Main line 22A
         x = 0;
       }

       if (isDerailed) { rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
    }
  } else {
    // ------------------ DUAL AMV PATH (Default Siding) ------------------
    const getTrackX = (zVal: number) => {
      const absZ = Math.abs(zVal);
      if (absZ >= 30) return 0;
      if (absZ >= 25 && absZ <= 30) {
        return 0.2 * (30 - absZ);
      } else {
        const u = (25 - absZ) / 25;
        return -3.4 * (u ** 3) + 2.6 * (u ** 2) + 5.0 * u + 1.0;
      }
    };

    let isOnBranch = false;
    if (direction === 'NORTE_SUL') {
      if (tz <= 30 && tz >= 0 && amv1 === 'REVERSO') isOnBranch = true;
      if (tz < 0 && amv1 === 'REVERSO') isOnBranch = true;
    } else {
      if (tz >= -30 && tz <= 0 && amv2 === 'REVERSO') isOnBranch = true;
      if (tz > 0 && amv2 === 'REVERSO') isOnBranch = true;
    }

    if (direction === 'NORTE_SUL') {
      if (tz <= (30 + carIndex * 5.5) && tz > 0) {
        if (amv1 === 'FALHA') {
          const clampZ = 29 + carIndex * 5.5;
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) {
            x = 0.4 + carIndex * 0.15;
            y = -0.1;
            rotX = 0.1;
            rotY += 0.2 + carIndex * 0.05;
            rotZ = 0.25 + carIndex * 0.05;
            isOnBranch = false;
          }
        }
      } else if (tz <= (0 + carIndex * 5.5) && tz >= -30) {
        const clampZ = -1 + carIndex * 5.5;
        if (amv2 === 'FALHA') {
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) {
            y = -0.1;
            rotZ = 0.3 + carIndex * 0.05;
            if (!isOnBranch) {
              rotX = -0.1;
              rotY -= 0.2 + carIndex * 0.05;
              rotZ = -0.25 - carIndex * 0.05;
            } else {
              x = getTrackX(clampZ) + 0.3 + carIndex * 0.1;
            }
          }
        } else if (isOnBranch && amv2 === 'NORMAL') {
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) {
            x = getTrackX(clampZ) + 0.3 + carIndex * 0.1;
            y = -0.1;
            rotX = -0.15;
            rotY += 0.3 + carIndex * 0.05;
            rotZ = 0.3 + carIndex * 0.05;
          }
        } else if (!isOnBranch && amv2 === 'REVERSO') {
          tz = Math.max(tz, clampZ);
          if (tz === clampZ) {
            x = -0.3 - carIndex * 0.1;
            y = -0.1;
            rotY -= 0.3 + carIndex * 0.05;
            rotZ = -0.3 - carIndex * 0.05;
          }
        }
      }
    } else {
      if (tz >= (-30 - carIndex * 5.5) && tz < 0) {
        if (amv2 === 'FALHA') {
          const clampZ = -29 - carIndex * 5.5;
          tz = Math.min(tz, clampZ);
          if (tz === clampZ) {
            x = 0.4 + carIndex * 0.15;
            y = -0.1;
            rotX = -0.1;
            rotY -= 0.2 + carIndex * 0.05;
            rotZ = -0.25 - carIndex * 0.05;
            isOnBranch = false;
          }
        }
      } else if (tz >= (0 - carIndex * 5.5) && tz <= 30) {
        const clampZ = 1 - carIndex * 5.5;
        if (amv1 === 'FALHA') {
          tz = Math.min(tz, clampZ);
          if (tz === clampZ) {
            y = -0.1;
            rotZ = 0.3 + carIndex * 0.05;
            if (!isOnBranch) {
              rotX = 0.1;
              rotY += 0.2 + carIndex * 0.05;
              rotZ = 0.25 + carIndex * 0.05;
            } else {
              x = getTrackX(clampZ) + 0.3 + carIndex * 0.1;
            }
          }
        } else if (isOnBranch && amv1 === 'NORMAL') {
          tz = Math.min(tz, clampZ);
          if (tz === clampZ) {
            x = getTrackX(clampZ) + 0.3 + carIndex * 0.1;
            y = -0.1;
            rotX = 0.15;
            rotY -= 0.3 + carIndex * 0.05;
            rotZ = 0.3 + carIndex * 0.05;
          }
        } else if (!isOnBranch && amv1 === 'REVERSO') {
          tz = Math.min(tz, clampZ);
          if (tz === clampZ) {
            x = -0.3 - carIndex * 0.1;
            y = -0.1;
            rotY += 0.3 + carIndex * 0.05;
            rotZ = -0.3 - carIndex * 0.05;
          }
        }
      }
    }

    if (isOnBranch && y > 0) {
      x = getTrackX(tz);
      const dt = 0.1;
      if (direction === 'NORTE_SUL') {
        const nextX = getTrackX(tz - dt);
        rotY = Math.atan2(nextX - x, -dt);
      } else {
        const nextX = getTrackX(tz + dt);
        rotY = Math.atan2(nextX - x, dt);
      }
    } else if (y > 0) {
      x = 0;
    }
  }

  return {
    pos: [x, y, tz],
    rot: [rotX, rotY, rotZ],
    color: ledColor
  };
}

function PovCamera() {
  const groupRef = useRef<THREE.Group>(null);
  const { gl } = useThree();
  const isHovered = useRef(false);

  useEffect(() => {
    isHovered.current = true;
    const handleEnter = () => (isHovered.current = true);
    const handleLeave = () => (isHovered.current = false);
    
    gl.domElement.addEventListener('pointerenter', handleEnter);
    gl.domElement.addEventListener('pointerleave', handleLeave);
    
    return () => {
      gl.domElement.removeEventListener('pointerenter', handleEnter);
      gl.domElement.removeEventListener('pointerleave', handleLeave);
    };
  }, [gl]);

  useFrame((state) => {
    if (groupRef.current) {
       const targetAngle = isHovered.current ? -state.pointer.x * (Math.PI / 3.5) : 0;
       groupRef.current.rotation.y = THREE.MathUtils.lerp(
         groupRef.current.rotation.y,
         Math.PI + targetAngle,
         0.03
       );
    }
  });
  
  return (
    <group position={[0, 3.45, -3.2]} rotation={[-0.15, 0, 0]}>
      <group ref={groupRef} rotation={[0, Math.PI, 0]}>
        <PerspectiveCamera makeDefault fov={65} position={[0, 0, 0]} />
      </group>
    </group>
  );
}

function CameraController({ cameraMode }: { cameraMode: CameraMode }) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const isTransitioning = useRef(false);
  const transitionTimer = useRef(0);
  const targetPos = useMemo(() => new THREE.Vector3(20, 35, 15), []);
  const targetLookAt = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useEffect(() => {
    if (cameraMode === 'POV') return;
    isTransitioning.current = true;
    transitionTimer.current = 0;
    if (cameraMode === 'ISOMETRIC') {
      targetPos.set(20, 35, 15);
      targetLookAt.set(0, 0, 0);
    } else if (cameraMode === 'TOP') {
      targetPos.set(0, 60, -8);
      targetLookAt.set(0, 0, -8);
    }
  }, [cameraMode, targetPos, targetLookAt]);

  useFrame((_, delta) => {
    if (cameraMode === 'POV' || !isTransitioning.current) return;
    transitionTimer.current += delta;
    const alpha = Math.min(1, delta * 7);
    camera.position.lerp(targetPos, alpha);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt, alpha);
      controlsRef.current.update();
    }
    if (camera.position.distanceTo(targetPos) < 0.15 || transitionTimer.current > 0.75) {
      isTransitioning.current = false;
    }
  });

  if (cameraMode === 'POV') return null;

  return (
    <>
      <PerspectiveCamera makeDefault position={[20, 35, 15]} fov={40} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enableRotate={cameraMode === 'ISOMETRIC'}
        enablePan={true}
        panSpeed={1.5}
        screenSpacePanning={true}
        mouseButtons={{
          LEFT: cameraMode === 'TOP' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN
        }}
        touches={{
          ONE: cameraMode === 'TOP' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN
        }}
        maxPolarAngle={cameraMode === 'TOP' ? 0.01 : Math.PI / 2 - 0.08}
        minDistance={5}
        maxDistance={180}
      />
    </>
  );
}

function TrainGroup({
  layoutType,
  direction,
  amvs,
  cameraMode,
  isMoving,
  nightMode,
  spawnLine,
  destLine,
  speedMultiplier,
  hasWagons,
  resetKey,
  onProgressChange
}: {
  layoutType: LayoutType,
  direction: Direction,
  amvs: SwitchState[],
  cameraMode: CameraMode,
  isMoving: boolean,
  nightMode: boolean,
  spawnLine: SpawnLine,
  destLine: SpawnLine,
  speedMultiplier: 1 | 2,
  hasWagons: boolean,
  resetKey: number,
  onProgressChange?: (p: number) => void
}) {
  const locoRef = useRef<THREE.Group>(null);
  const wagon1Ref = useRef<THREE.Group>(null);
  const wagon2Ref = useRef<THREE.Group>(null);
  const progressRef = useRef(0);
  const lastReportedRef = useRef(0);
  
  useEffect(() => {
    progressRef.current = 0;
    lastReportedRef.current = 0;
    if (onProgressChange) onProgressChange(0);
  }, [direction, spawnLine, layoutType, resetKey]);

  useFrame((state, delta) => {
    if (isMoving) {
      if (progressRef.current >= 1) {
        progressRef.current = 0;
      }
      progressRef.current += delta * 0.05 * speedMultiplier;
      if (progressRef.current > 1) progressRef.current = 1;

      if (onProgressChange && Math.abs(progressRef.current - lastReportedRef.current) > 0.02) {
        lastReportedRef.current = progressRef.current;
        onProgressChange(progressRef.current);
      }
    }

    // Espaçamento real entre engates (5.2m = 0.052 da rota)
    // Quando há vagões, a locomotiva inicia à frente (0.104) e os vagões já iniciam engatados atrás dela (0.052 e 0.0),
    // impedindo que a locomotiva passe por dentro dos vagões na partida.
    const CAR_STEP = 0.052;
    const pLoco = hasWagons ? 2 * CAR_STEP + progressRef.current * (1 - 2 * CAR_STEP) : progressRef.current;
    const { pos: posLoco, rot: rotLoco } = getRoutePosRot(layoutType, direction, amvs, pLoco, 0, spawnLine);
    if (locoRef.current) {
      locoRef.current.position.set(posLoco[0], posLoco[1], posLoco[2]);
      locoRef.current.rotation.set(rotLoco[0], rotLoco[1], rotLoco[2]);
    }

    // Vagões acoplados sempre atrás da locomotiva no sentido da circulação
    if (hasWagons) {
      const pW1 = pLoco - CAR_STEP;
      const { pos: posW1, rot: rotW1 } = getRoutePosRot(layoutType, direction, amvs, pW1, 1, spawnLine);
      if (wagon1Ref.current) {
        wagon1Ref.current.position.set(posW1[0], posW1[1], posW1[2]);
        wagon1Ref.current.rotation.set(rotW1[0], rotW1[1], rotW1[2]);
      }

      const pW2 = pLoco - 2 * CAR_STEP;
      const { pos: posW2, rot: rotW2 } = getRoutePosRot(layoutType, direction, amvs, pW2, 2, spawnLine);
      if (wagon2Ref.current) {
        wagon2Ref.current.position.set(posW2[0], posW2[1], posW2[2]);
        wagon2Ref.current.rotation.set(rotW2[0], rotW2[1], rotW2[2]);
      }
    }
  });

  const CAR_STEP = 0.052;
  const initLocoP = hasWagons ? 2 * CAR_STEP : 0;
  const initialLoco = getRoutePosRot(layoutType, direction, amvs, initLocoP, 0, spawnLine);
  const initialW1 = getRoutePosRot(layoutType, direction, amvs, initLocoP - CAR_STEP, 1, spawnLine);
  const initialW2 = getRoutePosRot(layoutType, direction, amvs, initLocoP - 2 * CAR_STEP, 2, spawnLine);

  return (
    <group>
      <group ref={locoRef} position={initialLoco.pos as any} rotation={initialLoco.rot as any}>
        <Locomotive3D position={[0, 0, 0]} rotation={[0, 0, 0]} visible={true} nightMode={nightMode} />
        {cameraMode === 'POV' && <PovCamera />}
      </group>

      {hasWagons && (
        <>
          <group ref={wagon1Ref} position={initialW1.pos as any} rotation={initialW1.rot as any}>
            <Wagon3D position={[0, 0, 0]} rotation={[0, 0, 0]} type="tank" color="#0ea5e9" />
          </group>
          <group ref={wagon2Ref} position={initialW2.pos as any} rotation={initialW2.rot as any}>
            <Wagon3D position={[0, 0, 0]} rotation={[0, 0, 0]} type="container" color="#f59e0b" />
          </group>
        </>
      )}
    </group>
  );
}

function CargaGeral02AmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const getTips2 = () => {
    if (amvs[1] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[1] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  return (
    <group>
      <Sleepers layoutType="carga_geral_02" />
      <CurveBranch layoutType="carga_geral_02" />

      {/* AMV 1 - (z = 25, x = 0) Branches left to Auxiliar */}
      <group 
        position={[0, 0, 25]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[getCargaGeral02Track1X(20) + 0.8, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={true} />
        
        <Text position={[3, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.5} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1
        </Text>
      </group>

      <FrogInfo x={-0.8} z={18} />

      {/* AMV 2 - (z = 10, x = 0) Branches left to 23A */}
      <group 
        position={[0, 0, 10]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[-0.8, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[getCargaGeral02Track2X(5) + 0.8, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={true} />
        
        <Text position={[3, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.4} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2
        </Text>
      </group>

      <FrogInfo x={-0.8} z={-1} />

      {/* Placas de identificação dentro das linhas */}
      <TrackLinePlate label="L-24A" x={-5.0} z={-28} />
      <TrackLinePlate label="L-23A" x={-2.5} z={-28} />
      <TrackLinePlate label="L-22A" x={0} z={-28} />
    </group>
  );
}


function PatioOficinaAmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.8, right: 0.5 };
    return { left: -0.5, right: 0.8 };
  };

  const getTips2 = () => {
    if (amvs[1] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[1] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const getTips3 = () => {
    if (amvs[2] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[2] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  return (
    <group>
      <Sleepers layoutType="patio_oficina" />
      <CurveBranch layoutType="patio_oficina" />

      {/* AMV 1 - (z = 20, Branches Right to L-28) */}
      <group 
        position={[0, 0, 20]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[getPatioOficinaTrack1X(15) - 0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[0.8, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={false} isReverse={amvs[0] !== 'NORMAL'} />
      </group>

      {/* AMV 2 - (z = 0, Branches Left to L-31) */}
      <group 
        position={[0, 0, 0]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[-0.8, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[getPatioOficinaTrack2X(-5) + 0.8, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={true} />
      </group>

      {/* AMV 3 - (z = -20, Branches Left to L-27) */}
      <group 
        position={[0, 0, -20]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(2); onToggleAmv(2); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={2} hinge={[-0.8, 0, -5]} tipTargetX={getTips3().left} tipZ={0} />
        <AnimatedPoint amvIndex={2} hinge={[getPatioOficinaTrack3X(-25) + 0.8, 0, -5]} tipTargetX={getTips3().right} tipZ={0} />
        <TieBar amvIndex={2} getLeftTipX={() => getTips3().left} getRightTipX={() => getTips3().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips3().left} tipZ={0} isLeftSide={true} />
      </group>

      {/* Placas de identificação dentro das linhas */}
      <TrackLinePlate label="L-201A" x={0} z={35} />
      <TrackLinePlate label="L-32" x={0} z={-40} />
      <TrackLinePlate label="L-28" x={5.0} z={-20} />
      <TrackLinePlate label="L-31" x={-5.0} z={-20} badge="CARGA GERAL" />
      <TrackLinePlate label="L-27" x={-5.0} z={-40} />
      <TrackLinePlate label="L-P13A" x={-10.0} z={-40} />
    </group>
  );
}

function Passageiro01AmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const getTips2 = () => {
    if (amvs[1] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[1] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const amv1RightHingeX = getPassageiro01TrackTP2AX(20) + 0.8;
  const amv2X = getPassageiro01TrackTP2AX(5);
  const amv2LeftHingeX = (getPassageiro01TrackTP2AX(0) - amv2X) - 0.8;
  const amv2RightHingeX = (getPassageiro01TrackTP3AX(0) - amv2X) + 0.8;

  return (
    <group>
      <Sleepers layoutType="passageiro_01" />
      <CurveBranch layoutType="passageiro_01" />

      {/* Sinaleiro baixo (Dwarf Signal) à direita antes do AMV 1 como na foto */}
      <group position={[2.2, 0, 27]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.08, 0.5, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[0.32, 0.48, 0.22]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.7, 0.12]}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={3} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.5, 0.12]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.3} />
        </mesh>
      </group>

      {/* AMV 1 (z = 25, x = 0) */}
      <group
        position={[0, 0, 25]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[amv1RightHingeX, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={true} />

        <Text position={[3.6, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.4} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1
        </Text>
      </group>

      <FrogInfo x={-0.8} z={11} />

      {/* AMV 2 na curva à esquerda (z = 5, x = amv2X) */}
      <group
        position={[amv2X, 0, 5]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[amv2LeftHingeX, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[amv2RightHingeX, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={true} />

        <Text position={[-3.6, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.4} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2
        </Text>
      </group>

      <FrogInfo x={getPassageiro01TrackTP2AX(-13) - 0.8} z={-13} />

      {/* ========================================================= */}
      {/* PLACA VERDE NEON: 1,30% PERCENTUAL DE RAMPA               */}
      {/* ========================================================= */}
      <group position={[3.35, 0, 8]} rotation={[0, -0.12, 0]}>
        {/* Base de fixação no solo */}
        <mesh position={[0, -0.05, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.38, 0.06, 0.24]} />
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.5} />
        </mesh>
        {/* Mastro vertical (termina exatamente na base da placa inferior sem sobrepor o texto) */}
        <mesh position={[0, 0.36, 0]} castShadow>
          <cylinderGeometry args={[0.032, 0.032, 0.76, 12]} />
          <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Placa Inferior: PERCENTUAL DE RAMPA */}
        <group position={[0, 1.08, 0]}>
          <mesh castShadow>
            <boxGeometry args={[2.35, 0.68, 0.08]} />
            <meshBasicMaterial color="#a3e635" toneMapped={false} />
          </mesh>
          <Text
            position={[0, 0.14, 0.052]}
            fontSize={0.24}
            color="#000000"
            anchorX="center"
            anchorY="middle"
            toneMapped={false}
          >
            PERCENTUAL
          </Text>
          <Text
            position={[0, -0.15, 0.052]}
            fontSize={0.24}
            color="#000000"
            anchorX="center"
            anchorY="middle"
            toneMapped={false}
          >
            DE RAMPA
          </Text>
          <Text
            position={[0, 0.14, -0.052]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.24}
            color="#000000"
            anchorX="center"
            anchorY="middle"
            toneMapped={false}
          >
            PERCENTUAL
          </Text>
          <Text
            position={[0, -0.15, -0.052]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.24}
            color="#000000"
            anchorX="center"
            anchorY="middle"
            toneMapped={false}
          >
            DE RAMPA
          </Text>
        </group>

        {/* Haste conectora curta entre as duas placas */}
        <mesh position={[0, 1.46, 0]}>
          <cylinderGeometry args={[0.024, 0.024, 0.08, 10]} />
          <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Placa Superior: 1,30% */}
        <group position={[0, 1.88, 0]}>
          <mesh castShadow>
            <boxGeometry args={[2.55, 0.76, 0.08]} />
            <meshBasicMaterial color="#a3e635" toneMapped={false} />
          </mesh>
          <Text
            position={[0, 0, 0.052]}
            fontSize={0.52}
            color="#000000"
            anchorX="center"
            anchorY="middle"
            toneMapped={false}
          >
            1,30%
          </Text>
          <Text
            position={[0, 0, -0.052]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.52}
            color="#000000"
            anchorX="center"
            anchorY="middle"
            toneMapped={false}
          >
            1,30%
          </Text>
        </group>
      </group>

      {/* ========================================================= */}
      {/* TRAÇADO TRACEJADO VERDE NEON ACOMPANHANDO O TRILHO TP-01  */}
      {/* ========================================================= */}
      <group>
        {/* 1. Tracejado acompanhando o trilho direito da TP-01 na curva até o final do trilho (z = 18 até z = -54.5) */}
        {Array.from({ length: 56 }).map((_, idx) => {
          const z = 18 - idx * 1.31;
          const x = getPassageiro01TrackTP01X(z) + 1.02;
          const rotY = Math.atan2(
            getPassageiro01TrackTP01X(z + 0.5) - getPassageiro01TrackTP01X(z - 0.5),
            1.0
          );
          return (
            <mesh key={`ramp-rail-dash-${idx}`} position={[x, 0.03, z]} rotation={[0, rotY, 0]}>
              <boxGeometry args={[0.16, 0.035, 0.72]} />
              <meshBasicMaterial color="#84ff00" toneMapped={false} />
            </mesh>
          );
        })}

        {/* 2. Tracejado diagonal ligando a lateral da placa de 1,30% ao trilho da TP-01 */}
        {Array.from({ length: 5 }).map((_, idx) => {
          const t = (idx + 0.5) / 5;
          const startX = 2.05;
          const startZ = 7.4;
          const endZ = 3.5;
          const endX = getPassageiro01TrackTP01X(endZ) + 1.02;
          const x = startX + (endX - startX) * t;
          const z = startZ + (endZ - startZ) * t;
          const rotY = Math.atan2(endX - startX, endZ - startZ);
          return (
            <mesh key={`ramp-lead-dash-${idx}`} position={[x, 0.03, z]} rotation={[0, rotY, 0]}>
              <boxGeometry args={[0.15, 0.035, 0.52]} />
              <meshBasicMaterial color="#84ff00" toneMapped={false} />
            </mesh>
          );
        })}
      </group>

      {/* Placas de identificação dentro das linhas com alto contraste e legibilidade */}
      <TrackLinePlate
        label="TP-3A"
        x={getPassageiro01TrackTP3AX(-30.2)}
        z={-30.2}
        rotY={Math.atan2(getPassageiro01TrackTP3AX(-29.7) - getPassageiro01TrackTP3AX(-30.7), 1.0)}
      />
      <TrackLinePlate
        label="TP-2A"
        x={getPassageiro01TrackTP2AX(-30.2)}
        z={-30.2}
        rotY={Math.atan2(getPassageiro01TrackTP2AX(-29.7) - getPassageiro01TrackTP2AX(-30.7), 1.0)}
      />
      <TrackLinePlate
        label="TP-01"
        x={getPassageiro01TrackTP01X(-30.2)}
        z={-30.2}
        rotY={Math.atan2(getPassageiro01TrackTP01X(-29.7) - getPassageiro01TrackTP01X(-30.7), 1.0)}
      />
    </group>
  );
}

function Passageiro02AmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  // AMV TP-3B (z = -10, x = -1.2):
  // Simétrico ao AMV TP-2B com ponta de lança convergente:
  // NORMAL (Reta TP-3B): agulha direita fechada (+0.8), agulha esquerda aberta (-0.5)
  // REVERSO (Travessão): agulha esquerda fechada (-0.8), agulha direita aberta (+0.5)
  const getTips2 = () => {
    if (amvs[1] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[1] === 'REVERSO') return { left: -0.8, right: 0.5 };
    return { left: -0.5, right: 0.8 };
  };

  const getTips3 = () => {
    if (amvs[2] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[2] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const getTips4 = () => {
    const a4 = amvs[3] || 'NORMAL';
    if (a4 === 'FALHA') return { left: -0.65, right: 0.65 };
    if (a4 === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const amv1RightHingeX = (getPassageiro02CrossoverX(20) - 2.8) + 0.8;
  const amv2LeftHingeX = (getPassageiro02CrossoverX(-5) - (-1.2)) - 0.8;
  const amv3RightHingeX = (getPassageiro02TrackTP04X(20) - (-1.2)) + 0.8;
  const amv4RightHingeX = (getPassageiro02TrackTP05X(0) - (-4.2)) + 0.8;

  return (
    <group>
      <Sleepers layoutType="passageiro_02" />
      <CurveBranch layoutType="passageiro_02" />

      {/* ========================================================= */}
      {/* PLACA AMARELA DE AVISO: OBS: TODOS OS AMV'S SÃO MANUAIS   */}
      {/* ========================================================= */}
      <group position={[-7.2, 0, 16.5]} rotation={[0, 0.15, 0]}>
        {/* Poste metálico posicionado abaixo/atrás da placa para não cortar o texto */}
        <mesh position={[0, 0.42, -0.06]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.84, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Placa amarela vibrante inclinada para leitura limpa */}
        <group position={[0, 1.38, 0]} rotation={[-0.18, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[3.2, 1.32, 0.06]} />
            <meshBasicMaterial color="#facc15" toneMapped={false} />
          </mesh>
          <Text position={[0, 0.34, 0.04]} fontSize={0.27} fontWeight={800} color="#000000" anchorX="center" anchorY="middle" toneMapped={false}>
            OBS: TODOS OS
          </Text>
          <Text position={[0, 0.0, 0.04]} fontSize={0.27} fontWeight={800} color="#000000" anchorX="center" anchorY="middle" toneMapped={false}>
            AMV'S SÃO
          </Text>
          <Text position={[0, -0.34, 0.04]} fontSize={0.27} fontWeight={800} color="#000000" anchorX="center" anchorY="middle" toneMapped={false}>
            MANUAIS
          </Text>
        </group>
      </group>

      {/* ========================================================= */}
      {/* PRÉDIO LATERAL ESQUERDO (BRANCO COM BASE TURQUESA E FRISO VERMELHO) */}
      {/* ========================================================= */}
      <group position={[-11.2, 0, -34]}>
        {/* Corpo branco do prédio */}
        <mesh position={[0, 1.75, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.4, 3.5, 15.5]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.65} />
        </mesh>
        {/* Faixa inferior azul-turquesa como na foto */}
        <mesh position={[0.02, 0.55, 0]} castShadow>
          <boxGeometry args={[3.44, 1.1, 15.54]} />
          <meshStandardMaterial color="#06b6d4" roughness={0.55} />
        </mesh>
        {/* Platibanda/Friso superior vermelho */}
        <mesh position={[0.02, 3.45, 0]} castShadow>
          <boxGeometry args={[3.52, 0.42, 15.65]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} />
        </mesh>
        {/* Janelas laterais voltadas para a linha TP-05 */}
        {[-5.2, -2.6, 0, 2.6, 5.2].map((wz, idx) => (
          <mesh key={`win-l-${idx}`} position={[1.72, 2.05, wz]}>
            <boxGeometry args={[0.05, 0.75, 1.35]} />
            <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />
          </mesh>
        ))}
      </group>

      {/* ========================================================= */}
      {/* GALPÃO DE PASSAGEIROS NO FUNDO (TP-05, TP-04, TP-3B, TP-2B) */}
      {/* ========================================================= */}
      <group position={[-2.7, 0, -50.5]}>
        {/* Estrutura principal creme/bege do Galpão de Passageiros (cobrindo TP-04 e TP-3B) */}
        <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[7.8, 7.0, 6.5]} />
          <meshStandardMaterial color="#e7e2d8" roughness={0.65} metalness={0.15} />
        </mesh>

        {/* Telhado de duas águas (Gable Roof) clássico do Galpão da foto */}
        <mesh position={[-2.0, 7.55, 0]} rotation={[0, 0, 0.24]} castShadow>
          <boxGeometry args={[4.3, 0.35, 6.8]} />
          <meshStandardMaterial color="#d6d1c7" roughness={0.6} metalness={0.25} />
        </mesh>
        <mesh position={[2.0, 7.55, 0]} rotation={[0, 0, -0.24]} castShadow>
          <boxGeometry args={[4.3, 0.35, 6.8]} />
          <meshStandardMaterial color="#d6d1c7" roughness={0.6} metalness={0.25} />
        </mesh>
        {/* Frontão triangular superior da fachada */}
        <mesh position={[0, 7.25, 3.22]}>
          <boxGeometry args={[5.2, 0.9, 0.12]} />
          <meshStandardMaterial color="#dfd9ce" roughness={0.65} />
        </mesh>
        {/* Venezianas de ventilação superiores no frontão */}
        {[-1.2, 0, 1.2].map((vx, idx) => (
          <mesh key={`vent-${idx}`} position={[vx, 7.25, 3.29]}>
            <boxGeometry args={[0.75, 0.45, 0.04]} />
            <meshStandardMaterial color="#64748b" roughness={0.5} />
          </mesh>
        ))}

        {/* Cobertura anexa azul-escura à esquerda sobre a linha TP-05 */}
        <group position={[-5.4, 0, 0.4]}>
          <mesh position={[0, 2.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.4, 5.2, 5.6]} />
            <meshStandardMaterial color="#1e3a8a" roughness={0.55} metalness={0.3} />
          </mesh>
          <mesh position={[0, 5.3, 0]} rotation={[0, 0, 0.12]} castShadow>
            <boxGeometry args={[3.7, 0.28, 5.9]} />
            <meshStandardMaterial color="#1d4ed8" roughness={0.5} metalness={0.35} />
          </mesh>
          {/* Abertura da baia TP-05 */}
          <mesh position={[0.9, 2.0, 2.82]}>
            <boxGeometry args={[2.1, 4.0, 0.08]} />
            <meshStandardMaterial color="#090d16" roughness={0.85} />
          </mesh>
        </group>

        {/* Aberturas escuras das baias principais (TP-04 em x=-4.2 e TP-3B em x=-1.2) */}
        {[-1.5, 1.5].map((bx, idx) => (
          <mesh key={`shed-bay-${idx}`} position={[bx, 2.25, 3.26]}>
            <boxGeometry args={[2.35, 4.5, 0.08]} />
            <meshStandardMaterial color="#090d16" roughness={0.85} />
          </mesh>
        ))}

        {/* Pórtico metálico industrial sobre a linha TP-3B na frente do galpão */}
        <group position={[1.5, 0, 7.5]}>
          <mesh position={[-1.25, 2.5, 0]} castShadow>
            <boxGeometry args={[0.16, 5.0, 0.16]} />
            <meshStandardMaterial color="#64748b" metalness={0.75} roughness={0.35} />
          </mesh>
          <mesh position={[1.25, 2.5, 0]} castShadow>
            <boxGeometry args={[0.16, 5.0, 0.16]} />
            <meshStandardMaterial color="#64748b" metalness={0.75} roughness={0.35} />
          </mesh>
          <mesh position={[0, 4.95, 0]} castShadow>
            <boxGeometry args={[2.75, 0.24, 0.24]} />
            <meshStandardMaterial color="#64748b" metalness={0.75} roughness={0.35} />
          </mesh>
        </group>

        {/* ========================================================= */}
        {/* COMPOSIÇÕES ESTACIONADAS NAS BAIAS DO GALPÃO (CENÁRIO FIEL À FOTO) */}
        {/* ========================================================= */}
        {/* 1. Carro de Passageiros Inox/Vermelho estacionado na TP-05 (x = -7.2 -> local -4.5) */}
        <group position={[-4.5, 0.1, 4.2]}>
          <mesh position={[0, 1.15, 0]} castShadow>
            <boxGeometry args={[1.68, 2.1, 4.2]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.65} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.75, 2.11]}>
            <boxGeometry args={[1.66, 0.45, 0.04]} />
            <meshStandardMaterial color="#dc2626" roughness={0.4} />
          </mesh>
          {[-0.45, 0.45].map((wx, i) => (
            <mesh key={`c05-w-${i}`} position={[wx, 1.45, 2.11]}>
              <boxGeometry args={[0.48, 0.48, 0.04]} />
              <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
            </mesh>
          ))}
        </group>

        {/* 2. Carro de Passageiros Inox/Vermelho na baia TP-04 (x = -4.2 -> local -1.5) */}
        <group position={[-1.5, 0.1, 3.8]}>
          <mesh position={[0, 1.15, 0]} castShadow>
            <boxGeometry args={[1.68, 2.1, 4.2]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.65} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.75, 2.11]}>
            <boxGeometry args={[1.66, 0.45, 0.04]} />
            <meshStandardMaterial color="#dc2626" roughness={0.4} />
          </mesh>
          {[-0.45, 0.45].map((wx, i) => (
            <mesh key={`c04-w-${i}`} position={[wx, 1.45, 2.11]}>
              <boxGeometry args={[0.48, 0.48, 0.04]} />
              <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
            </mesh>
          ))}
        </group>

        {/* 3. Locomotiva Azul e Amarela estacionada na baia TP-3B (x = -1.2 -> local +1.5) */}
        <group position={[1.5, 0.1, 3.9]}>
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[1.72, 2.2, 4.0]} />
            <meshStandardMaterial color="#0284c7" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.68, 2.01]}>
            <boxGeometry args={[1.70, 0.65, 0.05]} />
            <meshStandardMaterial color="#facc15" roughness={0.35} />
          </mesh>
          {[-0.42, 0.42].map((wx, i) => (
            <mesh key={`loco3b-w-${i}`} position={[wx, 1.62, 2.01]}>
              <boxGeometry args={[0.52, 0.42, 0.04]} />
              <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
            </mesh>
          ))}
        </group>

        {/* 4. Carro de Passageiros na lateral direita TP-2B (x = 2.8 -> local +5.5) */}
        <group position={[5.5, 0.1, 3.6]}>
          <mesh position={[0, 1.15, 0]} castShadow>
            <boxGeometry args={[1.68, 2.1, 4.2]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.65} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.75, 2.11]}>
            <boxGeometry args={[1.66, 0.45, 0.04]} />
            <meshStandardMaterial color="#dc2626" roughness={0.4} />
          </mesh>
        </group>
      </group>

      {/* ========================================================= */}
      {/* 1. AMV DA LINHA TP-2B (Início do Travessão em z = 25)      */}
      {/* ========================================================= */}
      <group
        position={[2.8, 0, 25]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[amv1RightHingeX, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={true} offsetX={-2.0} isReverse={amvs[0] !== 'NORMAL'} />
        <Text position={[3.2, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.2} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV TP-2B
        </Text>
      </group>
      <FrogInfo x={2.0} z={11} />

      {/* ========================================================= */}
      {/* 2. AMV DA LINHA TP-3B (Chegada do Travessão em z = -10)    */}
      {/*    Posicionado na marcação amarela com bandeirola verde/amarela */}
      {/* ========================================================= */}
      <group
        position={[-1.2, 0, -10]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[amv2LeftHingeX, 0, 5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[0.8, 0, 5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} ringOffsetZ={2.5} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={true} offsetX={-1.5} isReverse={amvs[1] !== 'NORMAL'} />
        <Text position={[-2.4, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.1} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV TP-3B
        </Text>
      </group>
      <FrogInfo x={-0.4} z={4} />

      {/* ========================================================= */}
      {/* 3. AMV DA LINHA TP-04 (Marcação vermelha inferior: z = 25) */}
      {/* ========================================================= */}
      <group
        position={[-1.2, 0, 25]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(2); onToggleAmv(2); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={2} hinge={[-0.8, 0, -5]} tipTargetX={getTips3().left} tipZ={0} />
        <AnimatedPoint amvIndex={2} hinge={[amv3RightHingeX, 0, -5]} tipTargetX={getTips3().right} tipZ={0} />
        <TieBar amvIndex={2} getLeftTipX={() => getTips3().left} getRightTipX={() => getTips3().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips3().left} tipZ={0} isLeftSide={true} offsetX={-1.9} isReverse={amvs[2] !== 'NORMAL'} />
        <Text position={[-3.2, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.1} color={selectedAmv === 2 ? "#818cf8" : "#64748b"}>
          AMV TP-04
        </Text>
      </group>
      <FrogInfo x={-2.0} z={14} />

      {/* ========================================================= */}
      {/* 4. AMV DA LINHA TP-05 (Marcação vermelha superior: z = 5)  */}
      {/* ========================================================= */}
      <group
        position={[-4.2, 0, 5]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(3); onToggleAmv(3); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={3} hinge={[-0.8, 0, -5]} tipTargetX={getTips4().left} tipZ={0} />
        <AnimatedPoint amvIndex={3} hinge={[amv4RightHingeX, 0, -5]} tipTargetX={getTips4().right} tipZ={0} />
        <TieBar amvIndex={3} getLeftTipX={() => getTips4().left} getRightTipX={() => getTips4().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips4().left} tipZ={0} isLeftSide={true} offsetX={-1.9} isReverse={(amvs[3] || 'NORMAL') !== 'NORMAL'} />
        <Text position={[-3.2, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.1} color={selectedAmv === 3 ? "#818cf8" : "#64748b"}>
          AMV TP-05
        </Text>
      </group>
      <FrogInfo x={-5.0} z={-6} />

      {/* ========================================================= */}
      {/* PLACAS DE IDENTIFICAÇÃO DENTRO DAS 4 LINHAS (TP-05 A TP-2B) */}
      {/* ========================================================= */}
      {[
        { label: 'TP-05', getX: getPassageiro02TrackTP05X, z: -26 },
        { label: 'TP-04', getX: getPassageiro02TrackTP04X, z: -26 },
        { label: 'TP-3B', getX: getPassageiro02TrackTP3BX, z: -26 },
        { label: 'TP-2B', getX: getPassageiro02TrackTP2BX, z: -26 },
      ].map((plate) => {
        const px = plate.getX(plate.z);
        const rotY = Math.atan2(plate.getX(plate.z + 0.5) - plate.getX(plate.z - 0.5), 1.0);
        return (
          <TrackLinePlate
            key={plate.label}
            label={plate.label}
            x={px}
            z={plate.z}
            rotY={rotY}
          />
        );
      })}
    </group>
  );
}

function OficinaCentralAmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const getTips2 = () => {
    if (amvs[1] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[1] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const getTips3 = () => {
    if (amvs[2] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[2] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const getTips4 = () => {
    const a4 = amvs[3] || 'NORMAL';
    if (a4 === 'FALHA') return { left: -0.65, right: 0.65 };
    if (a4 === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const amv1RightHingeX = (getOficinaCentralTrack161X(20) - (-1.2)) + 0.8;
  const amv2RightHingeX = (getOficinaCentralTrack160X(0) - (-4.0)) + 0.8;
  const amv3RightHingeX = (getOficinaCentralTrack164X(20) - 7.6) + 0.8;
  const amv4RightHingeX = (getOficinaCentralTrack163X(0) - 4.8) + 0.8;

  return (
    <group>
      <Sleepers layoutType="oficina_central" />
      <CurveBranch layoutType="oficina_central" />

      {/* ========================================================= */}
      {/* ABRIGO COM TANQUE CILÍNDRICO LARANJA E MURETA ZEBRADA     */}
      {/* (Entre L-158 e L-160 como na foto real)                   */}
      {/* ========================================================= */}
      <group position={[-9.35, 0, -9]}>
        {/* Base de contenção com faixas zebradas amarelas e pretas */}
        <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.1, 0.64, 3.8]} />
          <meshStandardMaterial color="#eab308" roughness={0.6} />
        </mesh>
        {[-1.5, -0.9, -0.3, 0.3, 0.9, 1.5].map((sz, idx) => (
          <mesh key={`zebra-${idx}`} position={[0, 0.32, sz]}>
            <boxGeometry args={[2.14, 0.65, 0.28]} />
            <meshStandardMaterial color="#090d16" roughness={0.7} />
          </mesh>
        ))}
        {/* Tanque cilíndrico horizontal laranja */}
        <mesh position={[0, 1.08, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.58, 0.58, 2.7, 24]} />
          <meshStandardMaterial color="#ea580c" metalness={0.35} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.08, 1.35]} scale={[1, 1, 0.4]} castShadow>
          <sphereGeometry args={[0.58, 20, 16]} />
          <meshStandardMaterial color="#ea580c" metalness={0.35} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.08, -1.35]} scale={[1, 1, 0.4]} castShadow>
          <sphereGeometry args={[0.58, 20, 16]} />
          <meshStandardMaterial color="#ea580c" metalness={0.35} roughness={0.4} />
        </mesh>
        {/* Colunas e telhado metálico do abrigo */}
        {[-0.95, 0.95].map((px, i) =>
          [-1.7, 1.7].map((pz, j) => (
            <mesh key={`col-${i}-${j}`} position={[px, 1.45, pz]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 2.2, 8]} />
              <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
            </mesh>
          ))
        )}
        <mesh position={[0, 2.6, 0]} castShadow>
          <boxGeometry args={[2.4, 0.14, 4.2]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.5} />
        </mesh>
      </group>

      {/* ========================================================= */}
      {/* FAIXA TRACEJADA AMARELA: CAMINHO SEGURO                   */}
      {/* ========================================================= */}
      <group position={[0, 0.02, -17.5]}>
        {Array.from({ length: 24 }).map((_, idx) => {
          const dashX = -7.8 + idx * 0.75;
          return (
            <mesh key={`dash-${idx}`} position={[dashX, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.46, 0.22]} />
              <meshBasicMaterial color="#facc15" toneMapped={false} />
            </mesh>
          );
        })}
        {/* Placa preta com texto vermelho: CAMINHO SEGURO TEM QUE SER BLOQUEADO PELO AUXILIAR */}
        <group position={[11.2, 0.95, 2.5]} rotation={[-Math.PI / 10, -0.18, 0]}>
          <mesh position={[0, -0.76, 0]}>
            <cylinderGeometry args={[0.032, 0.032, 0.38, 12]} />
            <meshStandardMaterial color="#facc15" roughness={0.4} />
          </mesh>
          <mesh castShadow>
            <boxGeometry args={[3.6, 1.15, 0.08]} />
            <meshStandardMaterial color="#050507" roughness={0.4} />
          </mesh>
          <Text position={[0, 0.26, 0.052]} fontSize={0.22} color="#ef4444" anchorX="center" anchorY="middle" toneMapped={false}>
            CAMINHO SEGURO TEM QUE
          </Text>
          <Text position={[0, 0, 0.052]} fontSize={0.22} color="#ef4444" anchorX="center" anchorY="middle" toneMapped={false}>
            SER BLOQUEADO PELO
          </Text>
          <Text position={[0, -0.26, 0.052]} fontSize={0.22} color="#ef4444" anchorX="center" anchorY="middle" toneMapped={false}>
            AUXILIAR
          </Text>
        </group>
      </group>

      {/* ========================================================= */}
      {/* GALPÃO AZUL DA OFICINA CENTRAL NO FUNDO (z = -49)         */}
      {/* ========================================================= */}
      <group position={[0.4, 0, -50]}>
        {/* Estrutura principal azul da Oficina Central */}
        <mesh position={[0, 3.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[18.8, 7.2, 5.5]} />
          <meshStandardMaterial color="#1d4ed8" metalness={0.35} roughness={0.55} />
        </mesh>
        {/* Telhado industrial dente-de-serra (Sawtooth Factory Roof) */}
        {[-7.2, -3.6, 0, 3.6, 7.2].map((rx, idx) => (
          <mesh key={`roof-${idx}`} position={[rx, 7.55, 0]} rotation={[0, 0, 0.25]} castShadow>
            <boxGeometry args={[3.5, 0.95, 5.4]} />
            <meshStandardMaterial color="#2563eb" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
        {/* Portões de entrada das linhas L-160 a L-165 */}
        {[-6.8, -4.0, -1.2, 2.0, 4.8, 7.6].map((tx, idx) => (
          <mesh key={`bay-${idx}`} position={[tx - 0.4, 2.1, 2.78]}>
            <boxGeometry args={[2.1, 4.2, 0.08]} />
            <meshStandardMaterial color="#090d16" roughness={0.8} />
          </mesh>
        ))}
        {/* Duas torres metálicas industriais ao fundo como na foto */}
        {[-5.2, -1.2].map((twX, idx) => (
          <mesh key={`tower-${idx}`} position={[twX, 6.2, -3.5]} castShadow>
            <boxGeometry args={[1.6, 12.4, 1.6]} />
            <meshStandardMaterial color="#64748b" metalness={0.65} roughness={0.4} />
          </mesh>
        ))}
      </group>

      {/* ========================================================= */}
      {/* 4 AMVs INTERATIVOS (GRUPO CENTRAL + GRUPO DIREITO)        */}
      {/* ========================================================= */}
      {/* AMV 1 (z = 25, x = -1.2: Reta L-162 / Reversa L-161 e L-160) */}
      <group
        position={[-1.2, 0, 25]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[amv1RightHingeX, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={true} />
        <Text position={[-3.2, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.2} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1
        </Text>
      </group>
      <FrogInfo x={-2.0} z={14} />

      {/* AMV 2 (z = 5, x = -4.0: Reta L-161 / Reversa L-160) */}
      <group
        position={[-4.0, 0, 5]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[-0.8, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[amv2RightHingeX, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={true} />
        <Text position={[-3.2, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.2} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2
        </Text>
      </group>
      <FrogInfo x={-4.8} z={-6} />

      {/* AMV 3 (z = 25, x = 7.6: Reta L-165 / Reversa L-164 e L-163 - Macaquinho na direita como na foto) */}
      <group
        position={[7.6, 0, 25]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(2); onToggleAmv(2); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={2} hinge={[-0.8, 0, -5]} tipTargetX={getTips3().left} tipZ={0} />
        <AnimatedPoint amvIndex={2} hinge={[amv3RightHingeX, 0, -5]} tipTargetX={getTips3().right} tipZ={0} />
        <TieBar amvIndex={2} getLeftTipX={() => getTips3().left} getRightTipX={() => getTips3().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips3().left} tipZ={0} isLeftSide={false} />
        <Text position={[3.2, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.2} color={selectedAmv === 2 ? "#818cf8" : "#64748b"}>
          AMV 3
        </Text>
      </group>
      <FrogInfo x={6.8} z={14} />

      {/* AMV 4 (z = 5, x = 4.8: Reta L-164 / Reversa L-163) */}
      <group
        position={[4.8, 0, 5]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(3); onToggleAmv(3); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={3} hinge={[-0.8, 0, -5]} tipTargetX={getTips4().left} tipZ={0} />
        <AnimatedPoint amvIndex={3} hinge={[amv4RightHingeX, 0, -5]} tipTargetX={getTips4().right} tipZ={0} />
        <TieBar amvIndex={3} getLeftTipX={() => getTips4().left} getRightTipX={() => getTips4().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips4().left} tipZ={0} isLeftSide={true} />
        <Text position={[-2.9, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.2} color={selectedAmv === 3 ? "#818cf8" : "#64748b"}>
          AMV 4
        </Text>
      </group>
      <FrogInfo x={4.0} z={-6} />

      {/* ========================================================= */}
      {/* PLACAS DE IDENTIFICAÇÃO DENTRO DAS 7 LINHAS (ALTA LEGIBILIDADE) */}
      {/* ========================================================= */}
      {[
        { label: 'L-158', badge: '5KM', getX: getOficinaCentralTrack158X, z: -26 },
        { label: 'L-160', getX: getOficinaCentralTrack160X, z: -26 },
        { label: 'L-161', getX: getOficinaCentralTrack161X, z: -26 },
        { label: 'L-162', getX: getOficinaCentralTrack162X, z: -26 },
        { label: 'L-163', getX: getOficinaCentralTrack163X, z: -26 },
        { label: 'L-164', getX: getOficinaCentralTrack164X, z: -26 },
        { label: 'L-165', getX: getOficinaCentralTrack165X, z: -26 },
      ].map((plate) => {
        const px = plate.getX(plate.z);
        const rotY = Math.atan2(plate.getX(plate.z + 0.5) - plate.getX(plate.z - 0.5), 1.0);
        return (
          <TrackLinePlate
            key={plate.label}
            label={plate.label}
            badge={plate.badge}
            x={px}
            z={plate.z}
            rotY={rotY}
          />
        );
      })}
    </group>
  );
}

function AbaixoOficinaAmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  // AMV 1 (z = 26, x = 1.6) - Left-branching turnout: Reta L-162 / Reversa L-163
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  // AMV 2 (z = 12, x = 1.6) - Right-branching turnout: Reta L-162 / Reversa puxada em curva à direita da L-173
  const getTips2 = () => {
    if (amvs[1] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[1] === 'REVERSO') return { left: -0.8, right: 0.5 };
    return { left: -0.5, right: 0.8 };
  };

  // AMV 3 (z = -21, x = -10.6) - Conecta L-165 e L-166
  const getTips3 = () => {
    if (amvs[2] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[2] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  // AMV 4 (z = 0, sobre a L-173) - Left-branching turnout: Reta segue na L-173 / Reversa curva à esquerda para L-161
  const getTips4 = () => {
    const a4 = amvs[3] || 'NORMAL';
    if (a4 === 'FALHA') return { left: -0.65, right: 0.65 };
    if (a4 === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  // AMV 5 (z = 6, x = -1.2) - Left-branching turnout on L-163: Reta L-163 / Reversa L-164
  const getTips5 = () => {
    const a5 = amvs[4] || 'NORMAL';
    if (a5 === 'FALHA') return { left: -0.65, right: 0.65 };
    if (a5 === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  // AMV 6 (z = -13, sobre a L-173) - Left-branching turnout: Reta segue na L-173 / Reversa curva à esquerda para L-160
  const getTips6 = () => {
    const a6 = amvs[5] || 'NORMAL';
    if (a6 === 'FALHA') return { left: -0.65, right: 0.65 };
    if (a6 === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  const amv4X = getAbaixoOficinaTrack173X(0);
  const amv6X = getAbaixoOficinaTrack173X(-13);

  const amv1RightHingeX = (getAbaixoOficinaTrack163X(21) - 1.6) + 0.8;
  const amv2LeftHingeX = (getAbaixoOficinaTrack173X(9) - 1.6) - 0.8;
  const amv3LeftHingeX = (getAbaixoOficinaTrack165X(-16) - (-10.6)) - 0.8;
  const amv4LeftHingeX = (getAbaixoOficinaTrack173X(-5) - amv4X) - 0.8;
  const amv4RightHingeX = (getAbaixoOficinaTrack161X(-5) - amv4X) + 0.8;
  const amv5RightHingeX = (getAbaixoOficinaTrack164X(1) - (-1.2)) + 0.8;
  const amv6LeftHingeX = (getAbaixoOficinaTrack173X(-18) - amv6X) - 0.8;
  const amv6RightHingeX = (getAbaixoOficinaTrack160X(-18) - amv6X) + 0.8;

  return (
    <group>
      <Sleepers layoutType="abaixo_oficina" />
      <CurveBranch layoutType="abaixo_oficina" />

      {/* ========================================================= */}
      {/* 1. COBERTURA LATERAL AZUL ESQUERDA, GUARDA-CORPOS AMARELOS */}
      {/*    E LOCOMOTIVA MARROM/AMARELA 2012 ESTACIONADA NA L-166   */}
      {/*    (Terminando na marcação vermelha logo após a placa L-166) */}
      {/* ========================================================= */}
      <group position={[-13.2, 0, 2]}>
        {/* Piso de concreto da plataforma de manutenção lateral (de zLocal = -7.5 até +27.5) */}
        <mesh position={[-0.4, 0.16, 10]} receiveShadow castShadow>
          <boxGeometry args={[3.2, 0.32, 35]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.85} />
        </mesh>

        {/* Colunas metálicas verdes/cinzas sustentando a cobertura azul até o limite marcado */}
        {[-6, 2, 10, 18, 25].map((cz, idx) => (
          <group key={`canopy-col-${idx}`} position={[0.85, 0, cz]}>
            <mesh position={[0, 2.35, 0]} castShadow>
              <boxGeometry args={[0.18, 4.7, 0.18]} />
              <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
            </mesh>
            {/* Mão-francesa diagonal superior */}
            <mesh position={[0.45, 4.2, 0]} rotation={[0, 0, -0.55]} castShadow>
              <boxGeometry args={[0.1, 1.3, 0.1]} />
              <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
            </mesh>
          </group>
        ))}

        {/* Telhado inclinado azul vibrante cobrindo a plataforma até a marcação vermelha */}
        <mesh position={[0.6, 4.85, 10]} rotation={[0, 0, -0.18]} castShadow receiveShadow>
          <boxGeometry args={[5.4, 0.22, 35.5]} />
          <meshStandardMaterial color="#2563eb" metalness={0.35} roughness={0.45} />
        </mesh>
        {/* Friso lateral azul-claro da cobertura */}
        <mesh position={[3.22, 4.35, 10]} castShadow>
          <boxGeometry args={[0.12, 0.38, 35.6]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.3} roughness={0.4} />
        </mesh>

        {/* Guarda-corpos tubulares amarelos de segurança ao longo da plataforma */}
        {[-6, 0, 6, 12, 18, 23].map((gz, idx) => (
          <group key={`guardrail-${idx}`} position={[1.02, 0.32, gz]}>
            {/* Colunetas verticais amarelas */}
            {[-1.1, 0, 1.1].map((dz, pIdx) => (
              <mesh key={`gp-${pIdx}`} position={[0, 0.55, dz]} castShadow>
                <cylinderGeometry args={[0.04, 0.04, 1.1, 8]} />
                <meshStandardMaterial color="#facc15" metalness={0.4} roughness={0.3} />
              </mesh>
            ))}
            {/* Travessas horizontais superiores e intermediárias amarelas */}
            <mesh position={[0, 1.05, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, 2.3, 8]} />
              <meshStandardMaterial color="#facc15" metalness={0.4} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.58, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, 2.3, 8]} />
              <meshStandardMaterial color="#facc15" metalness={0.4} roughness={0.3} />
            </mesh>
          </group>
        ))}

        {/* Locomotiva 3D estacionada sob a cobertura azul na L-166 */}
        <Locomotive3D position={[2.6, 0.075, 16]} rotation={[0, Math.PI, 0]} headlightsOff={true} />
      </group>

      {/* ========================================================= */}
      {/* 2. DETALHES FIÉIS DO PRIMEIRO PLANO (PLACA MARROM E BALIZA */}
      {/*    AMARELA NO ENTREVIA ENTRE OS DOIS TRONCOS PRINCIPAIS)   */}
      {/* ========================================================= */}
      {/* Placa metálica marrom baixa no lastro (visível no centro-baixo da foto) */}
      <group position={[-1.35, 0, 22.5]} rotation={[0, 0.08, 0]}>
        <mesh position={[0, 0.155, 0]} castShadow>
          <cylinderGeometry args={[0.028, 0.028, 0.31, 10]} />
          <meshStandardMaterial color="#451a03" metalness={0.7} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.52, 0]} castShadow>
          <boxGeometry args={[0.58, 0.42, 0.06]} />
          <meshStandardMaterial color="#5c2d16" metalness={0.5} roughness={0.7} />
        </mesh>
      </group>

      {/* Pequena baliza/marco amarelo arredondado no entrevia (z = 15.5) */}
      <group position={[-1.2, 0, 15.5]}>
        <mesh position={[0, 0.14, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.28, 10]} />
          <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.3, 0]} castShadow>
          <sphereGeometry args={[0.14, 16, 12]} />
          <meshStandardMaterial color="#facc15" roughness={0.35} />
        </mesh>
      </group>

      {/* ========================================================= */}
      {/* 3A. GALPÃO ABERTO INTERMEDIÁRIO (DA L-165 À L-160)        */}
      {/*     Mais à frente (z = -21.5), sentido contrário ao       */}
      {/*     galpão fechado, com vigas todas no CENTRO             */}
      {/* ========================================================= */}
      <group position={[0.2, 0, -21.5]}>
        {/* Eixo central de colunas/vigas metálicas no entrevia central (x local = 0 -> x global = 0.2, entre L-163 e L-162) */}
        {[-5.5, -1.8, 1.8, 5.5].map((cz, idx) => (
          <group key={`center-pillar-${idx}`} position={[0, 0, cz]}>
            {/* Base de concreto central */}
            <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.72, 0.7, 0.72]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.85} />
            </mesh>
            {/* Viga H central dupla de sustentação principal */}
            <mesh position={[-0.18, 3.0, 0]} castShadow>
              <boxGeometry args={[0.22, 5.4, 0.26]} />
              <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.35} />
            </mesh>
            <mesh position={[0.18, 3.0, 0]} castShadow>
              <boxGeometry args={[0.22, 5.4, 0.26]} />
              <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.35} />
            </mesh>
            {/* Travessas horizontais de ligação da coluna central */}
            {[1.6, 2.9, 4.2].map((hy, hIdx) => (
              <mesh key={`h-tie-${hIdx}`} position={[0, hy, 0]} castShadow>
                <boxGeometry args={[0.52, 0.14, 0.2]} />
                <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
              </mesh>
            ))}

            {/* Mãos-francesas / braços diagonais em V partindo do centro para sustentar o grande vão sem colunas laterais */}
            <mesh position={[-1.95, 4.4, 0]} rotation={[0, 0, 0.92]} castShadow>
              <boxGeometry args={[0.16, 4.2, 0.18]} />
              <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[1.95, 4.4, 0]} rotation={[0, 0, -0.92]} castShadow>
              <boxGeometry args={[0.16, 4.2, 0.18]} />
              <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
            </mesh>
            {/* Braços secundários de longo alcance em balanço até L-165 e L-160 */}
            <mesh position={[-3.8, 4.9, 0]} rotation={[0, 0, 1.18]} castShadow>
              <boxGeometry args={[0.13, 5.8, 0.15]} />
              <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[3.8, 4.9, 0]} rotation={[0, 0, -1.18]} castShadow>
              <boxGeometry args={[0.13, 5.8, 0.15]} />
              <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
            </mesh>

            {/* Viga mestra transversal em balanço (cobrindo de L-165 a L-160 livre de apoios laterais) */}
            <mesh position={[0, 5.7, 0]} castShadow>
              <boxGeometry args={[16.4, 0.28, 0.24]} />
              <meshStandardMaterial color="#1e293b" metalness={0.75} roughness={0.35} />
            </mesh>
          </group>
        ))}

        {/* Viga longitudinal central superior unindo todos os pilares centrais */}
        <mesh position={[0, 5.5, 0]} castShadow>
          <boxGeometry args={[0.55, 0.35, 12.6]} />
          <meshStandardMaterial color="#1e293b" metalness={0.75} roughness={0.35} />
        </mesh>

        {/* Terças longitudinais da cobertura em balanço (sobre L-165, L-164, L-163, L-162, L-161, L-160) */}
        {[-7.6, -5.0, -2.5, 2.5, 5.0, 7.6].map((px, idx) => (
          <mesh key={`purlin-${idx}`} position={[px, 5.8, 0]} castShadow>
            <boxGeometry args={[0.16, 0.18, 12.8]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
          </mesh>
        ))}

        {/* Telhado metálico em duas águas sustentado pelo centro (da L-165 à L-160) */}
        <mesh position={[-4.15, 6.3, 0]} rotation={[0, 0, 0.11]} castShadow receiveShadow>
          <boxGeometry args={[8.4, 0.24, 13.0]} />
          <meshStandardMaterial color="#0f766e" metalness={0.45} roughness={0.45} />
        </mesh>
        <mesh position={[4.15, 6.3, 0]} rotation={[0, 0, -0.11]} castShadow receiveShadow>
          <boxGeometry args={[8.4, 0.24, 13.0]} />
          <meshStandardMaterial color="#0f766e" metalness={0.45} roughness={0.45} />
        </mesh>

        {/* Platibanda/Friso frontal fino na borda do telhado (deixando todo o vão inferior aberto para ver o galpão de trás) */}
        <mesh position={[-4.15, 6.23, 6.52]} rotation={[0, 0, 0.11]}>
          <boxGeometry args={[8.42, 0.36, 0.1]} />
          <meshStandardMaterial color="#1e293b" metalness={0.65} roughness={0.4} />
        </mesh>
        <mesh position={[4.15, 6.23, 6.52]} rotation={[0, 0, -0.11]}>
          <boxGeometry args={[8.42, 0.36, 0.1]} />
          <meshStandardMaterial color="#1e293b" metalness={0.65} roughness={0.4} />
        </mesh>
      </group>

      {/* ========================================================= */}
      {/* 3B. GRANDE GALPÃO DA OFICINA CENTRAL AO FUNDO (z = -52.5) */}
      {/*     Visível claramente atrás do galpão de vigas centrais  */}
      {/* ========================================================= */}
      <group position={[0, 0, -52.5]}>
        {/* Bloco esquerdo branco/azul ("MANUTENÇÃO DE LOCOMOTIVAS" sobre L-166 e L-165) */}
        <group position={[-9.0, 0, 0]}>
          <mesh position={[0, 4.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[8.4, 8.4, 6.2]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
          </mesh>
          {/* Platibanda superior azul */}
          <mesh position={[0, 8.55, 0]} castShadow>
            <boxGeometry args={[8.6, 0.7, 6.4]} />
            <meshStandardMaterial color="#1d4ed8" roughness={0.45} />
          </mesh>
          <Text position={[0, 7.1, 3.15]} fontSize={0.34} color="#0f172a" anchorX="center" anchorY="middle">
            MANUTENÇÃO DE LOCOMOTIVAS
          </Text>
          {/* Aberturas das baias L-165 (-1.6 local -> -10.6 global) e L-164 (+2.2 local -> -6.8 global) */}
          {[-1.6, 2.2].map((bx, idx) => (
            <mesh key={`left-bay-${idx}`} position={[bx, 2.2, 3.12]}>
              <boxGeometry args={[2.2, 4.4, 0.08]} />
              <meshStandardMaterial color="#090d16" roughness={0.85} />
            </mesh>
          ))}
          {/* Locomotiva estacionada dentro da baia direita (L-164) do galpão branco */}
          <group position={[2.2, 0.1, 3.6]}>
            <mesh position={[0, 1.2, 0]} castShadow>
              <boxGeometry args={[1.65, 2.15, 3.6]} />
              <meshStandardMaterial color="#78350f" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.72, 1.82]}>
              <boxGeometry args={[1.63, 0.55, 0.05]} />
              <meshStandardMaterial color="#facc15" roughness={0.35} />
            </mesh>
          </group>
        </group>

        {/* Grande Galpão Metálico Principal ao Fundo (cobrindo L-163, L-162, L-161, L-160) */}
        <group position={[1.8, 0, 0]}>
          <mesh position={[0, 4.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[13.6, 9.0, 6.5]} />
            <meshStandardMaterial color="#1e293b" metalness={0.45} roughness={0.55} />
          </mesh>
          {/* Cobertura metálica inclinada verde-petróleo/azul-escuro de grande vão */}
          <mesh position={[-3.4, 9.55, 0]} rotation={[0, 0, 0.16]} castShadow>
            <boxGeometry args={[7.1, 0.45, 6.9]} />
            <meshStandardMaterial color="#0f766e" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[3.4, 9.55, 0]} rotation={[0, 0, -0.16]} castShadow>
            <boxGeometry args={[7.1, 0.45, 6.9]} />
            <meshStandardMaterial color="#0f766e" metalness={0.4} roughness={0.5} />
          </mesh>
          {/* Treliça frontal metálica acima das baias */}
          <mesh position={[0, 7.8, 3.28]}>
            <boxGeometry args={[13.4, 1.45, 0.12]} />
            <meshStandardMaterial color="#334155" metalness={0.65} roughness={0.4} />
          </mesh>
          <Text position={[0, 7.8, 3.38]} fontSize={0.48} color="#facc15" anchorX="center" anchorY="middle" toneMapped={false}>
            GALPÃO OFICINA CENTRAL
          </Text>
          {/* Baias escuras das linhas L-163 (-3.0), L-162 (-0.2), L-161 (+2.6), L-160 (+5.4) visíveis por baixo do galpão central */}
          {[-3.0, -0.2, 2.6, 5.4].map((bx, idx) => (
            <mesh key={`main-bay-${idx}`} position={[bx, 2.3, 3.27]}>
              <boxGeometry args={[2.15, 4.6, 0.08]} />
              <meshStandardMaterial color="#090d16" roughness={0.85} />
            </mesh>
          ))}
        </group>
      </group>

      {/* ========================================================= */}
      {/* 4. PRÉDIO DE APOIO À DIREITA E PLACA "5KM ABAIXO DA PN"   */}
      {/* ========================================================= */}
      <group position={[14.2, 0, -14]}>
        <mesh position={[0, 2.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.6, 4.8, 12.5]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.65} />
        </mesh>
        <mesh position={[0, 4.95, 0]} castShadow>
          <boxGeometry args={[3.8, 0.38, 12.8]} />
          <meshStandardMaterial color="#0284c7" roughness={0.45} />
        </mesh>
        {[-4, -1.5, 1.5, 4].map((wz, idx) => (
          <mesh key={`r-win-${idx}`} position={[-1.82, 2.8, wz]}>
            <boxGeometry args={[0.05, 0.85, 1.4]} />
            <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />
          </mesh>
        ))}
      </group>

      {/* Placa amarela "5KM ABAIXO DA PN" ao lado da L-173 */}
      <group position={[12.4, 1.15, 8]} rotation={[0, -0.22, 0]}>
        {/* Base de fixação no solo */}
        <mesh position={[0, -1.12, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.36, 0.06, 0.24]} />
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.5} />
        </mesh>
        {/* Mastro vertical (termina exatamente na borda inferior da placa em y = -0.41 sem atravessar a chapa/texto) */}
        <mesh position={[0, -0.78, 0]} castShadow>
          <cylinderGeometry args={[0.032, 0.032, 0.74, 12]} />
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh castShadow>
          <boxGeometry args={[2.9, 0.82, 0.08]} />
          <meshBasicMaterial color="#facc15" toneMapped={false} />
        </mesh>
        <Text position={[0, 0.15, 0.052]} fontSize={0.25} color="#000000" anchorX="center" anchorY="middle" toneMapped={false}>
          5KM ABAIXO
        </Text>
        <Text position={[0, -0.15, 0.052]} fontSize={0.25} color="#000000" anchorX="center" anchorY="middle" toneMapped={false}>
          DA PN (L-173)
        </Text>
        <Text position={[0, 0.15, -0.052]} rotation={[0, Math.PI, 0]} fontSize={0.25} color="#000000" anchorX="center" anchorY="middle" toneMapped={false}>
          5KM ABAIXO
        </Text>
        <Text position={[0, -0.15, -0.052]} rotation={[0, Math.PI, 0]} fontSize={0.25} color="#000000" anchorX="center" anchorY="middle" toneMapped={false}>
          DA PN (L-173)
        </Text>
      </group>

      {/* ========================================================= */}
      {/* 5. OS 4 AMVs INTERATIVOS FIÉIS À FOTO                     */}
      {/* ========================================================= */}
      {/* AMV 1 (Primeiro plano na direita: z = 26, x = 1.6 -> Reta L-162 / Reversa à esquerda L-163) */}
      <group
        position={[1.6, 0, 26]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[amv1RightHingeX, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={false} isReverse={amvs[0] !== 'NORMAL'} />
        <Text position={[3.2, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.15} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1 (163/162)
        </Text>
      </group>
      <FrogInfo x={0.8} z={15} />

      {/* AMV 2 (z = 14, x = 1.6 -> Reta L-162 / Reversa grande puxada em curva à direita da L-173) */}
      <group
        position={[1.6, 0, 14]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[amv2LeftHingeX, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[0.8, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={false} isReverse={amvs[1] !== 'NORMAL'} />
        <Text position={[3.2, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.1} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2 (162/173)
        </Text>
      </group>
      <FrogInfo x={2.4} z={5.5} />

      {/* AMV 3 (Conecta a L-166 e a L-165 na posição marcada em amarelo: z = -21, x = -10.6) */}
      <group
        position={[-10.6, 0, -21]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(2); onToggleAmv(2); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={2} hinge={[amv3LeftHingeX, 0, 5]} tipTargetX={getTips3().left} tipZ={0} />
        <AnimatedPoint amvIndex={2} hinge={[0.8, 0, 5]} tipTargetX={getTips3().right} tipZ={0} />
        <TieBar amvIndex={2} getLeftTipX={() => getTips3().left} getRightTipX={() => getTips3().right} tipZ={0} ringOffsetZ={2.85} />
        <SwitchMachine getLeftTipX={() => getTips3().left} tipZ={0} isLeftSide={false} offsetX={1.85} isReverse={amvs[2] !== 'NORMAL'} />
        <Text position={[2.8, 0.1, 2.5]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.05} color={selectedAmv === 2 ? "#818cf8" : "#64748b"}>
          AMV 3 (165/166)
        </Text>
      </group>
      <FrogInfo x={-9.8} z={-12} />

      {/* AMV 4 (Sobre a puxada da L-173 em z = 0: Reta segue L-173 / Reversa curva à esquerda para L-161) */}
      <group
        position={[amv4X, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(3); onToggleAmv(3); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={3} hinge={[amv4LeftHingeX, 0, -5]} tipTargetX={getTips4().left} tipZ={0} />
        <AnimatedPoint amvIndex={3} hinge={[amv4RightHingeX, 0, -5]} tipTargetX={getTips4().right} tipZ={0} />
        <TieBar amvIndex={3} getLeftTipX={() => getTips4().left} getRightTipX={() => getTips4().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips4().left} tipZ={0} isLeftSide={false} isReverse={(amvs[3] || 'NORMAL') !== 'NORMAL'} />
        <Text position={[3.2, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.05} color={selectedAmv === 3 ? "#818cf8" : "#64748b"}>
          AMV 4 (161/173)
        </Text>
      </group>
      <FrogInfo x={getAbaixoOficinaTrack161X(-8.2) + 0.8} z={-8.2} />

      {/* AMV 5 (Na marcação vermelha sobre a L-163: z = 6, x = -1.2 -> Reta L-163 / Reversa à esquerda L-164) */}
      <group
        position={[-1.2, 0, 6]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(4); onToggleAmv(4); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={4} hinge={[-0.8, 0, -5]} tipTargetX={getTips5().left} tipZ={0} />
        <AnimatedPoint amvIndex={4} hinge={[amv5RightHingeX, 0, -5]} tipTargetX={getTips5().right} tipZ={0} />
        <TieBar amvIndex={4} getLeftTipX={() => getTips5().left} getRightTipX={() => getTips5().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips5().left} tipZ={0} isLeftSide={true} isReverse={(amvs[4] || 'NORMAL') !== 'NORMAL'} />
        <Text position={[-2.9, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.05} color={selectedAmv === 4 ? "#818cf8" : "#64748b"}>
          AMV 5 (164/163)
        </Text>
      </group>
      <FrogInfo x={-2.0} z={-3} />

      {/* AMV 6 (Sobre a puxada da L-173 em z = -13: Reta segue L-173 / Reversa curva à esquerda para L-160) */}
      <group
        position={[amv6X, 0, -13]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(5); onToggleAmv(5); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={5} hinge={[amv6LeftHingeX, 0, -5]} tipTargetX={getTips6().left} tipZ={0} />
        <AnimatedPoint amvIndex={5} hinge={[amv6RightHingeX, 0, -5]} tipTargetX={getTips6().right} tipZ={0} />
        <TieBar amvIndex={5} getLeftTipX={() => getTips6().left} getRightTipX={() => getTips6().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips6().left} tipZ={0} isLeftSide={false} isReverse={(amvs[5] || 'NORMAL') !== 'NORMAL'} />
        <Text position={[3.2, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.05} color={selectedAmv === 5 ? "#818cf8" : "#64748b"}>
          AMV 6 (160/173)
        </Text>
      </group>
      <FrogInfo x={getAbaixoOficinaTrack160X(-21.5) + 0.8} z={-21.5} />

      {/* ========================================================= */}
      {/* 6. PLACAS DE IDENTIFICAÇÃO DAS 8 LINHAS (L-166 A L-173)   */}
      {/* ========================================================= */}
      {[
        { label: 'L-166', getX: getAbaixoOficinaTrack166X, z: -4 },
        { label: 'L-165', getX: getAbaixoOficinaTrack165X, z: -36 },
        { label: 'L-164', getX: getAbaixoOficinaTrack164X, z: -36 },
        { label: 'L-163', getX: getAbaixoOficinaTrack163X, z: -36 },
        { label: 'L-162', getX: getAbaixoOficinaTrack162X, z: -36 },
        { label: 'L-161', getX: getAbaixoOficinaTrack161X, z: -36 },
        { label: 'L-160', getX: getAbaixoOficinaTrack160X, z: -36 },
        { label: 'L-173', badge: '5KM', getX: getAbaixoOficinaTrack173X, z: -36 },
      ].map((plate) => {
        const px = plate.getX(plate.z);
        const rotY = Math.atan2(plate.getX(plate.z + 0.5) - plate.getX(plate.z - 0.5), 1.0);
        return (
          <TrackLinePlate
            key={plate.label}
            label={plate.label}
            badge={plate.badge}
            x={px}
            z={plate.z}
            rotY={rotY}
          />
        );
      })}
    </group>
  );
}

function Reclassificacao02AmvScene({ amvs, selectedAmv, onSelectAmv, onToggleAmv }: any) {
  // AMV 1 (z = 15, x = 0): Reta L-109A -> L-121 / Reversa à esquerda pelo travessão para L-109
  const getTips1 = () => {
    if (amvs[0] === 'FALHA') return { left: -0.65, right: 0.65 };
    if (amvs[0] === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  // AMV 2 (z = -5, x = -3.8): Convergência na L-109 (Reta Ramo Esquerdo L-109 / Reversa Travessão vindo do AMV 1)
  const getTips2 = () => {
    const a2 = amvs[1] || 'NORMAL';
    if (a2 === 'FALHA') return { left: -0.65, right: 0.65 };
    if (a2 === 'REVERSO') return { left: -0.8, right: 0.5 };
    return { left: -0.5, right: 0.8 };
  };

  // AMV 3 (z = -15, x = 0): Desvio superior (Reta L-121 / Reversa à esquerda para L-122)
  const getTips3 = () => {
    const a3 = amvs[2] || 'NORMAL';
    if (a3 === 'FALHA') return { left: -0.65, right: 0.65 };
    if (a3 === 'REVERSO') return { left: -0.5, right: 0.8 };
    return { left: -0.8, right: 0.5 };
  };

  // Coordenadas exatas dos calcanhares (hinges) das 3 agulhas de 5m conectadas perfeitamente aos trilhos (±0.405):
  const amv1RightHingeX = getReclassificacao02Crossover109X(12) + 0.8;
  const amv2LeftHingeX = (getReclassificacao02Crossover109X(-3) - (-3.8)) - 0.8;
  const amv3RightHingeX = getReclassificacao02UpperBranch122X(-20) + 0.8;

  return (
    <group>
      <Sleepers layoutType="reclassificacao_02" />
      <CurveBranch layoutType="reclassificacao_02" />

      {/* ========================================================= */}
      {/* 1. GALPÃO INDUSTRIAL AO FUNDO (z = -50) COMO NA FOTO      */}
      {/* ========================================================= */}
      <group position={[-1.9, 0, -50]}>
        {/* Estrutura principal cinza-clara com baias abertas no térreo */}
        <mesh position={[0, 3.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[14.5, 6.8, 5.4]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.65} />
        </mesh>
        {/* Faixa superior azul-turquesa característica do galpão na foto */}
        <mesh position={[0, 5.2, 2.72]}>
          <boxGeometry args={[14.52, 1.85, 0.08]} />
          <meshStandardMaterial color="#06b6d4" roughness={0.45} />
        </mesh>
        {/* Telhado bege/terracota superior */}
        <mesh position={[0, 7.1, 0]} castShadow>
          <boxGeometry args={[15.0, 0.75, 5.8]} />
          <meshStandardMaterial color="#d6b598" roughness={0.6} />
        </mesh>
        {/* 3 Baias escuras de acesso alinhadas às 3 linhas: L-109 (x=-3.8), L-122 (x=-1.9), L-121 (x=0) */}
        {[-1.9, 0, 1.9].map((bx, idx) => (
          <mesh key={`rec2-bay-${idx}`} position={[bx, 2.1, 2.72]}>
            <boxGeometry args={[1.55, 4.2, 0.08]} />
            <meshStandardMaterial color="#090d16" roughness={0.85} />
          </mesh>
        ))}
      </group>

      {/* ========================================================= */}
      {/* 2. VIA ASFALTADA, TORRE DE ILUMINAÇÃO E REBOQUE AMARELO   */}
      {/*    NA LATERAL DIREITA (COMO NA FOTO)                      */}
      {/* ========================================================= */}
      {/* Estrada interna asfaltada à direita da L-121 */}
      <mesh position={[6.2, 0.01, -4]} rotation={[-Math.PI / 2, 0, -0.05]} receiveShadow>
        <planeGeometry args={[4.4, 85]} />
        <meshStandardMaterial color="#64748b" roughness={0.85} />
      </mesh>
      {/* Meio-fio branco ao longo da estrada */}
      <mesh position={[4.0, 0.06, -4]} rotation={[0, -0.05, 0]}>
        <boxGeometry args={[0.16, 0.12, 85]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.7} />
      </mesh>

      {/* Reboque / Rampa metálica amarela estacionada à direita (z = -8, x = 2.9) visível na foto */}
      <group position={[2.9, 0.05, -8]} rotation={[0, 0.25, 0]}>
        <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.65, 0.52, 2.5]} />
          <meshStandardMaterial color="#eab308" metalness={0.4} roughness={0.4} />
        </mesh>
        {/* Rampa superior inclinada */}
        <mesh position={[0, 0.72, 0.1]} rotation={[0.24, 0, 0]} castShadow>
          <boxGeometry args={[1.68, 0.10, 2.7]} />
          <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.45} />
        </mesh>
        {/* Rodas do reboque */}
        {[-0.85, 0.85].map((wx, idx) => (
          <mesh key={`trl-w-${idx}`} position={[wx, 0.22, -0.3]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.22, 0.22, 0.16, 14]} />
            <meshStandardMaterial color="#0f172a" roughness={0.8} />
          </mesh>
        ))}
      </group>

      {/* Postes metálicos e de concreto na lateral direita */}
      {[-32, -16, 0, 16].map((pz, idx) => (
        <group key={`pole-r-${idx}`} position={[3.5, 0, pz]}>
          <mesh position={[0, 3.8, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.13, 7.6, 10]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 7.5, 0]}>
            <boxGeometry args={[0.9, 0.12, 0.12]} />
            <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* ========================================================= */}
      {/* 3. MARCOS AMARELOS DE ENTREVIA E BANDEIROLAS DA FOTO      */}
      {/* ========================================================= */}
      {/* 1º Marco amarelo de entrevia à esquerda entre L-109 e L-109A (z = 6.5) */}
      <group position={[-2.3, 0, 6.5]}>
        <mesh position={[0, 0.16, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.32, 10]} />
          <meshStandardMaterial color="#eab308" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.34, 0]} castShadow>
          <sphereGeometry args={[0.11, 14, 10]} />
          <meshStandardMaterial color="#facc15" roughness={0.35} />
        </mesh>
      </group>

      {/* 2º Marco amarelo de entrevia mais ao fundo entre L-109 e L-122 (z = -18.5) */}
      <group position={[-1.9, 0, -18.5]}>
        <mesh position={[0, 0.16, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.32, 10]} />
          <meshStandardMaterial color="#eab308" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.34, 0]} castShadow>
          <sphereGeometry args={[0.11, 14, 10]} />
          <meshStandardMaterial color="#facc15" roughness={0.35} />
        </mesh>
      </group>

      {/* ========================================================= */}
      {/* 4. OS 3 AMVs INTERATIVOS COM PONTAS DE LANÇA AJUSTADAS    */}
      {/* ========================================================= */}
      {/* AMV 1 (z = 17, x = 0: Reta L-109A -> L-121 / Reversa à esquerda pelo travessão para L-109) */}
      <group
        position={[0, 0, 17]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={0} hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint amvIndex={0} hinge={[amv1RightHingeX, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar amvIndex={0} getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={true} isReverse={amvs[0] !== 'NORMAL'} />
        <Text position={[-3.2, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.1} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1 (109A/109)
        </Text>
      </group>
      <FrogInfo x={-0.8} z={6.0} />

      {/* AMV 2 (z = -8, x = -3.8: Convergência na L-109 abaixo da seta L-109) */}
      <group
        position={[-3.8, 0, -8]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={1} hinge={[amv2LeftHingeX, 0, 5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint amvIndex={1} hinge={[0.8, 0, 5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar amvIndex={1} getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} ringOffsetZ={2.5} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={true} offsetX={-1.85} isReverse={(amvs[1] || 'NORMAL') !== 'NORMAL'} />
        <Text position={[-3.0, 0.1, 2.5]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.05} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2 (L-109)
        </Text>
      </group>
      <FrogInfo x={-3.0} z={3.0} />

      {/* AMV 3 (z = -15, x = 0: Desvio superior — Reta L-121 / Reversa à esquerda para L-122) */}
      <group
        position={[0, 0, -15]}
        onClick={(e) => { e.stopPropagation(); onSelectAmv(2); onToggleAmv(2); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint amvIndex={2} hinge={[-0.8, 0, -5]} tipTargetX={getTips3().left} tipZ={0} />
        <AnimatedPoint amvIndex={2} hinge={[amv3RightHingeX, 0, -5]} tipTargetX={getTips3().right} tipZ={0} />
        <TieBar amvIndex={2} getLeftTipX={() => getTips3().left} getRightTipX={() => getTips3().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips3().left} tipZ={0} isLeftSide={false} isReverse={(amvs[2] || 'NORMAL') !== 'NORMAL'} />
        <Text position={[3.0, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.05} color={selectedAmv === 2 ? "#818cf8" : "#64748b"}>
          AMV 3 (121/122)
        </Text>
      </group>
      <FrogInfo x={-0.8} z={-25.5} />

      {/* ========================================================= */}
      {/* 5. PLACAS DE IDENTIFICAÇÃO DAS LINHAS (L-109A, 109, 122, 121) */}
      {/* ========================================================= */}
      <TrackLinePlate label="L-109A" x={0} z={30} />
      <TrackLinePlate label="L-109" x={-3.8} z={-38} />
      <TrackLinePlate label="L-122" x={-1.9} z={-38} />
      <TrackLinePlate label="L-121" x={0} z={-38} />
    </group>
  );
}


// ---------------------------------------------------------
// PATHING & VEHICLE COORDINATE MATH FOR PATIO X OFICINA
// ---------------------------------------------------------

function getPatioOficinaTrack1X(z: number) {
  if (z >= 20) return 0;
  if (z <= 0) return 5.0;
  const u = (20 - z) / 20;
  return 5.0 * (3 * u ** 2 - 2 * u ** 3);
}

function getPatioOficinaTrack2X(z: number) {
  if (z >= 0) return 0;
  if (z <= -20) return -5.0;
  const u = (0 - z) / 20;
  return -5.0 * (3 * u ** 2 - 2 * u ** 3);
}

function getPatioOficinaTrack3X(z: number) {
  if (z >= -20) return 0;
  if (z <= -40) return -5.0;
  const u = (-20 - z) / 20;
  return -5.0 * (3 * u ** 2 - 2 * u ** 3);
}

export default function AmvSimulation({ systemId, systemName, onClose, inlineMode }: AmvSimulationProps) {
  const [direction, setDirection] = useState<Direction>('NORTE_SUL');
  const [amvs, setAmvs] = useState<SwitchState[]>(['NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'NORMAL']);
  const [spawnLine, setSpawnLine] = useState<SpawnLine>('128');
  const [destLine, setDestLine] = useState<SpawnLine>('128');
  const [selectedAmv, setSelectedAmv] = useState<number>(0);
  const [cameraMode, setCameraMode] = useState<CameraMode>('ISOMETRIC');
  const [isMoving, setIsMoving] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [isAutoLineSelection, setIsAutoLineSelection] = useState(true);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2>(1);
  const [hasWagons, setHasWagons] = useState(true);
  const [hornOnStart, setHornOnStart] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [routeProgress, setRouteProgress] = useState(0);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [plateColors, setPlateColors] = useState<PlateColors>(() => {
    try {
      const savedBg = localStorage.getItem('amv_plate_bg_v2');
      const savedText = localStorage.getItem('amv_plate_text_v2');
      if (savedBg && savedText) {
        return { bg: savedBg, text: savedText };
      }
    } catch (e) {}
    return { bg: '#ff6600', text: '#000000' };
  });
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);

  useBackButtonHandler(isCustomizerOpen, () => setIsCustomizerOpen(false));

  const handleUpdatePlateBg = (bg: string) => {
    setPlateColors(prev => {
      const next = { ...prev, bg };
      try { localStorage.setItem('amv_plate_bg_v2', bg); } catch (e) {}
      return next;
    });
  };

  const handleUpdatePlateText = (text: string) => {
    setPlateColors(prev => {
      const next = { ...prev, text };
      try { localStorage.setItem('amv_plate_text_v2', text); } catch (e) {}
      return next;
    });
  };

  const handleSwapPlateColors = () => {
    setPlateColors(prev => {
      const next = { bg: prev.text, text: prev.bg };
      try {
        localStorage.setItem('amv_plate_bg_v2', next.bg);
        localStorage.setItem('amv_plate_text_v2', next.text);
      } catch (e) {}
      return next;
    });
  };

  const handleSetPlatePreset = (preset: { bg: string; text: string }) => {
    setPlateColors({ bg: preset.bg, text: preset.text });
    try {
      localStorage.setItem('amv_plate_bg_v2', preset.bg);
      localStorage.setItem('amv_plate_text_v2', preset.text);
    } catch (e) {}
  };

  useEffect(() => {
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => setIsCanvasReady(true));
    });
    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
    };
  }, []);

  const baseLayout = systemName?.includes('PIAL X OFICINA') ? 'patio_oficina' : (systemId === 'watchSystem14' || systemName?.includes('ABAIXO DO GALPÃO')) ? 'abaixo_oficina' : (systemId === 'watchSystem12' || systemName?.includes('CIMA DO GALPÃO') || systemName?.includes('OFICINA CENTRAL')) ? 'oficina_central' : (systemId === 'watchSystem13' || systemName?.includes('PASSAGEIRO 02')) ? 'passageiro_02' : (systemId === 'watchSystem11' || systemName?.includes('PASSAGEIRO 01')) ? 'passageiro_01' : (systemId === 'watchSystem15' || systemName?.includes('RECLASSIFICAÇÃO 02')) ? 'reclassificacao_02' : systemId === 'watchSystem9' ? 'pn_oficina' : systemId === 'watchSystem8' ? 'carga_geral_02' : systemId === 'watchSystem7' ? 'reclassificacao' : systemId === 'watchSystem4' ? 'oficina' : (systemId === 'watchSystem5' || systemId === 'watchSystem3') ? 'freio' : 'default';
  const layoutType = baseLayout as LayoutType;

  useEffect(() => {
    if (!isAutoLineSelection) return;
    const amv1 = amvs[0];
    const amv2 = amvs[1];
    const amv3 = amvs[2];
    const amv4 = amvs[3] || 'NORMAL';
    const amv5 = amvs[4] || 'NORMAL';
    const amv6 = amvs[5] || 'NORMAL';
    let expectedLine: SpawnLine = '128';

    if (layoutType === 'abaixo_oficina') {
      if (selectedAmv === 2) {
        expectedLine = amv3 === 'REVERSO' ? '166' : '165';
      } else {
        if (amv1 === 'REVERSO') expectedLine = amv5 === 'REVERSO' ? '164' : '163';
        else if (amv2 === 'NORMAL') expectedLine = '162';
        else if (amv4 === 'REVERSO') expectedLine = '161';
        else if (amv6 === 'REVERSO') expectedLine = '160';
        else expectedLine = '173';
      }
      setSpawnLine(expectedLine);
      setDestLine(expectedLine);
      return;
    } else if (layoutType === 'reclassificacao_02') {
      if (amv1 === 'REVERSO') expectedLine = '109';
      else if (amv3 === 'REVERSO') expectedLine = '122';
      else expectedLine = '121';
      setSpawnLine(expectedLine);
      setDestLine(expectedLine);
      return;
    } else if (layoutType === 'oficina_central') {
      if (selectedAmv >= 2) {
        if (amv3 === 'NORMAL') expectedLine = '165';
        else if (amv4 === 'REVERSO') expectedLine = '163';
        else expectedLine = '164';
      } else {
        if (amv1 === 'NORMAL') expectedLine = '162';
        else if (amv2 === 'REVERSO') expectedLine = '160';
        else expectedLine = '161';
      }
      setSpawnLine(expectedLine);
      setDestLine(expectedLine);
      return;
    } else if (layoutType === 'passageiro_02') {
      if (selectedAmv === 0) {
        expectedLine = amv1 === 'REVERSO' ? 'TP3B' : 'TP2B';
      } else if (selectedAmv === 1) {
        expectedLine = 'TP3B';
      } else {
        if (amv3 === 'NORMAL') expectedLine = 'TP3B';
        else if (amv4 === 'REVERSO') expectedLine = 'TP05';
        else expectedLine = 'TP04';
      }
      setSpawnLine(expectedLine);
      setDestLine(expectedLine);
      return;
    } else if (layoutType === 'passageiro_01') {
      if (amv1 === 'NORMAL') expectedLine = 'TP01';
      else if (amv2 === 'REVERSO') expectedLine = 'TP3A';
      else expectedLine = 'TP2A';
    } else if (layoutType === 'oficina') {
      if (amv1 === 'REVERSO') expectedLine = '167';
      else if (amv2 === 'REVERSO') expectedLine = '166';
      else if (amv3 === 'REVERSO') expectedLine = '165';
      else expectedLine = '152';
    } else if (layoutType === 'pn_oficina') {
      if (amv1 === 'REVERSO') expectedLine = '159';
      else expectedLine = '173';
    } else if (layoutType === 'reclassificacao') {
      if (amv1 === 'NORMAL') expectedLine = '105A';
      else if (amv2 === 'REVERSO') expectedLine = '106A';
      else expectedLine = '107A';
    } else if (layoutType === 'carga_geral_02') {
      if (amv1 === 'REVERSO') expectedLine = '24A';
      else if (amv2 === 'REVERSO') expectedLine = '23A';
      else expectedLine = '22A';
    } else if (layoutType === 'freio') {
      if (amv1 === 'NORMAL') expectedLine = '128';
      else if (amv2 === 'REVERSO') expectedLine = '2';
      else expectedLine = '1';
    }

    if (direction === 'NORTE_SUL') {
      setDestLine(expectedLine);
    } else {
      setSpawnLine(expectedLine);
    }
  }, [amvs, selectedAmv, direction, layoutType, isAutoLineSelection]);

  useEffect(() => {
    if (layoutType === 'oficina_central' || layoutType === 'abaixo_oficina') {
      setSpawnLine('162');
      setDestLine('162');
    } else if (layoutType === 'reclassificacao_02') {
      setSpawnLine('121');
      setDestLine('121');
    } else if (layoutType === 'passageiro_02') {
      setSpawnLine('TP3B');
      setDestLine('TP3B');
    } else if (layoutType === 'passageiro_01') {
      setSpawnLine('TP01');
      setDestLine('TP01');
    } else if (layoutType === 'oficina') {
      setSpawnLine('167');
      setDestLine('167');
    } else if (layoutType === 'pn_oficina') {
      setSpawnLine('173');
      setDestLine('173');
    } else if (layoutType === 'reclassificacao') {
      setSpawnLine('105A');
      setDestLine('105A');
    } else {
      setSpawnLine('128');
      setDestLine('128');
    }
    setAmvs(['NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'NORMAL']);
    setIsMoving(false);
    setResetKey(prev => prev + 1);
  }, [layoutType]);

  const safety = getSafetyStatus(layoutType, direction, amvs, spawnLine, destLine);

  const routePulseRef = useRef(0);
  const hazardContextValue = useMemo(() => {
    routePulseRef.current += 1;
    const statusText = `${safety?.status || ''} ${safety?.desc || ''}`.toUpperCase();
    const isDanger = statusText.includes('PERIGO') || statusText.includes('TALONAMENTO') || statusText.includes('DESCARRILAMENTO') || statusText.includes('COLISÃO') || statusText.includes('CONTRA');
    const isWarning = statusText.includes('ATENÇÃO') || statusText.includes('INCORRETA');

    const mentionsAmv1 = statusText.includes('AMV 1') || statusText.includes('AMV 01') || statusText.includes('AMV 65B') || statusText.includes('PRIMEIRO AMV') || statusText.includes('AGULHA 02');
    const mentionsAmv2 = statusText.includes('AMV 2') || statusText.includes('AMV 02') || statusText.includes('AMV 65A') || statusText.includes('SEGUNDO AMV') || statusText.includes('AGULHA 01');
    const mentionsAmv3 = statusText.includes('AMV 3') || statusText.includes('P3B') || statusText.includes('AMV 128') || statusText.includes('TERCEIRO AMV');
    const mentionsAmv4 = statusText.includes('AMV 4') || statusText.includes('QUARTO AMV');
    const mentionsAmv5 = statusText.includes('AMV 5') || statusText.includes('164/163');
    const mentionsAmv6 = statusText.includes('AMV 6') || statusText.includes('160/173');
    const anySpecific = mentionsAmv1 || mentionsAmv2 || mentionsAmv3 || mentionsAmv4 || mentionsAmv5 || mentionsAmv6;

    const h0 = amvs[0] === 'FALHA' || ((isDanger || isWarning) && (mentionsAmv1 || !anySpecific));
    const h1 = amvs[1] === 'FALHA' || ((isDanger || isWarning) && (mentionsAmv2 || (!anySpecific && layoutType !== 'pn_oficina')));
    const h2 = amvs[2] === 'FALHA' || ((isDanger || isWarning) && (mentionsAmv3 || (!anySpecific && (layoutType === 'freio_02' || layoutType === 'patio_oficina' || layoutType === 'oficina' || layoutType === 'oficina_central' || layoutType === 'abaixo_oficina' || layoutType === 'passageiro_02' || layoutType === 'reclassificacao_02'))));
    const h3 = (amvs[3] || 'NORMAL') === 'FALHA' || ((isDanger || isWarning) && (mentionsAmv4 || (!anySpecific && (layoutType === 'oficina_central' || layoutType === 'abaixo_oficina' || layoutType === 'passageiro_02'))));
    const h4 = (amvs[4] || 'NORMAL') === 'FALHA' || ((isDanger || isWarning) && (mentionsAmv5 || (!anySpecific && layoutType === 'abaixo_oficina')));
    const h5 = (amvs[5] || 'NORMAL') === 'FALHA' || ((isDanger || isWarning) && (mentionsAmv6 || (!anySpecific && layoutType === 'abaixo_oficina')));

    return {
      hazardAmvs: [h0, h1, h2, h3, h4, h5],
      isDanger,
      isWarning,
      amvs,
      selectedAmv,
      routePulseId: routePulseRef.current,
      plateColors,
      setPlateColors,
    };
  }, [amvs, selectedAmv, spawnLine, destLine, direction, safety, layoutType, plateColors]);

  const updateAmvState = (state: SwitchState) => {
    const newAmvs = [...amvs];
    newAmvs[selectedAmv] = state;
    setAmvs(newAmvs);
  };

  const handleToggleAmv = (index: number) => {
    const currentState = amvs[index];
    const nextState = currentState === 'NORMAL' ? 'REVERSO' : 'NORMAL';
    const newAmvs = [...amvs];
    newAmvs[index] = nextState;
    setAmvs(newAmvs);
  };

  const handleResetTrain = () => {
    setIsMoving(false);
    setRouteProgress(0);
    setResetKey(prev => prev + 1);
  };

  const effectiveSpawnLine = (layoutType === 'oficina_central' || layoutType === 'abaixo_oficina' || layoutType === 'passageiro_02' || layoutType === 'reclassificacao_02') && direction === 'NORTE_SUL' ? destLine : spawnLine;

  return (
    <div className={`${inlineMode ? 'absolute inset-0 z-[1000] rounded-lg' : 'fixed top-0 left-0 w-full h-[100svh] z-[10000]'} flex flex-col lg:flex-row bg-[#0a0a0c] text-slate-200 overflow-hidden font-sans select-none animate-cinematic`}>
      

      {/* MAIN SIMULATOR VIEW */}
      <div className="flex-1 lg:flex-1 flex flex-col relative overflow-hidden bg-[#0a0a0c] shrink-0 min-h-[30svh]">
         
         {/* TOP CONTROL BAR */}
         <header className={`absolute ${inlineMode ? 'top-12 lg:top-6' : 'top-[calc(0.75rem+var(--app-safe-top))] lg:top-[calc(1.5rem+var(--app-safe-top))]'} left-4 right-4 lg:left-8 lg:right-8 z-10 flex justify-center items-start pointer-events-none`}>

            {/* Camera Controls, Sky Mode & Close Button */}
            <div className="flex items-center gap-2.5">
              <div className="pointer-events-auto bg-[#18181c]/80 backdrop-blur-xl border border-white/10 p-1 rounded-[16px] shadow-2xl flex gap-1">
                 {[
                   { val: 'ISOMETRIC', label: 'Orbital', icon: <MapIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" /> },
                   { val: 'TOP', label: 'Topo', icon: <LayoutDashboard className="w-3.5 h-3.5 lg:w-4 lg:h-4" /> },
                   { val: 'POV', label: 'Cabine', icon: <Video className="w-3.5 h-3.5 lg:w-4 lg:h-4" /> }
                 ].map(c => (
                    <button 
                      key={c.val}
                      onClick={() => setCameraMode(c.val as CameraMode)}
                      className={`flex items-center gap-1.5 lg:gap-2 px-2.5 py-1.5 lg:px-4 lg:py-2 rounded-[12px] text-[11px] lg:text-[12px] font-bold transition-all ${
                        cameraMode === c.val ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {c.icon}
                      <span className="hidden sm:inline-block">{c.label}</span>
                    </button>
                 ))}
              </div>

              {/* Day / Night Sky Toggle */}
              <button
                onClick={() => setNightMode(!nightMode)}
                className={`pointer-events-auto h-9 px-2.5 lg:h-10 lg:px-3 rounded-xl lg:rounded-[14px] flex items-center gap-1.5 border shadow-lg active:scale-95 transition-all duration-200 text-[11px] font-bold ${
                  nightMode
                    ? 'bg-indigo-950/80 text-indigo-300 border-indigo-500/30 hover:bg-indigo-900/80'
                    : 'bg-sky-500/20 text-sky-200 border-sky-400/30 hover:bg-sky-500/30'
                }`}
                title={nightMode ? 'Mudar para Céu Diurno' : 'Mudar para Céu Noturno'}
              >
                {nightMode ? <Moon className="w-4 h-4 text-indigo-300" /> : <Sun className="w-4 h-4 text-amber-300" />}
                <span className="hidden sm:inline">{nightMode ? 'Noite' : 'Dia'}</span>
              </button>

              {/* Theme Customizer for Track Line Plates */}
              <button
                onClick={() => setIsCustomizerOpen(true)}
                className="pointer-events-auto h-9 px-2.5 lg:h-10 lg:px-3 rounded-xl lg:rounded-[14px] flex items-center gap-1.5 border shadow-lg active:scale-95 transition-all duration-200 text-[11px] font-bold bg-[#18181c]/80 backdrop-blur-xl border-white/10 hover:bg-white/10 text-slate-200"
                title="Customizar cor da placa e cor da letra"
              >
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <span
                  className="w-4 h-4 rounded-[4px] shadow-inner flex items-center justify-center text-[8px] font-black leading-none"
                  style={{
                    backgroundColor: plateColors.bg,
                    color: plateColors.text,
                  }}
                >
                  L
                </span>
                <span className="hidden sm:inline font-bold">Customizar</span>
              </button>

              {/* Universal Close Button */}
              <button 
                onClick={onClose}
                className="pointer-events-auto w-9 h-9 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl flex items-center justify-center border border-red-500/20 shadow-lg active:scale-95 transition-all duration-200 lg:w-10 lg:h-10 lg:rounded-[14px]"
                title="Fechar"
              >
                <X className="w-5 h-5 lg:w-6 lg:h-6" />
              </button>
            </div>
         </header>

         {/* CUSTOMIZADOR COMPLETO DE PLACAS (MODAL) */}
         {isCustomizerOpen && (
           <div 
             className="fixed inset-0 z-[10050] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 pointer-events-auto animate-cinematic"
             onClick={() => setIsCustomizerOpen(false)}
           >
             <div 
               className="bg-[#14151b] border border-white/15 rounded-3xl p-4 sm:p-5 shadow-2xl shadow-black/95 w-full max-w-md flex flex-col gap-3.5 text-slate-200 max-h-[92vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}
             >
               {/* Header */}
               <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
                 <div className="flex items-center gap-2.5">
                   <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                     <Palette className="w-4 h-4" />
                   </div>
                   <div>
                     <h3 className="text-white font-bold text-sm sm:text-base leading-tight">Customizar Placas de Linha</h3>
                     <p className="text-slate-400 text-[11px]">Mude a cor da placa e da letra em tempo real</p>
                   </div>
                 </div>
                 <button 
                   onClick={() => setIsCustomizerOpen(false)}
                   className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                 >
                   <X className="w-4 h-4" />
                 </button>
               </div>

               {/* Live Preview Box */}
               <div className="bg-[#0b0c10] border border-white/10 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center gap-2 shadow-inner">
                 <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                   Prévia ao Vivo na Simulação 3D
                 </span>
                 <div 
                   className="w-48 h-16 rounded-xl flex items-center justify-center font-black text-2xl shadow-2xl transition-all duration-200 tracking-tight"
                   style={{
                     backgroundColor: plateColors.bg,
                     color: plateColors.text,
                     boxShadow: `0 10px 25px -4px ${plateColors.bg}66`
                   }}
                 >
                   L-128
                 </div>
                 <div className="flex items-center gap-2 mt-0.5">
                   <button
                     onClick={handleSwapPlateColors}
                     className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all text-slate-200"
                     title="Inverter cor da placa com cor da letra"
                   >
                     <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                     Inverter Fundo e Letra
                   </button>
                 </div>
               </div>

               {/* Control 1: Cor da Placa (Fundo) */}
               <div className="flex flex-col gap-1.5">
                 <div className="flex items-center justify-between">
                   <label className="text-xs font-bold text-white flex items-center gap-1.5">
                     <span className="w-3 h-3 rounded-full border border-black/30 shadow-sm" style={{ backgroundColor: plateColors.bg }} />
                     1. Cor da Placa (Fundo)
                   </label>
                   <div className="flex items-center gap-1.5">
                     <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">{plateColors.bg}</span>
                     <label className="relative cursor-pointer">
                       <input 
                         type="color" 
                         value={plateColors.bg.startsWith('#') && plateColors.bg.length === 7 ? plateColors.bg : '#ef0000'}
                         onChange={e => handleUpdatePlateBg(e.target.value)}
                         className="sr-only" 
                       />
                       <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold flex items-center gap-1">
                         Livre...
                       </span>
                     </label>
                   </div>
                 </div>

                 {/* Swatches Placa */}
                 <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                   {POPULAR_BG_COLORS.map(c => {
                     const isSelected = plateColors.bg.toLowerCase() === c.hex.toLowerCase();
                     return (
                       <button
                         key={c.hex}
                         onClick={() => handleUpdatePlateBg(c.hex)}
                         className={`h-8 sm:h-9 rounded-xl border flex flex-col items-center justify-center transition-all ${
                           isSelected ? 'border-white ring-2 ring-indigo-500 scale-105 shadow-lg' : 'border-black/30 hover:scale-105 opacity-90 hover:opacity-100'
                         }`}
                         style={{ backgroundColor: c.hex }}
                         title={c.label}
                       >
                         {isSelected && (
                           <Check className={`w-4 h-4 ${c.hex === '#ffffff' ? 'text-black' : 'text-white'}`} strokeWidth={3} />
                         )}
                       </button>
                     );
                   })}
                 </div>
               </div>

               {/* Control 2: Cor da Letra (Texto) */}
               <div className="flex flex-col gap-1.5">
                 <div className="flex items-center justify-between">
                   <label className="text-xs font-bold text-white flex items-center gap-1.5">
                     <span className="w-3 h-3 rounded-full border border-black/30 shadow-sm" style={{ backgroundColor: plateColors.text }} />
                     2. Cor da Letra (Texto)
                   </label>
                   <div className="flex items-center gap-1.5">
                     <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">{plateColors.text}</span>
                     <label className="relative cursor-pointer">
                       <input 
                         type="color" 
                         value={plateColors.text.startsWith('#') && plateColors.text.length === 7 ? plateColors.text : '#ffffff'}
                         onChange={e => handleUpdatePlateText(e.target.value)}
                         className="sr-only" 
                       />
                       <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold flex items-center gap-1">
                         Livre...
                       </span>
                     </label>
                   </div>
                 </div>

                 {/* Swatches Letra */}
                 <div className="grid grid-cols-6 gap-1.5">
                   {POPULAR_TEXT_COLORS.map(c => {
                     const isSelected = plateColors.text.toLowerCase() === c.hex.toLowerCase();
                     return (
                       <button
                         key={c.hex}
                         onClick={() => handleUpdatePlateText(c.hex)}
                         className={`h-8 sm:h-9 rounded-xl border flex flex-col items-center justify-center transition-all ${
                           isSelected ? 'border-white ring-2 ring-indigo-500 scale-105 shadow-lg' : 'border-black/30 hover:scale-105 opacity-90 hover:opacity-100'
                         }`}
                         style={{ backgroundColor: c.hex }}
                         title={c.label}
                       >
                         {isSelected && (
                           <Check className={`w-4 h-4 ${c.hex === '#ffffff' || c.hex === '#ffd600' || c.hex === '#00ff66' || c.hex === '#00e5ff' ? 'text-black' : 'text-white'}`} strokeWidth={3} />
                         )}
                       </button>
                     );
                   })}
                 </div>
               </div>

               {/* Control 3: Combinações Rápidas Populares */}
               <div className="flex flex-col gap-1.5 pt-1">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                   Combinações Rápidas (1 Toque)
                 </label>
                 <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-0.5">
                   {QUICK_PLATE_PRESETS.map(p => {
                     const isSelected = plateColors.bg.toLowerCase() === p.bg.toLowerCase() && plateColors.text.toLowerCase() === p.text.toLowerCase();
                     return (
                       <button
                         key={p.name}
                         onClick={() => handleSetPlatePreset(p)}
                         className={`flex items-center gap-1.5 p-1.5 rounded-xl border transition-all text-left ${
                           isSelected ? 'bg-indigo-600/30 border-indigo-400 shadow-md' : 'bg-[#181920] border-white/5 hover:border-white/20'
                         }`}
                       >
                         <div 
                           className="w-5 h-4 rounded-[3px] border flex items-center justify-center font-black text-[7.5px] shrink-0 shadow-sm"
                           style={{ backgroundColor: p.bg, color: p.text, borderColor: p.text === '#ffffff' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }}
                         >
                           L
                         </div>
                         <span className="text-[9.5px] font-semibold truncate text-white leading-tight">{p.name}</span>
                       </button>
                     );
                   })}
                 </div>
               </div>

               {/* Done button */}
               <button
                 onClick={() => setIsCustomizerOpen(false)}
                 className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all mt-1"
               >
                 Concluir e Aplicar
               </button>
             </div>
           </div>
         )}

         {/* 3D SCENE CANVAS */}
         <div className="flex-1 w-full h-full min-h-[260px] relative z-0">
            <div className={`absolute inset-0 w-full h-full transition-opacity duration-300 ease-out ${isCanvasReady ? 'opacity-100' : 'opacity-0'} ${cameraMode === 'TOP' ? 'cursor-grab active:cursor-grabbing' : ''}`}>
              <SimHazardContext.Provider value={hazardContextValue}>
                {isCanvasReady && (
                <Canvas
                  dpr={[1, 1.5]}
                  gl={{ powerPreference: 'high-performance', antialias: true }}
                  shadows={{ type: THREE.PCFShadowMap as any }}
                  camera={{ position: [20, 35, 15], fov: 40 }}
                >
                  <Suspense fallback={null}>
                    <CameraController cameraMode={cameraMode} />

                    <color attach="background" args={[nightMode ? '#04060e' : '#8ec5fc']} />
                    <RealisticSkyEnvironment nightMode={nightMode} />
                    <ambientLight intensity={nightMode ? 0.12 : 0.65} />
                    <hemisphereLight args={[nightMode ? '#1e1b4b' : '#e0f2fe', nightMode ? '#09090b' : '#334155', nightMode ? 0.3 : 0.75]} />
                    <directionalLight castShadow position={[-18, 36, -24]} intensity={nightMode ? 0.2 : 1.35} shadow-mapSize={[1024, 1024]} />
                    <StudioEnvironment />

                    <ContactShadows position={[0, -0.2, 0]} opacity={nightMode ? 0.45 : 0.75} scale={100} blur={2} frames={1} resolution={256} />

                    {layoutType === 'oficina_central' ? (
                      <OficinaCentralAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : layoutType === 'abaixo_oficina' ? (
                      <AbaixoOficinaAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : layoutType === 'passageiro_02' ? (
                      <Passageiro02AmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : layoutType === 'passageiro_01' ? (
                      <Passageiro01AmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : layoutType === 'reclassificacao_02' ? (
                      <Reclassificacao02AmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : layoutType === 'reclassificacao' ? (
                      <ReclassificacaoAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : layoutType === 'pn_oficina' ? (
                      <PnOficinaAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : layoutType === 'carga_geral_02' ? (
                      <CargaGeral02AmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : layoutType === 'patio_oficina' ? (
                      <PatioOficinaAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : layoutType === 'oficina' ? (
                      <OficinaAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : layoutType === 'freio_02' ? (
                      <Freio02AmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : layoutType === 'freio' ? (
                      <FreioAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    ) : (
                      <DoubleAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
                    )}

                    <LedFlow layoutType={layoutType} direction={direction} amvs={amvs} spawnLine={effectiveSpawnLine} routeColor={safety?.status.includes('PERIGO') ? '#ef4444' : amvs[0] === 'NORMAL' ? '#10b981' : '#fbbf24'} />

                    <TrainGroup 
                      layoutType={layoutType}
                      direction={direction} 
                      amvs={amvs} 
                      cameraMode={cameraMode} 
                      isMoving={isMoving} 
                      nightMode={nightMode}
                      spawnLine={effectiveSpawnLine}
                      destLine={destLine}
                      speedMultiplier={speedMultiplier}
                      hasWagons={hasWagons}
                      resetKey={resetKey}
                      onProgressChange={setRouteProgress}
                    />
                  </Suspense>
                </Canvas>
                )}
              </SimHazardContext.Provider>
            </div>
         </div>

         {/* BOTTOM STATUS BAR (Desktop) */}
         <div className="hidden lg:block absolute bottom-6 left-8 right-8 z-10 pointer-events-none">
            <div className="pointer-events-auto bg-[#18181c]/90 backdrop-blur-2xl border border-white/10 p-3 rounded-[24px] shadow-2xl shadow-black/50 flex items-center justify-between gap-4 w-full max-w-3xl mx-auto">
               
               <div className="flex items-center gap-4 flex-1 pl-1">
                  <div className={`p-3 rounded-[18px] shadow-lg border ${safety?.bg}`}>
                     {React.cloneElement(safety?.icon as any, { className: "w-6 h-6 " + safety?.color })}
                  </div>
                  <div className="flex flex-col justify-center">
                     <h2 className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1">Diagnóstico de Rota Múltipla</h2>
                     <h3 className={`font-black text-[14px] leading-none uppercase tracking-wide mb-1 ${safety?.color}`}>{safety?.status}</h3>
                     <p className="text-[10px] text-slate-400 max-w-md leading-snug font-medium line-clamp-2">{safety?.desc}</p>
                  </div>
               </div>

               <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/10 to-transparent mx-2 shrink-0" />

               <div className="flex flex-col items-end shrink-0 pr-3">
                  <h2 className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">Estados dos AMVs</h2>
                  <div className="flex items-center gap-2">
                      {layoutType === 'freio_02' ? (
                        <>
                          <div className={`flex flex-col items-center bg-[#0a0a0c]/80 border ${selectedAmv === 0 ? 'border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'border-white/5'} px-2.5 py-1.5 rounded-xl cursor-pointer hover:border-indigo-500/30 transition-all`} onClick={() => setSelectedAmv(0)}>
                              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">AMV 02</span>
                              <span className={`text-[10px] font-black leading-none ${amvs[0] === 'NORMAL' ? 'text-emerald-400' : (amvs[0] === 'REVERSO' ? 'text-yellow-400' : 'text-red-500')}`}>{amvs[0] === 'NORMAL' ? 'RETA' : (amvs[0] === 'REVERSO' ? 'REVERSA' : 'AMV CONTRA')}</span>
                          </div>
                          <div className={`flex flex-col items-center bg-[#0a0a0c]/80 border ${selectedAmv === 1 ? 'border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'border-white/5'} px-2.5 py-1.5 rounded-xl cursor-pointer hover:border-indigo-500/30 transition-all`} onClick={() => setSelectedAmv(1)}>
                              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">AMV 01</span>
                              <span className={`text-[10px] font-black leading-none ${amvs[1] === 'NORMAL' ? 'text-emerald-400' : (amvs[1] === 'REVERSO' ? 'text-yellow-400' : 'text-red-500')}`}>{amvs[1] === 'NORMAL' ? 'RETA' : (amvs[1] === 'REVERSO' ? 'REVERSA' : 'AMV CONTRA')}</span>
                          </div>
                          <div className={`flex flex-col items-center bg-[#0a0a0c]/80 border ${selectedAmv === 2 ? 'border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'border-white/5'} px-2.5 py-1.5 rounded-xl cursor-pointer hover:border-indigo-500/30 transition-all`} onClick={() => setSelectedAmv(2)}>
                              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">AMV 128</span>
                              <span className={`text-[10px] font-black leading-none ${amvs[2] === 'NORMAL' ? 'text-emerald-400' : (amvs[2] === 'REVERSO' ? 'text-yellow-400' : 'text-red-500')}`}>{amvs[2] === 'NORMAL' ? 'RETA' : (amvs[2] === 'REVERSO' ? 'REVERSA' : 'AMV CONTRA')}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          {(layoutType === 'abaixo_oficina' ? [0, 1, 2, 3, 4, 5] : (layoutType === 'oficina_central' || layoutType === 'passageiro_02') ? [0, 1, 2, 3] : (layoutType === 'patio_oficina' || layoutType === 'oficina' || layoutType === 'reclassificacao_02') ? [0, 1, 2] : layoutType === 'pn_oficina' ? [0] : [0, 1]).map((idx) => (
                            <div
                              key={idx}
                              className={`flex flex-col items-center bg-[#0a0a0c]/80 border ${selectedAmv === idx ? 'border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'border-white/5'} px-2.5 py-1.5 rounded-xl cursor-pointer hover:border-indigo-500/30 transition-all`}
                              onClick={() => setSelectedAmv(idx)}
                            >
                              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">{layoutType === 'passageiro_02' ? (idx === 0 ? 'TP-2B' : idx === 1 ? 'TP-3B' : idx === 2 ? 'TP-04' : 'TP-05') : `AMV ${idx + 1}`}</span>
                              <span className={`text-[10px] font-black leading-none ${(amvs[idx] || 'NORMAL') === 'NORMAL' ? 'text-emerald-400' : (amvs[idx] === 'REVERSO' ? 'text-yellow-400' : 'text-red-500')}`}>
                                {(amvs[idx] || 'NORMAL') === 'NORMAL' ? 'RETA' : (amvs[idx] === 'REVERSO' ? 'REVERSA' : 'AMV CONTRA')}
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                  </div>
               </div>
            </div>
         </div>
      </div>

      {/* RIGHT SIDEBAR (Control Cards - Desktop) */}
      <aside className="hidden lg:flex w-[280px] h-full bg-[#121217] border-l border-white/5 shrink-0 overflow-y-auto overflow-x-hidden z-20 p-2.5 flex-col justify-between gap-2" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
         
         {/* SECTION: Movement, Speed, Pause & Coupled Wagons */}
         <div className="bg-[#18181c] border border-white/5 rounded-[16px] p-3 flex flex-col shadow-2xl relative overflow-hidden group shrink-0">
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 transition-all ${isMoving ? 'bg-indigo-500' : 'bg-transparent'}`} />
            
            <div className="flex justify-between items-center mb-2 relative z-10 gap-2">
              <div>
                 <h3 className="text-white font-bold text-[13px] tracking-wide">Composição</h3>
                 <p className="text-slate-400 text-[9px] font-semibold mt-0.5 leading-tight">Controle de tração e vagões</p>
              </div>
              <div className={`shrink-0 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border transition-all ${isMoving ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' : routeProgress > 0 && routeProgress < 1 ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-[#0a0a0c] text-slate-500 border-white/5'}`}>
                {isMoving ? `Em Rota (${speedMultiplier}x)` : routeProgress > 0 && routeProgress < 1 ? 'Pausado' : 'No Início'}
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 py-1 relative z-10">
              <button 
                onClick={() => {
                  if (!isMoving && hornOnStart) playLocomotiveHorn();
                  setIsMoving(!isMoving);
                }}
                className={`flex-1 h-12 rounded-[12px] flex items-center justify-center gap-2 transition-all duration-300 outline-none active:scale-95 ${
                  isMoving 
                    ? 'bg-amber-600 border-t border-amber-400/50 shadow-[0_6px_15px_-3px_rgba(217,119,6,0.4)] text-white'
                    : 'bg-indigo-600 border-t border-indigo-400/50 shadow-[0_6px_15px_-3px_rgba(79,70,229,0.4)] text-white hover:bg-indigo-500'
                }`}
              >
                {isMoving ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white" />}
                <span className="text-[10px] font-black uppercase tracking-widest text-white">
                  {isMoving ? 'Pausar' : routeProgress > 0 && routeProgress < 1 ? 'Continuar' : 'Iniciar'}
                </span>
              </button>

              <button
                onClick={() => setHornOnStart(!hornOnStart)}
                title={hornOnStart ? 'Buzina ao iniciar ativada (clique para iniciar sem buzina)' : 'Iniciar sem buzina (clique para ativar buzina)'}
                className={`w-14 h-12 rounded-[12px] border flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all ${
                  hornOnStart
                    ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-300'
                    : 'bg-[#1e1e24] hover:bg-[#282830] border-white/10 text-slate-400'
                }`}
              >
                {hornOnStart ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                <span className="text-[6.5px] font-bold uppercase tracking-wider leading-none">
                  {hornOnStart ? 'Com Buz.' : 'Sem Buz.'}
                </span>
              </button>

              <button
                onClick={handleResetTrain}
                title="Reiniciar do início da via"
                className="w-12 h-12 rounded-[12px] bg-[#1e1e24] hover:bg-[#282830] border border-white/10 flex flex-col items-center justify-center gap-0.5 text-slate-300 active:scale-95 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[7px] font-bold uppercase tracking-wider text-slate-400">Início</span>
              </button>
            </div>

            {/* Speed & Wagons Row */}
            <div className="grid grid-cols-2 gap-1.5 mt-2 relative z-10">
              <div className="flex bg-[#0a0a0c] p-1 rounded-[10px] border border-white/5">
                {([1, 2] as const).map(spd => (
                  <button
                    key={spd}
                    onClick={() => setSpeedMultiplier(spd)}
                    className={`flex-1 py-1 rounded-[7px] text-[9px] font-black uppercase transition-all flex items-center justify-center gap-1 ${
                      speedMultiplier === spd
                        ? 'bg-indigo-500 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Gauge className="w-2.5 h-2.5" />
                    {spd}x
                  </button>
                ))}
              </div>

              <button
                onClick={() => setHasWagons(!hasWagons)}
                className={`py-1.5 px-2 rounded-[10px] border text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                  hasWagons
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                    : 'bg-[#0a0a0c] border-white/5 text-slate-500 hover:text-slate-300'
                }`}
              >
                <Train className="w-3 h-3" />
                {hasWagons ? 'Com Vagões' : 'Só Loco'}
              </button>
            </div>
         </div>

         {/* SECTION: Switch / Agulha */}
         <div className="bg-[#18181c] border border-white/5 rounded-[16px] p-3 flex flex-col shadow-2xl shrink-0">
            <div className="flex justify-between items-center mb-1.5 gap-2">
              <div>
                 <h3 className="text-white font-bold text-[13px] tracking-wide">Configurar AMVs</h3>
                 <p className="text-slate-400 text-[9px] font-semibold mt-0.5 leading-tight">Selecione e modifique individualmente</p>
              </div>
              <div className="shrink-0 w-7 h-7 rounded-[10px] bg-[#222228] border border-white/5 flex items-center justify-center shadow-inner">
                 <LayoutDashboard className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>

            {/* SELECTION DOTS */}
            <div className="flex gap-1.5 mb-1.5">
               {(layoutType === 'abaixo_oficina' ? [0, 1, 2, 3, 4, 5] : (layoutType === 'oficina_central' || layoutType === 'passageiro_02') ? [0, 1, 2, 3] : (layoutType === 'freio_02' || layoutType === 'patio_oficina' || layoutType === 'oficina' || layoutType === 'reclassificacao_02') ? [0, 1, 2] : layoutType === 'pn_oficina' ? [0] : [0, 1]).map(index => {
                   let name = '';
                   if (layoutType === 'freio_02') {
                     name = index === 0 ? '02' : (index === 1 ? '01' : '128');
                   } else if (layoutType === 'freio') {
                     name = index === 0 ? '1' : '2';
                   } else if (layoutType === 'pn_oficina') {
                     name = '1';
                   } else if (layoutType === 'passageiro_02') {
                     name = index === 0 ? 'TP-2B' : index === 1 ? 'TP-3B' : index === 2 ? 'TP-04' : 'TP-05';
                   } else {
                     name = String(index + 1);
                   }
                   const isAmvHazard = hazardContextValue.hazardAmvs[index];
                   return (
                     <button
                       key={index}
                       onClick={() => setSelectedAmv(index)}
                       className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-[10px] border transition-all ${
                          isAmvHazard
                            ? 'bg-red-500/15 border-red-500/60 text-red-300 animate-pulse'
                            : selectedAmv === index 
                            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-md'
                            : 'bg-[#0a0a0c] border-white/5 text-slate-500 hover:border-white/10'
                       }`}
                     >
                       <span className="text-[8px] font-black uppercase tracking-widest leading-none mb-1">AMV {name}</span>
                       <span className={`text-[9px] font-bold leading-none ${(amvs[index] || 'NORMAL') === 'NORMAL' ? 'text-emerald-500' : (amvs[index] === 'REVERSO' ? 'text-yellow-500' : 'text-red-500')}`}>
                          {(amvs[index] || 'NORMAL') === 'NORMAL' ? 'RETA' : (amvs[index] === 'REVERSO' ? 'REVERSA' : 'CONTRA')}
                       </span>
                     </button>
                   );
               })}
            </div>

            <div className="flex bg-[#0a0a0c] p-1 rounded-[14px] border border-white/5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
               {[
                 { val: 'NORMAL', label: 'Reta' },
                 { val: 'REVERSO', label: 'Reversa' },
                 { val: 'FALHA', label: 'AMV Contra' }
               ].map(s => (
                  <button 
                    key={s.val}
                    onClick={() => updateAmvState(s.val as SwitchState)}
                    className={`flex-1 py-1.5 rounded-[10px] text-[8px] font-bold transition-all uppercase tracking-wider relative ${
                      amvs[selectedAmv] === s.val 
                        ? (s.val === 'FALHA' ? 'bg-red-500 text-white shadow-md' : 'bg-[#2a2a32] text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-white/10')
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {s.label}
                  </button>
               ))}
            </div>
         </div>

         {/* SECTION: Approach */}
         <div className="bg-[#18181c] border border-white/5 rounded-[16px] p-3 flex flex-col shadow-2xl shrink-0">
            <div className="flex justify-between items-center mb-1.5 gap-2">
              <div>
                 <h3 className="text-white font-bold text-[13px] tracking-wide">Direção da Frota</h3>
                 <p className="text-slate-400 text-[9px] font-semibold mt-0.5 leading-tight">Origem e Destino na via rápida</p>
              </div>
              <div className="shrink-0 w-7 h-7 rounded-[10px] bg-[#222228] border border-white/5 flex items-center justify-center shadow-inner">
                 <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
               {[
                 { val: 'NORTE_SUL', label: 'Norte para Sul', sub: 'Descendo a extensão' },
                 { val: 'SUL_NORTE', label: 'Sul para Norte', sub: 'Subindo a extensão' }
               ].map(a => (
                  <button 
                    key={a.val}
                    onClick={() => { setDirection(a.val as Direction); setIsMoving(false); setResetKey(prev => prev + 1); }}
                    className={`flex items-center justify-between p-1.5 rounded-[12px] transition-all group ${
                      direction === a.val 
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-white' 
                        : 'bg-[#0a0a0c] border border-white/5 hover:border-white/10 shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)] text-slate-400'
                    }`}
                    style={{ borderWidth: 1 }}
                  >
                     <div className="flex items-center gap-2">
                       <div className={`shrink-0 w-7 h-7 rounded-[8px] flex items-center justify-center transition-all ${direction === a.val ? 'bg-indigo-500/20 text-indigo-400 shadow-[inset_0_0_12px_rgba(99,102,241,0.2)]' : 'bg-[#1a1a20] text-slate-500 border border-white/5 group-hover:text-slate-400'}`}>
                          <RadioReceiver className="w-3 h-3" />
                       </div>
                       <div className="text-left">
                          <div className={`text-[11px] font-bold truncate max-w-[130px] leading-tight ${direction === a.val ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{a.label}</div>
                          <div className={`text-[7.5px] font-black uppercase tracking-widest mt-0.5 ${direction === a.val ? 'text-indigo-400/80' : 'text-slate-600'}`}>{a.sub}</div>
                       </div>
                     </div>
                     <div className={`w-3 h-3 rounded-full border-[3px] shadow-sm transition-all mr-1 ${direction === a.val ? 'border-indigo-400 bg-[#18181c] drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'border-slate-700 bg-transparent'}`} />
                  </button>
               ))}
            </div>
         </div>

         {/* SECTION: Spawn Origin */}
         {direction === 'SUL_NORTE' && (layoutType === 'oficina_central' || layoutType === 'abaixo_oficina' || layoutType === 'passageiro_02' || layoutType === 'passageiro_01' || layoutType === 'patio_oficina' || layoutType === 'freio' || layoutType === 'oficina' || layoutType === 'reclassificacao' || layoutType === 'reclassificacao_02' || layoutType === 'pn_oficina') && (
            <div className="bg-[#18181c] border border-white/5 rounded-[16px] p-3 flex flex-col shadow-2xl shrink-0">
               <div className="flex justify-between items-center mb-1.5 gap-2">
                 <div>
                    <h3 className="text-white font-bold text-[13px] tracking-wide">Linha de Origem</h3>
                    <p className="text-slate-400 text-[9px] font-semibold mt-0.5 leading-tight">Posição de partida no Sul</p>
                 </div>
                 <div className="flex items-center gap-2">
                   <button
                     onClick={() => setIsAutoLineSelection(!isAutoLineSelection)}
                     className={`shrink-0 px-2 py-1 rounded-[6px] text-[9px] font-bold transition-all border ${isAutoLineSelection ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-[#222228] text-slate-500 border-white/5'}`}
                   >
                     {isAutoLineSelection ? 'AUTO ON' : 'AUTO OFF'}
                   </button>
                   <div className="shrink-0 w-7 h-7 rounded-[10px] bg-[#222228] border border-white/5 flex items-center justify-center shadow-inner">
                      <Compass className="w-3 h-3 text-slate-400" />
                   </div>
                 </div>
               </div>
               
               <div className="flex flex-wrap gap-1 bg-[#0a0a0c] p-1 rounded-[12px] border border-white/5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                  {(layoutType === 'abaixo_oficina' ? [
                    { val: '166', label: '166' },
                    { val: '165', label: '165' },
                    { val: '164', label: '164' },
                    { val: '163', label: '163' },
                    { val: '162', label: '162' },
                    { val: '161', label: '161' },
                    { val: '160', label: '160' },
                    { val: '173', label: '173' }
                  ] : layoutType === 'reclassificacao_02' ? [
                    { val: '109', label: 'L-109' },
                    { val: '122', label: 'L-122' },
                    { val: '121', label: 'L-121' }
                  ] : layoutType === 'oficina_central' ? [
                    { val: '158', label: '158' },
                    { val: '160', label: '160' },
                    { val: '161', label: '161' },
                    { val: '162', label: '162' },
                    { val: '163', label: '163' },
                    { val: '164', label: '164' },
                    { val: '165', label: '165' }
                  ] : layoutType === 'passageiro_02' ? [
                    { val: 'TP05', label: 'TP-05' },
                    { val: 'TP04', label: 'TP-04' },
                    { val: 'TP3B', label: 'TP-3B' },
                    { val: 'TP2B', label: 'TP-2B' }
                  ] : layoutType === 'passageiro_01' ? [
                    { val: 'TP3A', label: 'TP-3A' },
                    { val: 'TP2A', label: 'TP-2A' },
                    { val: 'TP01', label: 'TP-01' }
                  ] : layoutType === 'patio_oficina' ? [
                    { val: '201A', label: '201A' },
                    { val: '32', label: 'L-32' },
                    { val: '28', label: 'L-28' },
                    { val: '31', label: 'L-31' },
                    { val: '27', label: 'L-27' }
                  ] : layoutType === 'freio' ? [
                    { val: '2', label: 'L-02' },
                    { val: '1', label: 'L-01' },
                    { val: '128', label: 'L-128' }
                  ] : layoutType === 'oficina' ? [
                    { val: '167', label: 'L-167' },
                    { val: '166', label: 'L-166' },
                    { val: '165', label: 'L-165' },
                    { val: '152', label: '152 Reta' }
                  ] : layoutType === 'pn_oficina' ? [
                    { val: '159', label: 'L-159' },
                    { val: '173', label: 'L-173' }
                  ] : [
                    { val: '107A', label: 'L-107A' },
                    { val: '106A', label: 'L-106A' },
                    { val: '105A', label: 'L-105A' }
                  ]).map(s => (
                     <button 
                       key={s.val}
                       onClick={() => { setSpawnLine(s.val as SpawnLine); setIsMoving(false); setIsAutoLineSelection(false); setResetKey(prev => prev + 1); }}
                       className={`flex-1 min-w-[30px] py-1.5 rounded-[8px] text-[8px] font-bold transition-all uppercase tracking-wider relative ${
                         spawnLine === s.val 
                           ? 'bg-indigo-500 text-white shadow-md'
                           : 'text-slate-500 hover:text-slate-300'
                       }`}
                     >
                       {s.label}
                     </button>
                  ))}
               </div>
            </div>
         )}
         
         {/* SECTION: Destination */}
         {direction === 'NORTE_SUL' && (layoutType === 'oficina_central' || layoutType === 'abaixo_oficina' || layoutType === 'passageiro_02' || layoutType === 'passageiro_01' || layoutType === 'patio_oficina' || layoutType === 'freio' || layoutType === 'oficina' || layoutType === 'reclassificacao' || layoutType === 'reclassificacao_02' || layoutType === 'pn_oficina') && (
            <div className="bg-[#18181c] border border-white/5 rounded-[16px] p-3 flex flex-col shadow-2xl shrink-0">
               <div className="flex justify-between items-center mb-1.5 gap-2">
                 <div>
                    <h3 className="text-white font-bold text-[13px] tracking-wide">Linha de Destino</h3>
                    <p className="text-slate-400 text-[9px] font-semibold mt-0.5 leading-tight">Chegada planejada no Sul</p>
                 </div>
                 <div className="flex items-center gap-2">
                   <button
                     onClick={() => setIsAutoLineSelection(!isAutoLineSelection)}
                     className={`shrink-0 px-2 py-1 rounded-[6px] text-[9px] font-bold transition-all border ${isAutoLineSelection ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-[#222228] text-slate-500 border-white/5'}`}
                   >
                     {isAutoLineSelection ? 'AUTO ON' : 'AUTO OFF'}
                   </button>
                   <div className="shrink-0 w-7 h-7 rounded-[10px] bg-[#222228] border border-white/5 flex items-center justify-center shadow-inner">
                      <Compass className="w-3 h-3 text-slate-400" />
                   </div>
                 </div>
               </div>
               
               <div className="flex flex-wrap gap-1 bg-[#0a0a0c] p-1 rounded-[12px] border border-white/5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                  {(layoutType === 'abaixo_oficina' ? [
                    { val: '166', label: '166' },
                    { val: '165', label: '165' },
                    { val: '164', label: '164' },
                    { val: '163', label: '163' },
                    { val: '162', label: '162' },
                    { val: '161', label: '161' },
                    { val: '160', label: '160' },
                    { val: '173', label: '173' }
                  ] : layoutType === 'reclassificacao_02' ? [
                    { val: '109', label: 'L-109' },
                    { val: '122', label: 'L-122' },
                    { val: '121', label: 'L-121' }
                  ] : layoutType === 'oficina_central' ? [
                    { val: '158', label: '158' },
                    { val: '160', label: '160' },
                    { val: '161', label: '161' },
                    { val: '162', label: '162' },
                    { val: '163', label: '163' },
                    { val: '164', label: '164' },
                    { val: '165', label: '165' }
                  ] : layoutType === 'passageiro_02' ? [
                    { val: 'TP05', label: 'TP-05' },
                    { val: 'TP04', label: 'TP-04' },
                    { val: 'TP3B', label: 'TP-3B' },
                    { val: 'TP2B', label: 'TP-2B' }
                  ] : layoutType === 'passageiro_01' ? [
                    { val: 'TP3A', label: 'TP-3A' },
                    { val: 'TP2A', label: 'TP-2A' },
                    { val: 'TP01', label: 'TP-01' }
                  ] : layoutType === 'patio_oficina' ? [
                    { val: '201A', label: '201A' },
                    { val: '32', label: 'L-32' },
                    { val: '28', label: 'L-28' },
                    { val: '31', label: 'L-31' },
                    { val: '27', label: 'L-27' }
                  ] : layoutType === 'freio' ? [
                    { val: '2', label: 'L-02' },
                    { val: '1', label: 'L-01' },
                    { val: '128', label: 'L-128' }
                  ] : layoutType === 'oficina' ? [
                    { val: '167', label: 'L-167' },
                    { val: '166', label: 'L-166' },
                    { val: '165', label: 'L-165' },
                    { val: '152', label: '152 Reta' }
                  ] : layoutType === 'pn_oficina' ? [
                    { val: '159', label: 'L-159' },
                    { val: '173', label: 'L-173' }
                  ] : [
                    { val: '107A', label: 'L-107A' },
                    { val: '106A', label: 'L-106A' },
                    { val: '105A', label: 'L-105A' }
                  ]).map(s => (
                     <button 
                       key={s.val}
                       onClick={() => { setDestLine(s.val as SpawnLine); if (layoutType === 'oficina_central' || layoutType === 'abaixo_oficina' || layoutType === 'passageiro_02' || layoutType === 'reclassificacao_02') { setSpawnLine(s.val as SpawnLine); setIsMoving(false); setResetKey(prev => prev + 1); } setIsAutoLineSelection(false); }}
                       className={`flex-1 min-w-[30px] py-1.5 rounded-[8px] text-[8px] font-bold transition-all uppercase tracking-wider relative ${
                         destLine === s.val 
                           ? 'bg-orange-500 text-white shadow-md'
                           : 'text-slate-500 hover:text-slate-300'
                       }`}
                     >
                       {s.label}
                     </button>
                  ))}
               </div>
            </div>
         )}

         {/* SECTION: Plate Customizer */}
         <div className="bg-[#18181c] border border-white/5 rounded-[16px] p-3 flex flex-col shadow-2xl shrink-0 gap-2.5">
            <div className="flex justify-between items-center gap-2">
              <div>
                 <h3 className="text-white font-bold text-[13px] tracking-wide">Customizar Placas</h3>
                 <p className="text-slate-400 text-[9px] font-semibold mt-0.5 leading-tight">Cor da placa e cor da letra</p>
              </div>
              <button 
                onClick={() => setIsCustomizerOpen(true)}
                className="shrink-0 px-2 py-1 rounded-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold flex items-center gap-1 active:scale-95"
                title="Abrir Customizador Completo"
              >
                <SlidersHorizontal className="w-3 h-3 text-amber-400" />
                Painel
              </button>
            </div>

            {/* Live badge preview */}
            <div className="bg-[#0a0a0c] p-2 rounded-xl border border-white/5 flex items-center justify-between gap-2 shadow-inner">
               <div 
                 className="flex-1 h-9 rounded-lg flex items-center justify-center font-black text-sm tracking-wide shadow transition-all"
                 style={{
                   backgroundColor: plateColors.bg,
                   color: plateColors.text,
                 }}
               >
                 L-128
               </div>
               <button
                 onClick={handleSwapPlateColors}
                 className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 active:scale-95 transition-all"
                 title="Inverter cor da placa com cor da letra"
               >
                 <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
               </button>
            </div>

            {/* Cor da Placa */}
            <div className="flex flex-col gap-1">
               <div className="flex justify-between items-center text-[10px]">
                 <span className="font-bold text-white flex items-center gap-1">
                   <span className="w-2.5 h-2.5 rounded-full border border-black/30" style={{ backgroundColor: plateColors.bg }} />
                   Cor da Placa:
                 </span>
                 <label className="relative cursor-pointer">
                   <input 
                     type="color" 
                     value={plateColors.bg.startsWith('#') && plateColors.bg.length === 7 ? plateColors.bg : '#ef0000'}
                     onChange={e => handleUpdatePlateBg(e.target.value)}
                     className="sr-only" 
                   />
                   <span className="text-[9px] font-mono text-indigo-400 uppercase font-bold hover:underline">
                     {plateColors.bg} (Livre)
                   </span>
                 </label>
               </div>
               <div className="grid grid-cols-4 gap-1">
                 {POPULAR_BG_COLORS.slice(0, 8).map(c => (
                   <button
                     key={c.hex}
                     onClick={() => handleUpdatePlateBg(c.hex)}
                     className={`h-6 rounded-md border transition-all ${plateColors.bg.toLowerCase() === c.hex.toLowerCase() ? 'border-white ring-1 ring-indigo-500 scale-105' : 'border-black/30'}`}
                     style={{ backgroundColor: c.hex }}
                     title={c.label}
                   />
                 ))}
               </div>
            </div>

            {/* Cor da Letra */}
            <div className="flex flex-col gap-1">
               <div className="flex justify-between items-center text-[10px]">
                 <span className="font-bold text-white flex items-center gap-1">
                   <span className="w-2.5 h-2.5 rounded-full border border-black/30" style={{ backgroundColor: plateColors.text }} />
                   Cor da Letra:
                 </span>
                 <label className="relative cursor-pointer">
                   <input 
                     type="color" 
                     value={plateColors.text.startsWith('#') && plateColors.text.length === 7 ? plateColors.text : '#ffffff'}
                     onChange={e => handleUpdatePlateText(e.target.value)}
                     className="sr-only" 
                   />
                   <span className="text-[9px] font-mono text-indigo-400 uppercase font-bold hover:underline">
                     {plateColors.text} (Livre)
                   </span>
                 </label>
               </div>
               <div className="grid grid-cols-6 gap-1">
                 {POPULAR_TEXT_COLORS.map(c => (
                   <button
                     key={c.hex}
                     onClick={() => handleUpdatePlateText(c.hex)}
                     className={`h-6 rounded-md border transition-all ${plateColors.text.toLowerCase() === c.hex.toLowerCase() ? 'border-white ring-1 ring-indigo-500 scale-105' : 'border-black/30'}`}
                     style={{ backgroundColor: c.hex }}
                     title={c.label}
                   />
                 ))}
               </div>
            </div>
         </div>
      </aside>

      {/* MOBILE BOTTOM CONTROL AREA */}
      <div className={`lg:hidden w-full bg-[#0a0a0c] border-t border-white/5 flex flex-col relative z-20 shrink-0 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${inlineMode ? 'p-3 pb-10' : 'p-3 pb-[calc(1.5rem+var(--app-safe-bottom))]'} gap-0 ${isMobilePanelOpen ? 'overflow-y-auto' : 'overflow-hidden'}`}>
          
          {/* STATUS TOGGLE */}
          <button 
              onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)}
              className={`shrink-0 p-3 rounded-2xl flex items-center gap-3 shadow-md border outline-none active:scale-[0.98] transition-all ${safety?.bg} ${!isMobilePanelOpen ? '' : 'mb-3'}`}
          >
              <div className="shrink-0 w-8 h-8 flex items-center justify-center bg-black/20 rounded-full">
                  {safety?.icon && React.cloneElement(safety.icon as React.ReactElement<any>, { className: "w-5 h-5 " + safety.color })}
              </div>
              <div className="flex-1 flex flex-col justify-center text-left">
                  <h3 className={`font-bold text-[12px] leading-tight uppercase ${safety?.color}`}>{safety?.status}</h3>
                  <div className="text-[10px] text-slate-400 font-medium line-clamp-1 leading-tight mt-0.5">{safety?.desc}</div>
              </div>
              <div className={`shrink-0 w-6 h-6 flex items-center justify-center bg-black/10 rounded-full ml-1 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isMobilePanelOpen ? 'rotate-0' : '-rotate-180'}`}>
                 <ChevronDown className={`w-4 h-4 ${safety?.color}`} />
              </div>
          </button>

          <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isMobilePanelOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
             <div className="overflow-hidden flex flex-col gap-2.5">
                 {/* AMV Selection Mobile */}
                 <div className="flex gap-1.5">
               {(layoutType === 'abaixo_oficina' ? [0, 1, 2, 3, 4, 5] : (layoutType === 'oficina_central' || layoutType === 'passageiro_02') ? [0, 1, 2, 3] : (layoutType === 'freio_02' || layoutType === 'patio_oficina' || layoutType === 'oficina' || layoutType === 'reclassificacao_02') ? [0, 1, 2] : layoutType === 'pn_oficina' ? [0] : [0, 1]).map(index => {
                   let name = '';
                   if (layoutType === 'freio_02') {
                     name = index === 0 ? '02' : (index === 1 ? '01' : '128');
                   } else if (layoutType === 'freio') {
                     name = index === 0 ? '1' : '2';
                   } else if (layoutType === 'passageiro_02') {
                     name = index === 0 ? 'TP-2B' : index === 1 ? 'TP-3B' : index === 2 ? 'TP-04' : 'TP-05';
                   } else {
                     name = String(index + 1);
                   }
                   const isAmvHazard = hazardContextValue.hazardAmvs[index];
                   return (
                     <button
                       key={index}
                       onClick={() => setSelectedAmv(index)}
                       className={`flex-1 flex items-center justify-between px-2 py-2 rounded-xl border transition-all ${
                          isAmvHazard
                            ? 'bg-red-500/15 border-red-500/60 text-red-300 animate-pulse'
                            : selectedAmv === index 
                            ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
                            : 'bg-[#18181c] border-white/5 text-slate-500'
                       }`}
                     >
                       <span className="text-[7.5px] font-black uppercase tracking-wider leading-none">AMV {name}</span>
                       <span className={`text-[8.5px] font-black uppercase leading-none ${(amvs[index] || 'NORMAL') === 'NORMAL' ? 'text-emerald-500' : (amvs[index] === 'REVERSO' ? 'text-yellow-500' : 'text-red-500')}`}>
                          {(amvs[index] || 'NORMAL') === 'NORMAL' ? 'RETA' : (amvs[index] === 'REVERSO' ? 'REVERSA' : 'CONTRA')}
                       </span>
                     </button>
                   );
               })}
          </div>

          {/* Primary Action Row: Play/Pause, Horn Toggle, Reset, & Switch Options */}
          <div className="flex gap-1.5 shrink-0 h-12">
              <button 
                  onClick={() => {
                    if (!isMoving && hornOnStart) playLocomotiveHorn();
                    setIsMoving(!isMoving);
                  }}
                  className={`px-3 h-full rounded-2xl flex items-center justify-center gap-1.5 transition-all outline-none active:scale-95 ${
                      isMoving 
                      ? 'bg-amber-600 shadow-[0_4px_15px_rgba(217,119,6,0.4)] text-white' 
                      : 'bg-indigo-600 shadow-[0_4px_15px_rgba(79,70,229,0.4)] text-white'
                  }`}
              >
                  {isMoving ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white" />}
                  <span className="text-[9px] font-black uppercase tracking-wider">{isMoving ? 'Pausar' : routeProgress > 0 && routeProgress < 1 ? 'Cont.' : 'Iniciar'}</span>
              </button>

              <button
                  onClick={() => setHornOnStart(!hornOnStart)}
                  title={hornOnStart ? 'Com buzina ao iniciar (toque para iniciar sem buzina)' : 'Sem buzina ao iniciar (toque para ativar)'}
                  className={`w-12 h-full rounded-2xl border flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all ${
                    hornOnStart
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      : 'bg-[#18181c] border-white/10 text-slate-400'
                  }`}
              >
                  {hornOnStart ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                  <span className="text-[6.5px] font-bold uppercase leading-none">{hornOnStart ? 'Com Buz.' : 'Sem Buz.'}</span>
              </button>

              <button
                  onClick={handleResetTrain}
                  title="Reiniciar composição"
                  className="w-11 h-full rounded-2xl bg-[#18181c] border border-white/10 flex flex-col items-center justify-center gap-0.5 text-slate-300 active:scale-95"
              >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[7px] font-bold uppercase">Início</span>
              </button>

              <div className="flex-1 bg-[#18181c] border border-white/5 rounded-2xl p-1 flex gap-1 shadow-inner">
                  {[
                       { val: 'NORMAL', label: 'Reta' },
                       { val: 'REVERSO', label: 'Reversa' },
                       { val: 'FALHA', label: 'Contra' }
                  ].map(s => (
                      <button 
                        key={s.val}
                        onClick={() => updateAmvState(s.val as SwitchState)}
                        className={`flex-1 rounded-xl text-[9px] font-bold uppercase transition-all ${
                          amvs[selectedAmv] === s.val 
                              ? (s.val === 'FALHA' ? 'bg-red-500 text-white shadow-md' : 'bg-[#2a2a32] text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)] border border-white/10')
                              : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {s.label}
                      </button>
                  ))}
              </div>
          </div>

          {/* Speed & Wagons Mobile Row */}
          <div className="flex gap-2 shrink-0">
              <div className="flex-1 bg-[#18181c] border border-white/5 rounded-xl p-1 flex gap-1">
                  {([1, 2] as const).map(spd => (
                      <button
                          key={spd}
                          onClick={() => setSpeedMultiplier(spd)}
                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center gap-1 ${
                              speedMultiplier === spd
                              ? 'bg-indigo-500 text-white shadow-sm'
                              : 'text-slate-400'
                          }`}
                      >
                          <Gauge className="w-3 h-3" />
                          Vel. {spd}x
                      </button>
                  ))}
              </div>

              <button
                  onClick={() => setHasWagons(!hasWagons)}
                  className={`px-3.5 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                      hasWagons
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                      : 'bg-[#18181c] border-white/5 text-slate-400'
                  }`}
              >
                  <Train className="w-3.5 h-3.5" />
                  {hasWagons ? 'Com Vagões' : 'Só Loco'}
              </button>
          </div>

          {/* Direction Mobile Selection */}
          <div className="bg-[#18181c] border border-white/5 rounded-2xl p-2.5 shrink-0 flex flex-col gap-1">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 px-1">Sentido da Frota</span>
              <div className="flex gap-2">
                  {[
                       { val: 'NORTE_SUL', label: 'Norte p/ Sul' },
                       { val: 'SUL_NORTE', label: 'Sul p/ Norte' }
                  ].map(a => (
                      <button
                         key={a.val}
                         onClick={() => { setDirection(a.val as Direction); setIsMoving(false); setResetKey(prev => prev + 1); }}
                         className={`flex-1 flex items-center justify-between p-2 rounded-xl border transition-all ${
                            direction === a.val 
                            ? 'bg-indigo-500/10 border-indigo-500/30 text-white' 
                            : 'bg-[#121217] border-white/5 text-slate-400'
                         }`}
                         style={{ borderWidth: 1 }}
                      >
                         <span className="text-[10px] font-bold">{a.label}</span>
                         <div className={`w-2.5 h-2.5 rounded-full border-[2.5px] ${direction === a.val ? 'border-indigo-400 bg-black' : 'border-slate-700 bg-transparent'}`} />
                      </button>
                  ))}
              </div>
          </div>

          {/* Spawn Origin Mobile */}
          {direction === 'SUL_NORTE' && (layoutType === 'oficina_central' || layoutType === 'abaixo_oficina' || layoutType === 'reclassificacao_02' || layoutType === 'passageiro_02' || layoutType === 'passageiro_01' || layoutType === 'patio_oficina' || layoutType === 'freio' || layoutType === 'oficina' || layoutType === 'reclassificacao') && (
             <div className="bg-[#18181c] border border-white/5 rounded-2xl p-2.5 shrink-0 flex flex-col gap-1">
                 <div className="flex justify-between items-center mb-1.5 px-1">
                   <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Linha de Origem</span>
                   <button
                     onClick={() => setIsAutoLineSelection(!isAutoLineSelection)}
                     className={`shrink-0 px-2 py-0.5 rounded-[4px] text-[8px] font-bold transition-all border ${isAutoLineSelection ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-[#222228] text-slate-500 border-white/5'}`}
                   >
                     {isAutoLineSelection ? 'AUTO ON' : 'AUTO OFF'}
                   </button>
                 </div>
                 <div className="flex flex-wrap gap-1.5">
                     {(layoutType === 'abaixo_oficina' ? [
                    { val: '166', label: '166' },
                    { val: '165', label: '165' },
                    { val: '164', label: '164' },
                    { val: '163', label: '163' },
                    { val: '162', label: '162' },
                    { val: '161', label: '161' },
                    { val: '160', label: '160' },
                    { val: '173', label: '173' }
                  ] : layoutType === 'reclassificacao_02' ? [
                    { val: '109', label: 'L-109' },
                    { val: '122', label: 'L-122' },
                    { val: '121', label: 'L-121' }
                  ] : layoutType === 'oficina_central' ? [
                    { val: '158', label: '158' },
                    { val: '160', label: '160' },
                    { val: '161', label: '161' },
                    { val: '162', label: '162' },
                    { val: '163', label: '163' },
                    { val: '164', label: '164' },
                    { val: '165', label: '165' }
                  ] : layoutType === 'passageiro_02' ? [
                    { val: 'TP05', label: 'TP-05' },
                    { val: 'TP04', label: 'TP-04' },
                    { val: 'TP3B', label: 'TP-3B' },
                    { val: 'TP2B', label: 'TP-2B' }
                  ] : layoutType === 'passageiro_01' ? [
                    { val: 'TP3A', label: 'TP-3A' },
                    { val: 'TP2A', label: 'TP-2A' },
                    { val: 'TP01', label: 'TP-01' }
                  ] : layoutType === 'patio_oficina' ? [
                    { val: '201A', label: '201A' },
                    { val: '32', label: 'L-32' },
                    { val: '28', label: 'L-28' },
                    { val: '31', label: 'L-31' },
                    { val: '27', label: 'L-27' }
                  ] : layoutType === 'freio' ? [
                          { val: '2', label: 'Linha 2' },
                          { val: '1', label: 'Linha 1' },
                          { val: '128', label: 'Linha 128' }
                     ] : layoutType === 'oficina' ? [
                          { val: '167', label: '167' },
                          { val: '166', label: '166' },
                          { val: '165', label: '165' },
                          { val: '152', label: '152 Reta' }
                     ] : [
                          { val: '107A', label: 'L-107A' },
                          { val: '106A', label: 'L-106A' },
                          { val: '105A', label: 'L-105A' }
                     ]).map(s => (
                         <button
                            key={s.val}
                            onClick={() => { setSpawnLine(s.val as SpawnLine); setIsMoving(false); setIsAutoLineSelection(false); setResetKey(prev => prev + 1); }}
                            className={`flex-1 min-w-[38px] p-2 rounded-xl border transition-all ${
                               spawnLine === s.val 
                               ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' 
                               : 'bg-[#121217] border-white/5 text-slate-400'
                            }`}
                            style={{ borderWidth: 1 }}
                         >
                            <span className="text-[10px] font-bold">{s.label}</span>
                         </button>
                     ))}
                 </div>
             </div>
          )}

          {/* Spawn Dest Mobile */}
          {direction === 'NORTE_SUL' && (layoutType === 'oficina_central' || layoutType === 'abaixo_oficina' || layoutType === 'reclassificacao_02' || layoutType === 'passageiro_02' || layoutType === 'passageiro_01' || layoutType === 'patio_oficina' || layoutType === 'freio' || layoutType === 'oficina' || layoutType === 'reclassificacao') && (
             <div className="bg-[#18181c] border border-white/5 rounded-2xl p-2.5 shrink-0 flex flex-col gap-1">
                 <div className="flex justify-between items-center mb-1.5 px-1">
                   <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Linha de Destino</span>
                   <button
                     onClick={() => setIsAutoLineSelection(!isAutoLineSelection)}
                     className={`shrink-0 px-2 py-0.5 rounded-[4px] text-[8px] font-bold transition-all border ${isAutoLineSelection ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-[#222228] text-slate-500 border-white/5'}`}
                   >
                     {isAutoLineSelection ? 'AUTO ON' : 'AUTO OFF'}
                   </button>
                 </div>
                 <div className="flex flex-wrap gap-1.5">
                     {(layoutType === 'abaixo_oficina' ? [
                    { val: '166', label: '166' },
                    { val: '165', label: '165' },
                    { val: '164', label: '164' },
                    { val: '163', label: '163' },
                    { val: '162', label: '162' },
                    { val: '161', label: '161' },
                    { val: '160', label: '160' },
                    { val: '173', label: '173' }
                  ] : layoutType === 'reclassificacao_02' ? [
                    { val: '109', label: 'L-109' },
                    { val: '122', label: 'L-122' },
                    { val: '121', label: 'L-121' }
                  ] : layoutType === 'oficina_central' ? [
                    { val: '158', label: '158' },
                    { val: '160', label: '160' },
                    { val: '161', label: '161' },
                    { val: '162', label: '162' },
                    { val: '163', label: '163' },
                    { val: '164', label: '164' },
                    { val: '165', label: '165' }
                  ] : layoutType === 'passageiro_02' ? [
                    { val: 'TP05', label: 'TP-05' },
                    { val: 'TP04', label: 'TP-04' },
                    { val: 'TP3B', label: 'TP-3B' },
                    { val: 'TP2B', label: 'TP-2B' }
                  ] : layoutType === 'passageiro_01' ? [
                    { val: 'TP3A', label: 'TP-3A' },
                    { val: 'TP2A', label: 'TP-2A' },
                    { val: 'TP01', label: 'TP-01' }
                  ] : layoutType === 'patio_oficina' ? [
                    { val: '201A', label: '201A' },
                    { val: '32', label: 'L-32' },
                    { val: '28', label: 'L-28' },
                    { val: '31', label: 'L-31' },
                    { val: '27', label: 'L-27' }
                  ] : layoutType === 'freio' ? [
                          { val: '2', label: 'Linha 2' },
                          { val: '1', label: 'Linha 1' },
                          { val: '128', label: 'Linha 128' }
                     ] : layoutType === 'oficina' ? [
                          { val: '167', label: '167' },
                          { val: '166', label: '166' },
                          { val: '165', label: '165' },
                          { val: '152', label: '152 Reta' }
                     ] : [
                          { val: '107A', label: 'L-107A' },
                          { val: '106A', label: 'L-106A' },
                          { val: '105A', label: 'L-105A' }
                     ]).map(s => (
                         <button
                            key={s.val}
                            onClick={() => { setDestLine(s.val as SpawnLine); if (layoutType === 'oficina_central' || layoutType === 'abaixo_oficina' || layoutType === 'passageiro_02' || layoutType === 'reclassificacao_02') { setSpawnLine(s.val as SpawnLine); setIsMoving(false); setResetKey(prev => prev + 1); } setIsAutoLineSelection(false); }}
                            className={`flex-1 min-w-[38px] p-2 rounded-xl border transition-all ${
                               destLine === s.val 
                               ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' 
                               : 'bg-[#121217] border-white/5 text-slate-400'
                            }`}
                            style={{ borderWidth: 1 }}
                         >
                            <span className="text-[10px] font-bold">{s.label}</span>
                         </button>
                     ))}
                 </div>
             </div>
          )}

          {/* Plate Colors Mobile Customizer */}
          <div className="bg-[#18181c] border border-white/5 rounded-2xl p-2.5 shrink-0 flex flex-col gap-2 mt-1">
             <div className="flex justify-between items-center px-1">
               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                 <Palette className="w-3 h-3 text-amber-400" /> Customizar Placas
               </span>
               <button 
                 onClick={() => setIsCustomizerOpen(true)}
                 className="px-2 py-0.5 rounded-[6px] bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[8.5px] font-bold flex items-center gap-1 active:scale-95"
               >
                 <SlidersHorizontal className="w-2.5 h-2.5 text-amber-400" />
                 Painel Completo
               </button>
             </div>

             {/* Live Preview Bar */}
             <div className="bg-[#121217] p-2 rounded-xl border border-white/5 flex items-center justify-between gap-2 shadow-inner">
                <div 
                  className="flex-1 h-8 rounded-lg flex items-center justify-center font-black text-xs tracking-wider shadow transition-all"
                  style={{
                    backgroundColor: plateColors.bg,
                    color: plateColors.text,
                  }}
                >
                  L-128
                </div>
                <button
                  onClick={handleSwapPlateColors}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 active:scale-95 transition-all"
                  title="Inverter cor da placa com cor da letra"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                </button>
             </div>

             {/* Quick Pickers Row */}
             <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                   <div className="flex justify-between items-center text-[9px]">
                      <span className="font-bold text-slate-300">Cor Placa</span>
                      <label className="relative cursor-pointer">
                        <input 
                          type="color" 
                          value={plateColors.bg.startsWith('#') && plateColors.bg.length === 7 ? plateColors.bg : '#ef0000'}
                          onChange={e => handleUpdatePlateBg(e.target.value)}
                          className="sr-only" 
                        />
                        <span className="text-[8px] font-mono text-indigo-400 font-bold hover:underline">Livre</span>
                      </label>
                   </div>
                   <div className="flex gap-1 overflow-x-auto pb-0.5">
                      {POPULAR_BG_COLORS.slice(0, 5).map(c => (
                        <button
                          key={c.hex}
                          onClick={() => handleUpdatePlateBg(c.hex)}
                          className={`w-6 h-6 rounded-md border shrink-0 transition-all ${plateColors.bg.toLowerCase() === c.hex.toLowerCase() ? 'border-white ring-1 ring-indigo-500 scale-105' : 'border-black/30'}`}
                          style={{ backgroundColor: c.hex }}
                          title={c.label}
                        />
                      ))}
                   </div>
                </div>

                <div className="flex flex-col gap-1">
                   <div className="flex justify-between items-center text-[9px]">
                      <span className="font-bold text-slate-300">Cor Letra</span>
                      <label className="relative cursor-pointer">
                        <input 
                          type="color" 
                          value={plateColors.text.startsWith('#') && plateColors.text.length === 7 ? plateColors.text : '#ffffff'}
                          onChange={e => handleUpdatePlateText(e.target.value)}
                          className="sr-only" 
                        />
                        <span className="text-[8px] font-mono text-indigo-400 font-bold hover:underline">Livre</span>
                      </label>
                   </div>
                   <div className="flex gap-1 overflow-x-auto pb-0.5">
                      {POPULAR_TEXT_COLORS.slice(0, 5).map(c => (
                        <button
                          key={c.hex}
                          onClick={() => handleUpdatePlateText(c.hex)}
                          className={`w-6 h-6 rounded-md border shrink-0 transition-all ${plateColors.text.toLowerCase() === c.hex.toLowerCase() ? 'border-white ring-1 ring-indigo-500 scale-105' : 'border-black/30'}`}
                          style={{ backgroundColor: c.hex }}
                          title={c.label}
                        />
                      ))}
                   </div>
                </div>
             </div>
          </div>
             </div>
          </div>
      </div>
    </div>
  );
}

