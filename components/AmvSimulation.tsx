import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, PerspectiveCamera, OrbitControls, MapControls, ContactShadows, Text, Box } from '@react-three/drei';
import * as THREE from 'three';
import { 
  ShieldCheck, AlertTriangle, Train, Power, Moon, Sun, 
  Video, LayoutDashboard, ArrowRightLeft, RadioReceiver, 
  Map as MapIcon, X, Compass, HelpCircle, Layers,
  ChevronDown, ChevronUp
} from 'lucide-react';

type Direction = 'NORTE_SUL' | 'SUL_NORTE';
type SwitchState = 'NORMAL' | 'REVERSO' | 'FALHA';
type CameraMode = 'ISOMETRIC' | 'TOP' | 'POV';
type SpawnLine = '128' | '1' | '2' | '166' | '167' | '152' | '105A' | '106A' | '107A' | '159' | '173' | '22A' | '23A' | '24A' | '201A' | '32' | '28' | '31' | '27' | 'P13A';

interface AmvSimulationProps {
  systemId: string;
  systemName: string;
  onClose: () => void;
  inlineMode?: boolean;
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
    <mesh position={[cx, cy, cz]} rotation={[0, angleY, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.08, 0.15, length]} />
      <meshStandardMaterial color={highlight ? "#6366f1" : "#71717a"} metalness={0.8} roughness={0.2} />
    </mesh>
  );
}

function AnimatedPoint({ hinge, tipTargetX, tipZ }: { hinge: [number, number, number], tipTargetX: number, tipZ: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    console.log(`AnimatedPoint [${hinge.join(',')}] tipTargetX changed to: ${tipTargetX}`);
  }, [tipTargetX, hinge]);

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
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <boxGeometry args={[0.06, 0.16, 1]} />
      <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.15} />
    </mesh>
  );
}

function TieBar({ getLeftTipX, getRightTipX, tipZ }: { getLeftTipX: () => number, getRightTipX: () => number, tipZ: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetX = useRef({ left: getLeftTipX(), right: getRightTipX() });

  useEffect(() => {
    targetX.current = { left: getLeftTipX(), right: getRightTipX() };
  }, [getLeftTipX, getRightTipX]);

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
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <boxGeometry args={[1, 0.04, 0.1]} />
      <meshStandardMaterial color="#ef4444" metalness={0.3} roughness={0.7} />
    </mesh>
  );
}

function SwitchMachine({ getLeftTipX, tipZ, isLeftSide = false, yellowOnly = false }: { getLeftTipX: () => number, tipZ: number, isLeftSide?: boolean, yellowOnly?: boolean }) {
  const machineRef = useRef<THREE.Group>(null);
  const rodRef = useRef<THREE.Mesh>(null);
  const leverRef = useRef<THREE.Group>(null);
  const flagMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const flagGroupRef = useRef<THREE.Group>(null);
  const targetX = useRef({ left: getLeftTipX() });
  
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
    
    const machineConnectX = isLeftSide ? -1.6 : 1.6;
    const tipConnectX = lx;
    const rodLen = Math.abs(machineConnectX - tipConnectX);
    const rodCx = (machineConnectX + tipConnectX) / 2;
    
    rodRef.current.position.set(rodCx, -0.05, 0);
    rodRef.current.scale.set(rodLen, 1, 1);
    
    const progress = (lx - (-0.8)) / 0.3; // 0 to 1
    leverRef.current.rotation.z = THREE.MathUtils.lerp(-Math.PI / 4, Math.PI / 4, Math.max(0, Math.min(1, progress)));

    if (flagGroupRef.current) {
      flagGroupRef.current.rotation.y = THREE.MathUtils.lerp(0, Math.PI, Math.max(0, Math.min(1, progress)));
    }

    if (flagMatRef.current) {
      const targetColor = yellowOnly ? '#eab308' : (progress < 0.5 ? '#22c55e' : '#eab308');
      flagMatRef.current.color.lerp(new THREE.Color(targetColor), 8 * delta);
    }
  });

  return (
    <group position={[0, 0, tipZ]}>
      <mesh ref={rodRef} receiveShadow castShadow>
        <boxGeometry args={[1, 0.05, 0.05]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} />
      </mesh>
      
      <group position={[isLeftSide ? -1.8 : 1.8, -0.1, 0]} ref={machineRef}>
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
            <meshStandardMaterial ref={flagMatRef} color="#22c55e" />
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
  if (z <= -5) return -5.0;
  const u = (25 - z) / 30; // 0 to 1
  return -5.0 * (3 * u ** 2 - 2 * u ** 3);
}

function getOficinaTrack2X(z: number) {
  if (z >= 5) return 0;
  if (z <= -15) return -2.5;
  const u = (5 - z) / 20; // 0 to 1
  return -2.5 * (3 * u ** 2 - 2 * u ** 3);
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

function Sleepers({ layoutType }: { layoutType: 'freio' | 'freio_02' | 'oficina' | 'reclassificacao' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default' }) {
  const sleepers = [];
  const tw = 1.9; // Sleeper width, leaves a visible 'entrevia' gap between parallel tracks
  
  if (layoutType === 'freio') {
    for (let z = 55; z > 18; z -= 0.6) {
      sleepers.push(<Box key={`m-${z}`} args={[tw, 0.1, 0.25]} position={[0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    for (let z = 18; z > -2; z -= 0.6) {
      const branchX = getFreioTrack1X(z);
      sleepers.push(<Box key={`m-${z}`} args={[tw, 0.1, 0.25]} position={[0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
      sleepers.push(<Box key={`amv1-${z}`} args={[tw, 0.1, 0.25]} position={[branchX, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    for (let z = -2; z > -22; z -= 0.6) {
      const branch2X = getFreioTrack2X(z);
      sleepers.push(<Box key={`m-${z}`} args={[tw, 0.1, 0.25]} position={[0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
      sleepers.push(<Box key={`amv1-${z}`} args={[tw, 0.1, 0.25]} position={[2.5, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
      sleepers.push(<Box key={`amv2-${z}`} args={[tw, 0.1, 0.25]} position={[branch2X, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    for (let z = -22; z >= -55; z -= 0.6) {
      sleepers.push(<Box key={`m-${z}`} args={[tw, 0.1, 0.25]} position={[0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
      sleepers.push(<Box key={`amv1-${z}`} args={[tw, 0.1, 0.25]} position={[2.5, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
      sleepers.push(<Box key={`amv2-${z}`} args={[tw, 0.1, 0.25]} position={[5.0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
  } else if (layoutType === 'freio_02') {
    for (let z = 55; z > 25; z -= 0.6) {
      sleepers.push(<Box key={`m-${z}`} args={[tw, 0.1, 0.25]} position={[0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    for (let z = 25; z > 10; z -= 0.6) {
      const leftX = getFreio02Track1X(z, 'L');
      const rightX = getFreio02Track1X(z, 'R');
      sleepers.push(<Box key={`L-${z}`} args={[tw, 0.1, 0.25]} position={[leftX, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
      sleepers.push(<Box key={`R-${z}`} args={[tw, 0.1, 0.25]} position={[rightX, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    for (let z = 10; z >= -55; z -= 0.6) {
      const l1 = z >= -2 ? getFreio02Track2X(z, 'L') : -3.0;
      const r1 = z >= -2 ? getFreio02Track2X(z, 'R') : -1.0;
      const l2 = z >= -2 ? getFreio02Track3X(z, 'L') : 1.0;
      const r2 = z >= -2 ? getFreio02Track3X(z, 'R') : 3.0;
      sleepers.push(<Box key={`L1-${z}`} args={[tw, 0.1, 0.25]} position={[l1, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
      sleepers.push(<Box key={`R1-${z}`} args={[tw, 0.1, 0.25]} position={[r1, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
      sleepers.push(<Box key={`L2-${z}`} args={[tw, 0.1, 0.25]} position={[l2, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
      sleepers.push(<Box key={`R2-${z}`} args={[tw, 0.1, 0.25]} position={[r2, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
  } else if (layoutType === 'oficina') {
    for (let z = 55; z >= -55; z -= 0.6) {
      sleepers.push(<Box key={`m-${z}`} args={[tw, 0.1, 0.25]} position={[0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    for (let z = 25; z >= -55; z -= 0.6) {
      const x = z >= -5 ? getOficinaTrack1X(z) : -5.0;
      sleepers.push(<Box key={`amv1-${z}`} args={[tw, 0.1, 0.25]} position={[x, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    for (let z = 5; z >= -55; z -= 0.6) {
      const x = z >= -15 ? getOficinaTrack2X(z) : -2.5;
      sleepers.push(<Box key={`amv2-${z}`} args={[tw, 0.1, 0.25]} position={[x, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
  } else if (layoutType === 'reclassificacao') {
    for (let z = 55; z >= -55; z -= 0.6) {
      sleepers.push(<Box key={`r-m-${z}`} args={[tw, 0.1, 0.25]} position={[0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    for (let z = 25; z >= -55; z -= 0.6) {
      const x = z >= 5 ? getReclassificacaoTrack1X(z) : -5.0;
      sleepers.push(<Box key={`r-amv1-${z}`} args={[tw, 0.1, 0.25]} position={[x, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    for (let z = 5; z >= -55; z -= 0.6) {
      const x = z >= -15 ? getReclassificacaoTrack2X(z) : -2.5;
      sleepers.push(<Box key={`r-amv2-${z}`} args={[tw, 0.1, 0.25]} position={[x, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
  } else if (layoutType === 'carga_geral_02') {
    // Main line (L-22A)
    for (let z = 55; z >= -55; z -= 0.6) {
      sleepers.push(<Box key={`cg-m-${z}`} args={[tw, 0.1, 0.25]} position={[0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    // Branch 1 (Auxiliar / L-24A)
    for (let z = 25; z >= -55; z -= 0.6) {
      const x = z >= 5 ? getCargaGeral02Track1X(z) : -5.0;
      sleepers.push(<Box key={`cg-amv1-${z}`} args={[tw, 0.1, 0.25]} position={[x, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    // Branch 2 (L-23A)
    for (let z = 10; z >= -55; z -= 0.6) {
      const x = z >= -10 ? getCargaGeral02Track2X(z) : -2.5;
      sleepers.push(<Box key={`cg-amv2-${z}`} args={[tw, 0.1, 0.25]} position={[x, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
  } else if (layoutType === 'pn_oficina') {
    // Main line (L-173) straight
    for (let z = 55; z >= -55; z -= 0.6) {
      sleepers.push(<Box key={`pno-m-${z}`} args={[tw, 0.1, 0.25]} position={[0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    // Branch (L-159) left
    for (let z = 5; z >= -55; z -= 0.6) {
      const x = z >= -15 ? getPnOficinaTrack1X(z) : -2.5;
      sleepers.push(<Box key={`pno-amv1-${z}`} args={[tw, 0.1, 0.25]} position={[x, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
  } else {
    for (let z = 55; z > 5; z -= 0.6) {
      sleepers.push(<Box key={`m-${z}`} args={[tw, 0.1, 0.25]} position={[0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
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
      sleepers.push(<Box key={`amv-${z}`} args={[width, 0.1, 0.25]} position={[cx, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
    for (let z = -10.6; z >= -55; z -= 0.6) {
      sleepers.push(<Box key={`m2-${z}`} args={[tw, 0.1, 0.25]} position={[0, -0.15, z]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
      const u = -z / 25;
      const branchCx = -3.4 * (u ** 3) + 2.6 * (u ** 2) + 5.0 * u + 1.0;
      const dxdz = (-10.2 * u * u + 5.2 * u + 5.0) / -25;
      sleepers.push(<Box key={`b-${z}`} args={[tw, 0.1, 0.25]} position={[branchCx, -0.15, z]} rotation={[0, Math.atan(dxdz), 0]} castShadow receiveShadow><meshStandardMaterial color="#3f3f46" roughness={0.9} /></Box>);
    }
  }
  
  return <group>{sleepers}</group>;
}

function LedFlow({ layoutType, direction, amvs, spawnLine, routeColor }: { layoutType: 'freio' | 'freio_02' | 'oficina' | 'reclassificacao' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default', direction: Direction, amvs: SwitchState[], spawnLine: SpawnLine, routeColor?: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const time = useRef(0);

  const numLeds = 80;
  
  const points = useMemo(() => {
    const pts = [];
    let prevPos: [number, number, number] | null = null;
    
    for (let i = 0; i <= numLeds; i++) {
      const progress = i / numLeds; // 0 to 1
      const res = getRoutePosRot(layoutType, direction, amvs, progress, 0, spawnLine);
      
      // Stop drawing LEDs if the physics engine clamped the train (derailment/collision)
      if (prevPos) {
        const distSq = (res.pos[0] - prevPos[0])**2 + (res.pos[2] - prevPos[2])**2;
        if (distSq < 0.0001) {
          break; // Avoid overlapping all remaining LEDs in the same clamped spot!
        }
      }
      prevPos = [...res.pos] as [number, number, number];

      const angle = res.rot[1];
      const dx = Math.cos(angle) * 0.8;
      const dz = -Math.sin(angle) * 0.8;

      pts.push({ x: res.pos[0] - dx, y: 0.01, z: res.pos[2] - dz, progress, side: 'L', color: res.color });
      pts.push({ x: res.pos[0] + dx, y: 0.01, z: res.pos[2] + dz, progress, side: 'R', color: res.color });
    }
    return pts;
  }, [layoutType, direction, amvs, spawnLine]);

  useFrame((state, delta) => {
    time.current += delta * 1.5;
    if (groupRef.current) {
      groupRef.current.children.forEach((mesh, index) => {
         const pt = points[index];
         if (!pt) return;
         
         const z = pt.z;
         const material = (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
         
         const speed = direction === 'NORTE_SUL' ? time.current * -12 : time.current * 12;
         const wave = Math.sin(z * 0.5 - speed) * 0.5 + 0.5; 
         
         // Smooth wave pulse instead of binary on/off for better fluidity
         material.emissiveIntensity = wave > 0.4 ? (wave - 0.4) * 5.0 : 0.0;
      });
    }
  });

  return (
    <group ref={groupRef}>
      {points.map((pt, i) => (
        <mesh key={`led-${direction}-${i}`} position={[pt.x, pt.y, pt.z]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.2, 0.02, 0.2]} />
          <meshStandardMaterial color="#111" emissive={routeColor === '#ef4444' ? '#ef4444' : pt.color} emissiveIntensity={0} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function CurveBranch({ layoutType }: { layoutType: 'freio' | 'freio_02' | 'oficina' | 'reclassificacao' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default' }) {
  const segments = 25;
  const rails = [];
  
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
    // Oficina Layout Rails (2 AMVs branching left)
    // -----------------------------------------------------
    
    // Main line (straight from 55 to -55)
    // Left rail has gaps for the AMV closure rails!
    rails.push(<RailSegment key="m-L-pre1" start={[-0.8, 0, 55]} end={[-0.8, 0, 25]} />);
    rails.push(<RailSegment key="m-L-mid" start={[-0.8, 0, 20]} end={[-0.8, 0, 5]} />);
    rails.push(<RailSegment key="m-L-post2" start={[-0.8, 0, 0]} end={[-0.8, 0, -55]} />);

    // Right rail is continuous (stock rail)
    rails.push(<RailSegment key="m-R" start={[0.8, 0, 55]} end={[0.8, 0, -55]} />);

    // Branch 1 (L-167) - Left stock rail curves from 25 to -5. Right closure rail starts at 20.
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      const z1_L = 25 - 30 * u1;
      const z2_L = 25 - 30 * u2;
      const x1_L = getOficinaTrack1X(z1_L);
      const x2_L = getOficinaTrack1X(z2_L);
      rails.push(<RailSegment key={`of-1-L-${i}`} start={[x1_L - 0.8, 0, z1_L]} end={[x2_L - 0.8, 0, z2_L]} />);

      const z1_R = 20 - 25 * u1;
      const z2_R = 20 - 25 * u2;
      const x1_R = getOficinaTrack1X(z1_R);
      const x2_R = getOficinaTrack1X(z2_R);
      rails.push(<RailSegment key={`of-1-R-${i}`} start={[x1_R + 0.8, 0, z1_R]} end={[x2_R + 0.8, 0, z2_R]} />);
    }
    // L-167 straight segment after branch
    rails.push(<RailSegment key="of-1-str-L" start={[-5.0 - 0.8, 0, -5]} end={[-5.0 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="of-1-str-R" start={[-5.0 + 0.8, 0, -5]} end={[-5.0 + 0.8, 0, -55]} />);

    // Branch 2 (L-166) - Left stock rail curves from 5 to -15. Right closure rail starts at 0.
    for (let i = 0; i < segments; i++) {
      const u1 = i / segments;
      const u2 = (i + 1) / segments;
      const z1_L = 5 - 20 * u1;
      const z2_L = 5 - 20 * u2;
      const x1_L = getOficinaTrack2X(z1_L);
      const x2_L = getOficinaTrack2X(z2_L);
      rails.push(<RailSegment key={`of-2-L-${i}`} start={[x1_L - 0.8, 0, z1_L]} end={[x2_L - 0.8, 0, z2_L]} />);

      const z1_R = 0 - 15 * u1;
      const z2_R = 0 - 15 * u2;
      const x1_R = getOficinaTrack2X(z1_R);
      const x2_R = getOficinaTrack2X(z2_R);
      rails.push(<RailSegment key={`of-2-R-${i}`} start={[x1_R + 0.8, 0, z1_R]} end={[x2_R + 0.8, 0, z2_R]} />);
    }
    // L-166 straight segment after branch
    rails.push(<RailSegment key="of-2-str-L" start={[-2.5 - 0.8, 0, -15]} end={[-2.5 - 0.8, 0, -55]} />);
    rails.push(<RailSegment key="of-2-str-R" start={[-2.5 + 0.8, 0, -15]} end={[-2.5 + 0.8, 0, -55]} />);

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
  
  return <group>{rails}</group>;
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
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.15, 4.4]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
      </mesh>
      
      {/* Couplings */}
      <mesh position={[0, 0.45, 2.3]} castShadow>
        <boxGeometry args={[0.3, 0.1, 0.4]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.45, -2.3]} castShadow>
        <boxGeometry args={[0.3, 0.1, 0.4]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Cargo Body */}
      {type === 'tank' ? (
        <group position={[0, 1.15, 0]}>
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
        <group position={[0, 1.2, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.3, 1.3, 4.0]} />
            <meshStandardMaterial color={color} metalness={0.2} roughness={0.7} />
          </mesh>
          {[-1.6, -1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2, 1.6].map((z, idx) => (
            <mesh key={idx} position={[0, 0, z]} castShadow>
              <boxGeometry args={[1.34, 1.28, 0.1]} />
              <meshStandardMaterial color={color} metalness={0.1} roughness={0.8} />
            </mesh>
          ))}
          <mesh castShadow>
            <boxGeometry args={[1.32, 1.32, 4.04]} />
            <meshStandardMaterial color="#27272a" wireframe={true} />
          </mesh>
        </group>
      )}

      {/* Wheels / Bogies */}
      {[-1.3, 1.3].map((zPos, bIdx) => (
        <group key={bIdx} position={[0, 0.25, zPos]}>
          <mesh castShadow>
            <boxGeometry args={[1.1, 0.1, 0.9]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} />
          </mesh>
          {[-0.3, 0.3].map((axleZ, aIdx) => (
            <group key={aIdx} position={[0, 0, axleZ]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.04, 0.04, 1.1, 8]} />
                <meshStandardMaterial color="#475569" metalness={0.8} />
              </mesh>
              {[-0.55, 0.55].map((wheelX, wIdx) => (
                <mesh key={wIdx} position={[wheelX, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.25, 0.25, 0.1, 16]} />
                  <meshStandardMaterial color="#0f172a" metalness={0.8} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function Locomotive3D({ position, rotation, visible = true, nightMode }: { position: [number, number, number], rotation: [number, number, number], visible?: boolean, nightMode?: boolean }) {
  if (!visible) return null;
  const lightTargetRef = useRef<THREE.Group>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[2.0, 0.2, 5]} />
        <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.4, 0.5]} castShadow>
        <boxGeometry args={[1.6, 1.6, 3.8]} />
        <meshStandardMaterial color="#0284c7" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.7, -1.8]} castShadow>
        <boxGeometry args={[1.6, 2.2, 0.8]} />
        <meshStandardMaterial color="#0369a1" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 2.85, -1.8]} castShadow>
        <boxGeometry args={[1.7, 0.1, 0.9]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.2} roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.3, -1.38]} castShadow>
        <boxGeometry args={[1.4, 0.4, 0.05]} />
        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0.81, 2.3, -1.8]} castShadow>
        <boxGeometry args={[0.05, 0.4, 0.6]} />
        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[-0.81, 2.3, -1.8]} castShadow>
        <boxGeometry args={[0.05, 0.4, 0.6]} />
        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
      </mesh>
      {[0.8, -0.8].map((x, i) => (
        <group key={`front-${i}`}>
          <mesh position={[x, 0.25, 1.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.25, 0.25, 0.15, 16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} />
          </mesh>
          <mesh position={[x, 0.25, 0.7]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.25, 0.25, 0.15, 16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} />
          </mesh>
        </group>
      ))}
      {[0.8, -0.8].map((x, i) => (
        <group key={`rear-${i}`}>
          <mesh position={[x, 0.25, -0.7]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.25, 0.25, 0.15, 16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} />
          </mesh>
          <mesh position={[x, 0.25, -1.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.25, 0.25, 0.15, 16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} />
          </mesh>
        </group>
      ))}
      <mesh position={[-0.45, 1.2, 2.45]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 16]} />
        <meshStandardMaterial color="#fef08a" emissive="#facc15" emissiveIntensity={nightMode ? 8 : 2} />
      </mesh>
      <mesh position={[0.45, 1.2, 2.45]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 16]} />
        <meshStandardMaterial color="#fef08a" emissive="#facc15" emissiveIntensity={nightMode ? 8 : 2} />
      </mesh>
      <mesh position={[0, 1.0, 2.41]} castShadow>
        <boxGeometry args={[1.7, 0.4, 0.05]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.2} roughness={0.6} />
      </mesh>

      {nightMode && mounted && (
        <>
          <group ref={lightTargetRef} position={[0, 1.2, 20]} />
          <spotLight
            position={[0, 1.2, 2.5]}
            target={lightTargetRef.current || undefined}
            angle={Math.PI / 5}
            penumbra={0.6}
            intensity={25}
            distance={50}
            castShadow
            shadow-mapSize={[1024, 1024]}
            color="#fffbeb"
          />
          <pointLight position={[0, 1.2, 2.6]} intensity={3} distance={6} color="#fef08a" />
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------
// HIGH FIDELITY LAYOUTS DEFINITION
// ---------------------------------------------------------

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

      {/* Trilhos livres, sem vagões estacionados */}


      {/* AMV 2 (65A) - Background (z = -2) na Segunda Linha (x = 2.5) */}
      <group 
        position={[2.5, 0, -2]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint hinge={[-0.41, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint hinge={[0.8, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} yellowOnly={true} />
        
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
        <AnimatedPoint hinge={[-0.41, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint hinge={[0.8, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} />
        
        <Text position={[-4, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.6} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1
        </Text>
      </group>
      
      <FrogInfo x={0.8} z={10} />
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

      {/* Trilhos livres nas vias secundárias */}


      {/* AMV 1 - Agulha 02 (z = 22, x = 0) */}
      <group 
        position={[0, 0, 22]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint hinge={[-0.4, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint hinge={[0.4, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
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
        <AnimatedPoint hinge={[-0.4, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint hinge={[0.4, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
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
        <AnimatedPoint hinge={[-0.4, 0, -5]} tipTargetX={getTips3().left} tipZ={0} />
        <AnimatedPoint hinge={[0.4, 0, -5]} tipTargetX={getTips3().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips3().left} getRightTipX={() => getTips3().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips3().left} tipZ={0} isLeftSide={false} />
        
        <Text position={[3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.4} color={selectedAmv === 2 ? "#818cf8" : "#64748b"}>
          AMV 128 (3)
        </Text>
      </group>

      <FrogInfo x={1.5} z={-2} />
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

  return (
    <group>
      <CurveBranch layoutType="oficina" />
      <Sleepers layoutType="oficina" />

      {/* AMV 1 - L-167 (z = 25, x = 0) */}
      <group 
        position={[0, 0, 25]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(0); onToggleAmv(0); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint hinge={[0.43, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={true} />
        
        <Text position={[3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.4} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1 (167)
        </Text>
      </group>

      <FrogInfo x={-1.5} z={18} />

      {/* AMV 2 - L-166 (z = 5, x = 0) */}
      <group 
        position={[0, 0, 5]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint hinge={[-0.8, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint hinge={[0.41, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={true} />
        
        <Text position={[3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.4} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2 (166)
        </Text>
      </group>

      <FrogInfo x={-1.5} z={-2} />
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
        <AnimatedPoint hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint hinge={[0.02, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
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
        <AnimatedPoint hinge={[-0.41, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint hinge={[0.8, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={false} />
        
        <Text position={[-3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.4} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2
        </Text>
      </group>

      <FrogInfo x={-3.5} z={-2} />
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
          <mesh key={`pn-plank-${i}`} position={[0, 0, -i * 0.8 + 2]} castShadow receiveShadow>
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
        <AnimatedPoint hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint hinge={[0.41, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={false} />
        
        <Text position={[3.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.4} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1
        </Text>
      </group>

      <FrogInfo x={-0.8} z={-2} />
      
      <Text position={[-5.5, 0.1, -20]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={2} color="#cbd5e1">
        L-159
      </Text>
      
      <Text position={[2.5, 0.1, -20]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={2} color="#cbd5e1">
        L-173
      </Text>
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
        <AnimatedPoint hinge={[-0.8, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint hinge={[0.8, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
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
        <AnimatedPoint hinge={[-0.8, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint hinge={[0.8, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} />
        <Text position={[-3, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} scale={[-1, 1, 1]} fontSize={2} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2
        </Text>
      </group>

      <FrogInfo x={-0.8} z={-22} />
    </group>
  );
}

// ---------------------------------------------------------
// SAFETY LOGIC & DIAGNOSIS
// ---------------------------------------------------------

function getSafetyStatus(layoutType: 'freio' | 'freio_02' | 'oficina' | 'reclassificacao' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default', direction: Direction, amvs: SwitchState[], spawnLine: SpawnLine = '128', destLine: SpawnLine = '128') {
  const amv1 = amvs[0];
  const amv2 = amvs[1];

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
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 1.' };
      
      if (destLine === '167') {
        if (amv1 !== 'REVERSO') {
          return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá em frente ao invés de entrar na Linha 167.' };
        }
        return { status: 'ROTA SEGURA (LINHA 167)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha 167.' };
      }
      
      if (destLine === '166') {
        if (amv1 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na 167 ao invés de prosseguir para a 166.' };
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 2.' };
        if (amv2 !== 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem seguirá direto para 152 ao invés de entrar na 166.' };
        
        return { status: 'ROTA SEGURA (LINHA 166)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para a Linha 166.' };
      }
      
      if (destLine === '152') {
        if (amv1 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na 167 ao invés de seguir na reta.' };
        if (amv2 === 'FALHA') return { status: 'PERIGO CRÍTICO (FALHA AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Descarrilamento no AMV 2.' };
        if (amv2 === 'REVERSO') return { status: 'ROTA INCORRETA', bg: 'bg-orange-500/10 border-orange-500/30', color: 'text-orange-400', icon: <MapIcon className="w-8 h-8 text-orange-400" />, desc: 'Destino incorreto! O trem entrará na 166 ao invés de seguir na reta.' };
        
        return { status: 'ROTA SEGURA (152 TRAVESSÕES)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Rota alinhada corretamente para 152 travessões.' };
      }
    } else {
      if (spawnLine === '167') {
        if (amv1 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha 167 talonará o AMV 1 se não estiver Reverso.' };
      } else if (spawnLine === '166') {
        if (amv2 !== 'REVERSO') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha 166 talonará o AMV 2 se não estiver Reverso.' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem saindo da Linha 166 talonará o AMV 1 se não estiver Normal.' };
      } else {
        if (amv2 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 2)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem na 152 travessões talonará o AMV 2 se não estiver Normal.' };
        if (amv1 !== 'NORMAL') return { status: 'PERIGO CRÍTICO (VIOLAÇÃO AMV 1)', bg: 'bg-red-500/10 border-red-500/20', color: 'text-red-500', icon: <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />, desc: 'Trem na 152 travessões talonará o AMV 1 se não estiver Normal.' };
      }
      return { status: 'ROTA SEGURA (SAÍDA)', bg: 'bg-emerald-500/10 border-emerald-500/20', color: 'text-emerald-500', icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />, desc: 'Saída da oficina alinhada com segurança.' };
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
  layoutType: 'freio' | 'freio_02' | 'oficina' | 'reclassificacao' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default',
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


  if (layoutType === 'patio_oficina') {
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
    // ------------------ 2 AMVs LAYOUT (oficina) ------------------
    if (direction === 'NORTE_SUL') {
      if (amv1 === 'FALHA' && tz <= (25 + carIndex * 5.5) && tz >= -5) {
        const clampZ = 24 + carIndex * 5.5;
        if (tz <= clampZ + 2) ledColor = '#ef4444';
        tz = Math.max(tz, clampZ);
        const isDerailed = tz === clampZ;
        if (isDerailed) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
      } else if (amv1 === 'REVERSO') {
        if (tz <= (25 + carIndex * 5.5)) ledColor = '#fbbf24';
        if (tz <= (25 + carIndex * 5.5) && tz >= -5) {
          x = getOficinaTrack1X(tz);
          const nextX = getOficinaTrack1X(tz - 0.1);
          rotY = Math.atan2(nextX - x, -0.1);
        } else if (tz < -5) {
          x = -5.0;
        }
      } else {
        // amv1 is NORMAL, so train stays on main line
        if (amv2 === 'FALHA' && tz <= (5 + carIndex * 5.5) && tz >= -15) {
          const clampZ = 4 + carIndex * 5.5;
          if (tz <= clampZ + 2) ledColor = '#ef4444';
          tz = Math.max(tz, clampZ);
          const isDerailed = tz === clampZ;
          if (isDerailed) { x = -0.5; rotX = 0.1; rotY += 0.25; rotZ = 0.25; }
        } else if (amv2 === 'REVERSO') {
          if (tz <= (5 + carIndex * 5.5)) ledColor = '#fbbf24';
          if (tz <= (5 + carIndex * 5.5) && tz >= -15) {
            x = getOficinaTrack2X(tz);
            const nextX = getOficinaTrack2X(tz - 0.1);
            rotY = Math.atan2(nextX - x, -0.1);
          } else if (tz < -15) {
            x = -2.5;
          }
        }
      }
    } else {
       // SUL_NORTE (spawnLine dictates path)
       let maxZ = 100;
       if (spawnLine === '167') {
         if (amv1 !== 'REVERSO') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       } else if (spawnLine === '166') {
         if (amv2 !== 'REVERSO') maxZ = Math.min(maxZ, 4 - carIndex * 5.5);
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       } else { // Sopro
         if (amv2 !== 'NORMAL') maxZ = Math.min(maxZ, 4 - carIndex * 5.5);
         if (amv1 !== 'NORMAL') maxZ = Math.min(maxZ, 24 - carIndex * 5.5);
       }
       
       const isApproaching = tz >= maxZ - 2;
       if (isApproaching && maxZ < 100) ledColor = '#ef4444';
       const isDerailed = tz >= maxZ;
       tz = Math.min(tz, maxZ);
       
       if (spawnLine === '167') {
         x = -5.0;
         if (tz >= -5 && tz <= 25) {
           x = getOficinaTrack1X(tz);
           const nextX = getOficinaTrack1X(tz + 0.1);
           rotY = Math.atan2(nextX - x, 0.1);
         } else if (tz > 25) {
           x = 0;
         }
       } else if (spawnLine === '166') {
         x = -2.5;
         if (tz >= -15 && tz <= 5) {
           x = getOficinaTrack2X(tz);
           const nextX = getOficinaTrack2X(tz + 0.1);
           rotY = Math.atan2(nextX - x, 0.1);
         } else if (tz > 5) {
           x = 0;
         }
       } else {
         // Main line (Sopro)
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

function TrainGroup({
  layoutType,
  direction,
  amvs,
  cameraMode,
  isMoving,
  nightMode,
  spawnLine,
  destLine
}: {
  layoutType: 'freio' | 'freio_02' | 'oficina' | 'reclassificacao' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default',
  direction: Direction,
  amvs: SwitchState[],
  cameraMode: CameraMode,
  isMoving: boolean,
  nightMode: boolean,
  spawnLine: SpawnLine,
  destLine: SpawnLine
}) {
  const locoRef = useRef<THREE.Group>(null);
  const progressRef = useRef(0);
  
  useEffect(() => {
    if (!isMoving) {
      progressRef.current = 0;
    }
  }, [isMoving, direction, amvs]);

  useFrame((state, delta) => {
    if (isMoving) {
      progressRef.current += delta * 0.05; // 20 seconds to cross
      if (progressRef.current > 1) progressRef.current = 1;
    } else {
      progressRef.current = 0;
    }

    // Locomotive
    const pLoco = progressRef.current;
    const { pos: posLoco, rot: rotLoco } = getRoutePosRot(layoutType, direction, amvs, pLoco, 0, spawnLine);
    if (locoRef.current) {
      locoRef.current.position.set(posLoco[0], posLoco[1], posLoco[2]);
      locoRef.current.rotation.set(rotLoco[0], rotLoco[1], rotLoco[2]);
    }
  });

  const initial = getRoutePosRot(layoutType, direction, amvs, 0, 0, spawnLine);

  return (
    <group>
      <group ref={locoRef} position={initial.pos as any} rotation={initial.rot as any}>
        <Locomotive3D position={[0, -0.35, 0]} rotation={[0, 0, 0]} visible={true} nightMode={nightMode} />
        
        {cameraMode === 'POV' && <PovCamera />}
      </group>
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
        <AnimatedPoint hinge={[-0.4, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint hinge={[0.4, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={true} />
        
        <Text position={[3, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.5} color={selectedAmv === 0 ? "#818cf8" : "#64748b"}>
          AMV 1
        </Text>
      </group>

      <FrogInfo x={0} z={18} />

      {/* AMV 2 - (z = 10, x = 0) Branches left to 23A */}
      <group 
        position={[0, 0, 10]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint hinge={[-0.4, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint hinge={[0.4, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={true} />
        
        <Text position={[3, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={1.4} color={selectedAmv === 1 ? "#818cf8" : "#64748b"}>
          AMV 2
        </Text>
      </group>

      <FrogInfo x={0} z={3} />
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
        <AnimatedPoint hinge={[-0.4, 0, -5]} tipTargetX={getTips1().left} tipZ={0} />
        <AnimatedPoint hinge={[0.4, 0, -5]} tipTargetX={getTips1().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips1().left} getRightTipX={() => getTips1().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips1().left} tipZ={0} isLeftSide={false} />
      </group>

      {/* AMV 2 - (z = 0, Branches Left to L-31) */}
      <group 
        position={[0, 0, 0]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(1); onToggleAmv(1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint hinge={[-0.4, 0, -5]} tipTargetX={getTips2().left} tipZ={0} />
        <AnimatedPoint hinge={[0.4, 0, -5]} tipTargetX={getTips2().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips2().left} getRightTipX={() => getTips2().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips2().left} tipZ={0} isLeftSide={true} />
      </group>

      {/* AMV 3 - (z = -20, Branches Left to L-27) */}
      <group 
        position={[0, 0, -20]} 
        onClick={(e) => { e.stopPropagation(); onSelectAmv(2); onToggleAmv(2); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <AnimatedPoint hinge={[-0.4, 0, -5]} tipTargetX={getTips3().left} tipZ={0} />
        <AnimatedPoint hinge={[0.4, 0, -5]} tipTargetX={getTips3().right} tipZ={0} />
        <TieBar getLeftTipX={() => getTips3().left} getRightTipX={() => getTips3().right} tipZ={0} />
        <SwitchMachine getLeftTipX={() => getTips3().left} tipZ={0} isLeftSide={true} />
      </group>

      {/* 7 Satellites (Texts) */}
      <Text position={[0, 1.5, 40]} rotation={[-Math.PI / 4, 0, 0]} fontSize={2.5} color="#ef4444" outlineWidth={0.1} outlineColor="#000">L-201A</Text>
      <Text position={[0, 1.5, -40]} rotation={[-Math.PI / 4, 0, 0]} fontSize={2.5} color="#ef4444" outlineWidth={0.1} outlineColor="#000">L-32</Text>
      <Text position={[5, 1.5, 0]} rotation={[-Math.PI / 4, 0, 0]} fontSize={2.5} color="#ef4444" outlineWidth={0.1} outlineColor="#000">L-28</Text>
      <Text position={[-5, 1.5, -20]} rotation={[-Math.PI / 4, 0, 0]} fontSize={2.5} color="#ef4444" outlineWidth={0.1} outlineColor="#000">L-31</Text>
      <Text position={[-5, 2.5, -20]} rotation={[-Math.PI / 4, 0, 0]} fontSize={1.2} color="#fbbf24" outlineWidth={0.05} outlineColor="#000">LINHA DA CARGA GERAL</Text>
      <Text position={[-5, 1.5, -40]} rotation={[-Math.PI / 4, 0, 0]} fontSize={2.5} color="#ef4444" outlineWidth={0.1} outlineColor="#000">L-27</Text>
      <Text position={[-10, 1.5, -40]} rotation={[-Math.PI / 4, 0, 0]} fontSize={2.5} color="#ef4444" outlineWidth={0.1} outlineColor="#000">L-P13A</Text>
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
  const [amvs, setAmvs] = useState<SwitchState[]>(['NORMAL', 'NORMAL', 'NORMAL']);
  const [spawnLine, setSpawnLine] = useState<SpawnLine>('128');
  const [destLine, setDestLine] = useState<SpawnLine>('128');
  const [selectedAmv, setSelectedAmv] = useState<number>(0);
  const [cameraMode, setCameraMode] = useState<CameraMode>('ISOMETRIC');
  const [isMoving, setIsMoving] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [isAutoLineSelection, setIsAutoLineSelection] = useState(true);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(true);

  const baseLayout = systemName?.includes('PIAL X OFICINA') ? 'patio_oficina' : systemId === 'watchSystem9' ? 'pn_oficina' : systemId === 'watchSystem8' ? 'carga_geral_02' : systemId === 'watchSystem7' ? 'reclassificacao' : systemId === 'watchSystem4' ? 'oficina' : (systemId === 'watchSystem5' || systemId === 'watchSystem3') ? 'freio' : 'default';
  const layoutType = baseLayout as 'freio' | 'freio_02' | 'oficina' | 'reclassificacao' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default' | 'pn_oficina' | 'carga_geral_02' | 'patio_oficina' | 'default';

  useEffect(() => {
    if (!isAutoLineSelection) return;
    const amv1 = amvs[0];
    const amv2 = amvs[1];
    let expectedLine: SpawnLine = '128';

    if (layoutType === 'oficina') {
      if (amv1 === 'NORMAL') expectedLine = '152';
      else if (amv2 === 'REVERSO') expectedLine = '166';
      else expectedLine = '167';
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
  }, [amvs, direction, layoutType, isAutoLineSelection]);

  useEffect(() => {
    if (layoutType === 'oficina') {
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
    setAmvs(['NORMAL', 'NORMAL', 'NORMAL']);
    setIsMoving(false);
  }, [layoutType]);

  const safety = getSafetyStatus(layoutType, direction, amvs, spawnLine, destLine);

  const updateAmvState = (state: SwitchState) => {
    const newAmvs = [...amvs];
    newAmvs[selectedAmv] = state;
    setAmvs(newAmvs);
    setIsMoving(false);
  };

  const handleToggleAmv = (index: number) => {
    console.log(`AMV CLICKED: ${index}, current: ${amvs[index]}`);
    const currentState = amvs[index];
    const nextState = currentState === 'NORMAL' ? 'REVERSO' : 'NORMAL';
    const newAmvs = [...amvs];
    newAmvs[index] = nextState;
    setAmvs(newAmvs);
    setIsMoving(false);
  };

  const NavItem = ({ active, icon }: { active?: boolean, icon: React.ReactNode }) => (
    <button className={`w-12 h-12 rounded-[18px] flex items-center justify-center transition-all duration-300 ${
      active 
        ? 'bg-indigo-500/20 text-indigo-400 shadow-[inset_0_0_12px_rgba(99,102,241,0.2)] border border-indigo-500/30' 
        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
    }`}>
       {icon}
    </button>
  );

  return (
    <div className={`${inlineMode ? 'absolute inset-0 z-[1000] rounded-lg' : 'fixed top-0 left-0 w-full h-[100svh] z-[10000]'} flex flex-col lg:flex-row bg-[#0a0a0c] text-slate-200 overflow-hidden font-sans select-none animate-cinematic`}>
      

      {/* MAIN SIMULATOR VIEW */}
      <div className="flex-1 lg:flex-1 flex flex-col relative overflow-hidden bg-[#0a0a0c] shrink-0 min-h-[30svh]">
         
         {/* TOP CONTROL BAR */}
         <header className="absolute top-12 left-4 right-4 lg:top-6 lg:left-8 lg:right-8 z-10 flex justify-center items-start pointer-events-none">

            {/* Camera Controls & Mobile Close Button */}
            <div className="flex items-center gap-3">
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

         {/* 3D SCENE CANVAS */}
         <div className="flex-1 w-full h-full relative z-0">
            <Canvas shadows={{ type: THREE.PCFShadowMap as any }} camera={{ position: [20, 35, 15], fov: 40 }}>
              {cameraMode === 'ISOMETRIC' && (
                <>
                  <PerspectiveCamera makeDefault position={[20, 35, 15]} fov={40} />
                  <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2 - 0.1} target={[0, 0, 0]} />
                </>
              )}
              {cameraMode === 'TOP' && (
                <>
                  <PerspectiveCamera makeDefault position={[0, 60, 0.01]} />
                  <MapControls makeDefault enableDamping enableRotate={false} target={[0, 0, 0]} />
                </>
              )}

              <color attach="background" args={[nightMode ? '#040406' : '#0a0a0c']} />
              <ambientLight intensity={nightMode ? 0.05 : 0.5} />
              <directionalLight castShadow position={[10, 30, 10]} intensity={nightMode ? 0.15 : 1.2} shadow-mapSize={[2048, 2048]} />
              <Environment preset="city" />

              <gridHelper 
                args={[200, 100, nightMode ? "#4f46e5" : "#71717a", nightMode ? "#1e1b4b" : "#27272a"]} 
                position={[0, -0.19, 0]} 
              />
              <ContactShadows position={[0, -0.2, 0]} opacity={nightMode ? 0.4 : 0.8} scale={100} blur={2} />

              {layoutType === 'reclassificacao' ? (
                <ReclassificacaoAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
              ) : layoutType === 'pn_oficina' ? (
                <PnOficinaAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
              ) : layoutType === 'carga_geral_02' ? (
                <CargaGeral02AmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
              ) : layoutType === 'oficina' ? (
                <OficinaAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
              ) : layoutType === 'freio_02' ? (
                <Freio02AmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
              ) : layoutType === 'freio' ? (
                <FreioAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
              ) : (
                <DoubleAmvScene amvs={amvs} selectedAmv={selectedAmv} onSelectAmv={setSelectedAmv} onToggleAmv={handleToggleAmv} />
              )}

              <LedFlow layoutType={layoutType} direction={direction} amvs={amvs} spawnLine={spawnLine} routeColor={safety?.status.includes('PERIGO') ? '#ef4444' : amvs[0] === 'NORMAL' ? '#10b981' : '#fbbf24'} />

              <TrainGroup 
                layoutType={layoutType}
                direction={direction} 
                amvs={amvs} 
                cameraMode={cameraMode} 
                isMoving={isMoving} 
                nightMode={nightMode}
                spawnLine={spawnLine}
                destLine={destLine}
              />
            </Canvas>
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
                          <div className={`flex flex-col items-center bg-[#0a0a0c]/80 border ${selectedAmv === 0 ? 'border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'border-white/5'} px-3 py-1.5 rounded-xl cursor-pointer hover:border-indigo-500/30 transition-all`} onClick={() => setSelectedAmv(0)}>
                              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">{layoutType === 'freio' ? 'AMV 1' : 'AMV 1'}</span>
                              <span className={`text-[10px] font-black leading-none ${amvs[0] === 'NORMAL' ? 'text-emerald-400' : (amvs[0] === 'REVERSO' ? 'text-yellow-400' : 'text-red-500')}`}>{amvs[0] === 'NORMAL' ? 'RETA' : (amvs[0] === 'REVERSO' ? 'REVERSA' : 'AMV CONTRA')}</span>
                          </div>
                          {layoutType !== 'pn_oficina' && (
                            <div className={`flex flex-col items-center bg-[#0a0a0c]/80 border ${selectedAmv === 1 ? 'border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'border-white/5'} px-3 py-1.5 rounded-xl cursor-pointer hover:border-indigo-500/30 transition-all`} onClick={() => setSelectedAmv(1)}>
                                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">{layoutType === 'freio' ? 'AMV 2' : 'AMV 2'}</span>
                                <span className={`text-[10px] font-black leading-none ${amvs[1] === 'NORMAL' ? 'text-emerald-400' : (amvs[1] === 'REVERSO' ? 'text-yellow-400' : 'text-red-500')}`}>{amvs[1] === 'NORMAL' ? 'RETA' : (amvs[1] === 'REVERSO' ? 'REVERSA' : 'AMV CONTRA')}</span>
                            </div>
                          )}
                        </>
                      )}
                  </div>
               </div>
            </div>
         </div>
      </div>

      {/* RIGHT SIDEBAR (Control Cards - Desktop) */}
      <aside className="hidden lg:flex w-[280px] h-full bg-[#121217] border-l border-white/5 shrink-0 overflow-y-auto overflow-x-hidden z-20 p-2.5 flex-col justify-between" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
         
         {/* SECTION: Movement */}
         <div className="bg-[#18181c] border border-white/5 rounded-[16px] p-3 flex flex-col shadow-2xl relative overflow-hidden group shrink-0">
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 transition-all ${isMoving ? 'bg-indigo-500' : 'bg-transparent'}`} />
            
            <div className="flex justify-between items-center mb-1.5 relative z-10 gap-2">
              <div>
                 <h3 className="text-white font-bold text-[13px] tracking-wide">Locomotiva</h3>
                 <p className="text-slate-400 text-[9px] font-semibold mt-0.5 leading-tight">Cruzar toda extensão da rota</p>
              </div>
              <div className={`shrink-0 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border transition-all ${isMoving ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' : 'bg-[#0a0a0c] text-slate-500 border-white/5'}`}>
                {isMoving ? 'Em Rota' : 'Parado'}
              </div>
            </div>
            
            <div className="flex justify-center py-1 relative z-10">
              <button 
                onClick={() => setIsMoving(!isMoving)}
                className={`w-[85px] h-[85px] rounded-[16px] flex flex-col items-center justify-center gap-1 transition-all duration-300 outline-none active:scale-95 ${
                  isMoving 
                    ? 'bg-indigo-600 border-t border-indigo-400/50 shadow-[0_10px_20px_-5px_rgba(79,70,229,0.5),inset_0_-3px_10px_rgba(0,0,0,0.2)] text-white'
                    : 'bg-[#1e1e24] shadow-[0_5px_15px_rgba(0,0,0,0.5),inset_0_2px_5px_rgba(255,255,255,0.05)] text-slate-300 border-b border-black hover:bg-[#26262d]'
                }`}
              >
                <Power className={`w-4 h-4 transition-all ${isMoving ? 'text-white' : 'text-slate-500'}`} />
                <span className={`text-[8px] font-black uppercase tracking-widest ${isMoving ? 'text-white' : 'text-slate-500'}`}>
                  {isMoving ? 'Parar' : 'Iniciar'}
                </span>
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
            <div className="flex gap-2 mb-1.5">
               {(layoutType === 'freio_02' || layoutType === 'patio_oficina' ? [0, 1, 2] : layoutType === 'pn_oficina' ? [0] : [0, 1]).map(index => {
                   let name = '';
                   if (layoutType === 'freio_02') {
                     name = index === 0 ? '02' : (index === 1 ? '01' : '128');
                   } else if (layoutType === 'freio') {
                     name = index === 0 ? '1' : '2';
                   } else if (layoutType === 'pn_oficina') {
                     name = '1';
                   } else {
                     name = index === 0 ? '1' : '2';
                   }
                   return (
                     <button
                       key={index}
                       onClick={() => setSelectedAmv(index)}
                       className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-[10px] border transition-all ${
                          selectedAmv === index 
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-md'
                          : 'bg-[#0a0a0c] border-white/5 text-slate-500 hover:border-white/10'
                       }`}
                     >
                       <span className="text-[8px] font-black uppercase tracking-widest leading-none mb-1">AMV {name}</span>
                       <span className={`text-[10px] font-bold leading-none ${amvs[index] === 'NORMAL' ? 'text-emerald-500' : (amvs[index] === 'REVERSO' ? 'text-yellow-500' : 'text-red-500')}`}>
                          {amvs[index] === 'NORMAL' ? 'RETA' : (amvs[index] === 'REVERSO' ? 'REVERSA' : 'AMV CONTRA')}
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
                    onClick={() => { setDirection(a.val as Direction); setIsMoving(false); }}
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
         {direction === 'SUL_NORTE' && (layoutType === 'patio_oficina' || layoutType === 'freio' || layoutType === 'oficina' || layoutType === 'reclassificacao' || layoutType === 'pn_oficina') && (
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
               
               <div className="flex bg-[#0a0a0c] p-1 rounded-[12px] border border-white/5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                  {(layoutType === 'patio_oficina' ? [
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
                    { val: '152', label: '152 trav' }
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
                       onClick={() => { setSpawnLine(s.val as SpawnLine); setIsMoving(false); setIsAutoLineSelection(false); }}
                       className={`flex-1 py-1.5 rounded-[8px] text-[8px] font-bold transition-all uppercase tracking-wider relative ${
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
         {direction === 'NORTE_SUL' && (layoutType === 'patio_oficina' || layoutType === 'freio' || layoutType === 'oficina' || layoutType === 'reclassificacao' || layoutType === 'pn_oficina') && (
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
               
               <div className="flex bg-[#0a0a0c] p-1 rounded-[12px] border border-white/5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                  {(layoutType === 'patio_oficina' ? [
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
                    { val: '152', label: '152 trav' }
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
                       onClick={() => { setDestLine(s.val as SpawnLine); setIsMoving(false); setIsAutoLineSelection(false); }}
                       className={`flex-1 py-1.5 rounded-[8px] text-[8px] font-bold transition-all uppercase tracking-wider relative ${
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
      </aside>

      {/* MOBILE BOTTOM CONTROL AREA */}
      <div className={`lg:hidden w-full bg-[#0a0a0c] border-t border-white/5 flex flex-col relative z-20 shrink-0 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isMobilePanelOpen ? 'p-3 pb-10 gap-0 overflow-y-auto' : 'p-3 pb-10 gap-0 overflow-hidden'}`}>
          
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
             <div className="overflow-hidden flex flex-col gap-3">
                 {/* AMV Selection Mobile */}
                 <div className="flex gap-2">
               {(layoutType === 'freio_02' || layoutType === 'patio_oficina' ? [0, 1, 2] : [0, 1]).map(index => {
                   let name = '';
                   if (layoutType === 'freio_02') {
                     name = index === 0 ? '02' : (index === 1 ? '01' : '128');
                   } else if (layoutType === 'freio') {
                     name = index === 0 ? '1' : '2';
                   } else {
                     name = index === 0 ? '1' : '2';
                   }
                   return (
                     <button
                       key={index}
                       onClick={() => setSelectedAmv(index)}
                       className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${
                          selectedAmv === index 
                          ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
                          : 'bg-[#18181c] border-white/5 text-slate-500'
                       }`}
                     >
                       <span className="text-[9px] font-black uppercase tracking-widest leading-none">AMV {name}</span>
                       <span className={`text-[10px] font-black uppercase leading-none ${amvs[index] === 'NORMAL' ? 'text-emerald-500' : (amvs[index] === 'REVERSO' ? 'text-yellow-500' : 'text-red-500')}`}>
                          {amvs[index] === 'NORMAL' ? 'RETA' : (amvs[index] === 'REVERSO' ? 'REVERSA' : 'AMV CONTRA')}
                       </span>
                     </button>
                   );
               })}
          </div>

          {/* Primary Action Row: Power / Night / Switch Options */}
          <div className="flex gap-3 shrink-0 h-14">
              <button 
                  onClick={() => setIsMoving(!isMoving)}
                  className={`w-[70px] h-full rounded-2xl flex flex-col items-center justify-center gap-1 transition-all outline-none active:scale-95 ${
                      isMoving 
                      ? 'bg-indigo-600 shadow-[0_4px_15px_rgba(79,70,229,0.4)] text-white' 
                      : 'bg-[#18181c] border border-white/5 text-slate-400'
                  }`}
              >
                  <Power className={`w-4 h-4 ${isMoving ? 'text-white' : 'text-slate-500'}`} />
                  <span className="text-[8px] font-black uppercase tracking-widest">{isMoving ? 'Parar' : 'Iniciar'}</span>
              </button>

              <div className="flex-1 bg-[#18181c] border border-white/5 rounded-2xl p-1 flex gap-1 shadow-inner">
                  {[
                       { val: 'NORMAL', label: 'Normal' },
                       { val: 'REVERSO', label: 'Reverso' },
                       { val: 'FALHA', label: 'Falha' }
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

          {/* Direction Mobile Selection */}
          <div className="bg-[#18181c] border border-white/5 rounded-2xl p-2.5 shrink-0 flex flex-col gap-1">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">Sentido da Frota</span>
              <div className="flex gap-2">
                  {[
                       { val: 'NORTE_SUL', label: 'Norte p/ Sul' },
                       { val: 'SUL_NORTE', label: 'Sul p/ Norte' }
                  ].map(a => (
                      <button
                         key={a.val}
                         onClick={() => { setDirection(a.val as Direction); setIsMoving(false); }}
                         className={`flex-1 flex items-center justify-between p-2.5 rounded-xl border transition-all ${
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
          {direction === 'SUL_NORTE' && (layoutType === 'patio_oficina' || layoutType === 'freio' || layoutType === 'oficina' || layoutType === 'reclassificacao') && (
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
                 <div className="flex gap-2">
                     {(layoutType === 'patio_oficina' ? [
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
                          { val: '152', label: '152 trav' }
                     ] : [
                          { val: '107A', label: 'L-107A' },
                          { val: '106A', label: 'L-106A' },
                          { val: '105A', label: 'L-105A' }
                     ]).map(s => (
                         <button
                            key={s.val}
                            onClick={() => { setSpawnLine(s.val as SpawnLine); setIsMoving(false); setIsAutoLineSelection(false); }}
                            className={`flex-1 p-2 rounded-xl border transition-all ${
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
          {direction === 'NORTE_SUL' && (layoutType === 'patio_oficina' || layoutType === 'freio' || layoutType === 'oficina' || layoutType === 'reclassificacao') && (
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
                 <div className="flex gap-2">
                     {(layoutType === 'patio_oficina' ? [
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
                          { val: '152', label: '152 trav' }
                     ] : [
                          { val: '107A', label: 'L-107A' },
                          { val: '106A', label: 'L-106A' },
                          { val: '105A', label: 'L-105A' }
                     ]).map(s => (
                         <button
                            key={s.val}
                            onClick={() => { setDestLine(s.val as SpawnLine); setIsMoving(false); setIsAutoLineSelection(false); }}
                            className={`flex-1 p-2 rounded-xl border transition-all ${
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
             </div>
          </div>
      </div>
    </div>
  );
}

