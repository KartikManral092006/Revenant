"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// Decorative 3D graveyard behind the home hero: a field of tombstones in fog, drifting wisps, and one
// stone that glows and releases spirits: the dead package coming back. Loaded lazily, client only.

const CANVAS = "#09090b";
const ECTO = new THREE.Color("#4ade80");
const WISP = new THREE.Color("#a78bfa");
const WARM = new THREE.Color("#c4b5fd");
/** Where the glowing "reborn" stone stands: right of centre, clear of the hero text. */
const REBORN_X = 2.9;
const REBORN_Z = -2.4;

/** Small deterministic PRNG so the layout is the same on every visit. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tombstoneGeometry(): THREE.ExtrudeGeometry {
  const w = 0.5;
  const h = 0.9;
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(-w, h);
  s.absarc(0, h, w, Math.PI, 0, true);
  s.lineTo(w, 0);
  s.lineTo(-w, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 18 });
  g.translate(0, 0, -0.09);
  return g;
}

/** Soft round sprite for particles, drawn once on a canvas. */
function useSoftDot(): THREE.Texture {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function Graveyard() {
  const geo = useMemo(() => tombstoneGeometry(), []);
  const stones = useMemo(() => {
    const rnd = mulberry32(1031);
    const out: { pos: [number, number, number]; rot: [number, number, number]; scale: number }[] = [];
    for (let i = 0; i < 34; i++) {
      const x = (rnd() - 0.5) * 22;
      const z = -2 - rnd() * 14;
      // Keep a clear lane in the middle-front for the reborn stone.
      if (Math.abs(x - REBORN_X) < 1.5 && z > -5) continue;
      out.push({
        pos: [x, 0, z],
        rot: [(rnd() - 0.5) * 0.18, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.22],
        scale: 0.7 + rnd() * 0.6,
      });
    }
    return out;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    stones.forEach((s, i) => {
      o.position.set(...s.pos);
      o.rotation.set(...s.rot);
      o.scale.setScalar(s.scale);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [stones]);

  return (
    <instancedMesh ref={ref} args={[geo, undefined, stones.length]}>
      <meshStandardMaterial color="#26262c" roughness={0.92} metalness={0.05} />
    </instancedMesh>
  );
}

function RebornStone({ animate }: { animate: boolean }) {
  const geo = useMemo(() => tombstoneGeometry(), []);
  const light = useRef<THREE.PointLight>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.getElapsedTime();
    const pulse = 0.75 + Math.sin(t * 1.6) * 0.18 + Math.sin(t * 4.1) * 0.05;
    if (light.current) light.current.intensity = 4 * pulse;
    if (mat.current) mat.current.emissiveIntensity = 0.1 * pulse;
    if (group.current) group.current.position.y = Math.sin(t * 0.8) * 0.04;
  });

  return (
    <group ref={group} position={[REBORN_X, 0, REBORN_Z]} rotation={[0, -0.35, 0.03]}>
      <mesh geometry={geo} scale={1.25}>
        <meshStandardMaterial ref={mat} color="#3a3a42" emissive={ECTO} emissiveIntensity={0.08} roughness={0.6} />
      </mesh>
      {/* Behind the stone: a halo and rim light, so the stone face stays stone-coloured. */}
      <pointLight ref={light} color={ECTO} intensity={5} distance={6} decay={1.8} position={[0, 1.4, -0.9]} />
    </group>
  );
}

function Spirits({ animate, count = 70 }: { animate: boolean; count?: number }) {
  const tex = useSoftDot();
  const ref = useRef<THREE.Points>(null);
  const seeds = useMemo(() => {
    const rnd = mulberry32(77);
    return Array.from({ length: count }, () => ({ phase: rnd() * 10, r: 0.15 + rnd() * 0.45, speed: 0.35 + rnd() * 0.5 }));
  }, [count]);
  const positions = useMemo(() => new Float32Array(count * 3), [count]);

  useFrame(({ clock }) => {
    const attr = ref.current?.geometry.attributes.position;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    const t = animate ? clock.getElapsedTime() : 2.5;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      const life = (t * s.speed + s.phase) % 3.2; // 0..3.2 seconds of rising
      arr[i * 3] = REBORN_X + Math.sin(t * 1.3 + s.phase) * s.r * (0.4 + life * 0.3);
      arr[i * 3 + 1] = 0.6 + life * 0.9;
      arr[i * 3 + 2] = REBORN_Z + Math.cos(t * 1.1 + s.phase) * s.r * 0.6;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={tex} color={ECTO} size={0.16} transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Wisps({ animate, count = 380 }: { animate: boolean; count?: number }) {
  const tex = useSoftDot();
  const ref = useRef<THREE.Points>(null);
  const { positions, base } = useMemo(() => {
    const rnd = mulberry32(4302);
    const base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      base[i * 3] = (rnd() - 0.5) * 26;
      base[i * 3 + 1] = rnd() * 6;
      base[i * 3 + 2] = -1 - rnd() * 16;
    }
    return { positions: new Float32Array(base), base };
  }, [count]);

  useFrame(({ clock }) => {
    const attr = ref.current?.geometry.attributes.position;
    if (!animate || !attr) return;
    const arr = attr.array as Float32Array;
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      arr[i * 3] = base[i * 3] + Math.sin(t * 0.25 + i) * 0.3;
      arr[i * 3 + 1] = (base[i * 3 + 1] + t * 0.12 * (0.5 + (i % 5) * 0.2)) % 6;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={tex} color={WISP} size={0.09} transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Moon() {
  const tex = useSoftDot();
  return (
    <group position={[11, 7.2, -18]}>
      <mesh>
        <sphereGeometry args={[0.8, 48, 48]} />
        <meshBasicMaterial color="#a1a1aa" fog={false} />
      </mesh>
      <sprite scale={[7, 7, 1]}>
        <spriteMaterial map={tex} color={WISP} transparent opacity={0.15} depthWrite={false} fog={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}

/** Camera drifts slowly and leans toward the pointer. */
function CameraRig({ animate }: { animate: boolean }) {
  useFrame(({ clock, camera, pointer }) => {
    if (!animate) return;
    const t = clock.getElapsedTime();
    const tx = pointer.x * 0.6 + Math.sin(t * 0.1) * 0.4;
    const ty = 1.5 + pointer.y * 0.25;
    camera.position.x += (tx - camera.position.x) * 0.03;
    camera.position.y += (ty - camera.position.y) * 0.03;
    camera.lookAt(0.6, 1, -5);
  });
  return null;
}

export default function HeroScene({ animate, active }: { animate: boolean; active: boolean }) {
  return (
    <Canvas
      // Render one still frame under reduced motion; pause entirely when off screen.
      frameloop={!active ? "never" : animate ? "always" : "demand"}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "low-power", alpha: false }}
      camera={{ position: [0, 1.5, 6], fov: 50, near: 0.1, far: 60 }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(0.6, 1, -5);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
      aria-hidden="true"
    >
      <color attach="background" args={[CANVAS]} />
      <fog attach="fog" args={[CANVAS, 5, 22]} />
      <ambientLight intensity={0.35} color={WISP} />
      <directionalLight position={[-6, 8, -10]} intensity={1.1} color={WISP} />
      <pointLight position={[-4, 0.6, -3]} intensity={3} distance={8} color={WARM} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -8]}>
        <planeGeometry args={[60, 40]} />
        <meshStandardMaterial color="#0f0f12" roughness={1} />
      </mesh>
      <Moon />
      <Graveyard />
      <RebornStone animate={animate} />
      <Spirits animate={animate} />
      <Wisps animate={animate} />
      <CameraRig animate={animate} />
    </Canvas>
  );
}
