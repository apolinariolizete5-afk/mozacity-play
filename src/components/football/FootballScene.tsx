import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { BALL_R, GOAL_H, GOAL_HW, HALF_L, HALF_W, step, type Input, type Match } from "@/lib/football/sim";

const KITS = [
  { shirt: "#d62839", shorts: "#ffffff", socks: "#d62839", gk: "#f4c430" },
  { shirt: "#1f6fd1", shorts: "#0d1b3a", socks: "#1f6fd1", gk: "#2bb673" },
];
const SKINS = ["#8d5524", "#c68642", "#6b3e1f", "#e0ac69", "#5a3417"];

function makePitchTexture() {
  const s = 20;
  const c = document.createElement("canvas");
  c.width = (HALF_L * 2 + 10) * s;
  c.height = (HALF_W * 2 + 10) * s;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2f7d32";
  g.fillRect(0, 0, c.width, c.height);
  const stripe = 5.25 * s;
  for (let i = 0; i * stripe < c.width; i++) {
    g.fillStyle = i % 2 ? "#2b7430" : "#348a38";
    g.fillRect(i * stripe, 0, stripe, c.height);
  }
  const o = 5 * s;
  const X = (m: number) => o + (m + HALF_L) * s;
  const Y = (m: number) => o + (m + HALF_W) * s;
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.lineWidth = 0.13 * s;
  g.strokeRect(X(-HALF_L), Y(-HALF_W), HALF_L * 2 * s, HALF_W * 2 * s);
  g.beginPath(); g.moveTo(X(0), Y(-HALF_W)); g.lineTo(X(0), Y(HALF_W)); g.stroke();
  g.beginPath(); g.arc(X(0), Y(0), 9.15 * s, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "white";
  g.beginPath(); g.arc(X(0), Y(0), 0.3 * s, 0, Math.PI * 2); g.fill();
  for (const sd of [-1, 1]) {
    const gx = sd * HALF_L;
    g.strokeRect(Math.min(X(gx), X(gx - sd * 16.5)), Y(-20.16), 16.5 * s, 40.32 * s);
    g.strokeRect(Math.min(X(gx), X(gx - sd * 5.5)), Y(-9.16), 5.5 * s, 18.32 * s);
    g.beginPath(); g.arc(X(gx - sd * 11), Y(0), 0.3 * s, 0, Math.PI * 2); g.fill();
    g.beginPath();
    const a = Math.acos(5.5 / 9.15);
    if (sd > 0) g.arc(X(gx - 11), Y(0), 9.15 * s, Math.PI - a, Math.PI + a);
    else g.arc(X(gx + 11), Y(0), 9.15 * s, -a, a);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeCrowdTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1c2433"; g.fillRect(0, 0, 512, 128);
  const colors = ["#d62839", "#ffffff", "#1f6fd1", "#f4c430", "#e8e8e8", "#2a2a2a", "#c0392b", "#7f8c8d"];
  for (let y = 4; y < 128; y += 8) {
    for (let x = 2; x < 512; x += 6) {
      g.fillStyle = colors[Math.floor(Math.random() * colors.length)]!;
      g.fillRect(x + Math.random() * 2, y + Math.random() * 2, 3, 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeBallTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fafafa"; g.fillRect(0, 0, 128, 64);
  g.fillStyle = "#111";
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.arc((i * 16 + (i % 2) * 8) % 128, i % 2 ? 18 : 46, 7, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Rig = { group: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group };

function PlayerModel({ shirt, shorts, socks, skin, register }: { shirt: string; shorts: string; socks: string; skin: string; register: (r: Rig) => void }) {
  const group = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const setRef = () => {
    if (group.current && legL.current && legR.current && armL.current && armR.current)
      register({ group: group.current, legL: legL.current, legR: legR.current, armL: armL.current, armR: armR.current });
  };
  return (
    <group ref={(g) => { group.current = g; setRef(); }} scale={1.15}>
      {[-1, 1].map((sd) => (
        <group key={sd} ref={(g) => { (sd < 0 ? legL : legR).current = g; setRef(); }} position={[sd * 0.12, 0.92, 0]}>
          <mesh position={[0, -0.25, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.32, 3, 8]} />
            <meshStandardMaterial color={skin} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.66, 0]} castShadow>
            <capsuleGeometry args={[0.08, 0.3, 3, 8]} />
            <meshStandardMaterial color={socks} roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.88, 0.06]}>
            <boxGeometry args={[0.13, 0.08, 0.26]} />
            <meshStandardMaterial color="#111" roughness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.98, 0]} castShadow>
        <boxGeometry args={[0.44, 0.26, 0.26]} />
        <meshStandardMaterial color={shorts} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.36, 0]} castShadow>
        <boxGeometry args={[0.5, 0.56, 0.28]} />
        <meshStandardMaterial color={shirt} roughness={0.65} />
      </mesh>
      {[-1, 1].map((sd) => (
        <group key={sd} ref={(g) => { (sd < 0 ? armL : armR).current = g; setRef(); }} position={[sd * 0.31, 1.6, 0]}>
          <mesh position={[0, -0.27, 0]}>
            <capsuleGeometry args={[0.065, 0.4, 3, 8]} />
            <meshStandardMaterial color={skin} roughness={0.7} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.83, 0]} castShadow>
        <sphereGeometry args={[0.14, 16, 12]} />
        <meshStandardMaterial color={skin} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.89, -0.02]}>
        <sphereGeometry args={[0.145, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#141010" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Goal({ sd }: { sd: number }) {
  const x = sd * HALF_L;
  const depth = 2;
  const netMat = <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.45} />;
  return (
    <group>
      {[-GOAL_HW, GOAL_HW].map((z) => (
        <mesh key={z} position={[x, GOAL_H / 2, z]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, GOAL_H, 10]} />
          <meshStandardMaterial color="#f5f5f5" />
        </mesh>
      ))}
      <mesh position={[x, GOAL_H, 0]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.07, 0.07, GOAL_HW * 2, 10]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
      <mesh position={[x + sd * depth, GOAL_H / 2, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[GOAL_HW * 2, GOAL_H, 24, 8]} />
        {netMat}
      </mesh>
      <mesh position={[x + (sd * depth) / 2, GOAL_H, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[depth, GOAL_HW * 2, 6, 24]} />
        {netMat}
      </mesh>
      {[-GOAL_HW, GOAL_HW].map((z) => (
        <mesh key={z} position={[x + (sd * depth) / 2, GOAL_H / 2, z]}>
          <planeGeometry args={[depth, GOAL_H, 6, 8]} />
          {netMat}
        </mesh>
      ))}
    </group>
  );
}

function Stadium() {
  const crowd = useMemo(makeCrowdTexture, []);
  const stands: { pos: [number, number, number]; rot: number; len: number }[] = [
    { pos: [0, 0, -(HALF_W + 14)], rot: 0, len: 130 },
    { pos: [0, 0, HALF_W + 14], rot: Math.PI, len: 130 },
    { pos: [-(HALF_L + 14), 0, 0], rot: Math.PI / 2, len: 90 },
    { pos: [HALF_L + 14, 0, 0], rot: -Math.PI / 2, len: 90 },
  ];
  return (
    <group>
      {stands.map((s, i) => {
        const tex = crowd.clone();
        tex.repeat.set(s.len / 20, 3);
        tex.needsUpdate = true;
        return (
          <group key={i} position={s.pos} rotation-y={s.rot}>
            <mesh position={[0, 7, 0]} rotation-x={-0.6}>
              <planeGeometry args={[s.len, 22]} />
              <meshStandardMaterial map={tex} roughness={0.95} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 1, -2]}>
              <boxGeometry args={[s.len, 2, 1]} />
              <meshStandardMaterial color="#0f1c2e" />
            </mesh>
            <mesh position={[0, 17, -8]} rotation-x={0.25}>
              <boxGeometry args={[s.len, 0.6, 14]} />
              <meshStandardMaterial color="#cfd6de" metalness={0.4} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      {[-1, 1].map((a) => [-1, 1].map((b) => (
        <group key={`${a}${b}`} position={[a * (HALF_L + 18), 0, b * (HALF_W + 18)]}>
          <mesh position={[0, 16, 0]}>
            <cylinderGeometry args={[0.4, 0.6, 32, 8]} />
            <meshStandardMaterial color="#8a939c" />
          </mesh>
          <mesh position={[0, 32, 0]}>
            <boxGeometry args={[5, 3, 0.6]} />
            <meshStandardMaterial color="#ffffff" emissive="#fff6d8" emissiveIntensity={3} />
          </mesh>
        </group>
      )))}
      {/* Placas de publicidade */}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[0, 0.5, sd * (HALF_W + 3)]}>
          <boxGeometry args={[HALF_L * 2, 1, 0.2]} />
          <meshStandardMaterial color="#0a2540" emissive="#1f6fd1" emissiveIntensity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

export function FootballScene({ match, input, onTick }: { match: React.MutableRefObject<Match>; input: React.MutableRefObject<Input>; onTick: (m: Match) => void }) {
  const pitch = useMemo(makePitchTexture, []);
  const ballTex = useMemo(makeBallTexture, []);
  const rigs = useRef<(Rig | null)[]>(Array(22).fill(null));
  const ball = useRef<THREE.Mesh>(null);
  const ballShadow = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const camTarget = useRef(new THREE.Vector3(0, 0, 0));
  const { camera } = useThree();
  const hudTimer = useRef(0);

  const looks = useMemo(() => match.current.players.map((p, i) => {
    const kit = KITS[p.team]!;
    return { shirt: p.role === "GK" ? kit.gk : kit.shirt, shorts: kit.shorts, socks: p.role === "GK" ? kit.gk : kit.socks, skin: SKINS[i % SKINS.length]! };
  }), [match]);

  useFrame((_, delta) => {
    const m = match.current;
    step(m, input.current, delta);
    m.players.forEach((p, i) => {
      const r = rigs.current[i];
      if (!r) return;
      r.group.position.set(p.x, 0, p.z);
      r.group.rotation.y = Math.atan2(p.fx, p.fz);
      const sp = Math.min(Math.hypot(p.vx, p.vz) / 7, 1);
      const sw = Math.sin(p.anim) * 0.9 * sp;
      r.legL.rotation.x = sw; r.legR.rotation.x = -sw;
      r.armL.rotation.x = -sw * 0.8; r.armR.rotation.x = sw * 0.8;
    });
    const b = m.ball;
    if (ball.current) {
      ball.current.position.set(b.x, b.y + 0.06, b.z);
      ball.current.rotation.z -= b.vx * delta * 4;
      ball.current.rotation.x += b.vz * delta * 4;
    }
    if (ballShadow.current) {
      ballShadow.current.position.set(b.x, 0.02, b.z);
      const s = 1 / (1 + b.y * 0.4);
      ballShadow.current.scale.set(s, s, s);
    }
    const c = m.players[m.controlled];
    if (ring.current && c) ring.current.position.set(c.x, 0.03, c.z);

    // Câmara de transmissão lateral que segue a bola.
    const k = 1 - Math.exp(-3 * delta);
    const tx = THREE.MathUtils.clamp(b.x, -HALF_L + 12, HALF_L - 12);
    const tz = THREE.MathUtils.clamp(b.z, -HALF_W + 8, HALF_W - 4);
    camTarget.current.x += (tx - camTarget.current.x) * k;
    camTarget.current.z += (tz * 0.6 - camTarget.current.z) * k;
    camera.position.set(camTarget.current.x, 17, camTarget.current.z + 24);
    camera.lookAt(camTarget.current.x, 0, camTarget.current.z - 2);

    hudTimer.current += delta;
    if (hudTimer.current > 0.12) { hudTimer.current = 0; onTick(m); }
  });

  return (
    <>
      <color attach="background" args={["#0d1a2e"]} />
      <fog attach="fog" args={["#0d1a2e", 90, 200]} />
      <hemisphereLight args={["#cfe3ff", "#1f3b22", 0.7]} />
      <directionalLight
        position={[30, 60, 25]}
        intensity={2.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-far={150}
      />
      <Environment resolution={64}>
        <Lightformer intensity={2} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer intensity={1} color="#bcd" position={[-10, 3, 0]} rotation-y={Math.PI / 2} scale={[30, 2, 1]} />
      </Environment>

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[HALF_L * 2 + 40, HALF_W * 2 + 40]} />
        <meshStandardMaterial color="#25652a" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[HALF_L * 2 + 10, HALF_W * 2 + 10]} />
        <meshStandardMaterial map={pitch} roughness={0.95} />
      </mesh>

      <Goal sd={-1} />
      <Goal sd={1} />
      <Stadium />

      <mesh ref={ring} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.55, 0.78, 32]} />
        <meshBasicMaterial color="#ffd400" transparent opacity={0.9} />
      </mesh>

      {match.current.players.map((p, i) => (
        <PlayerModel key={p.id} {...looks[i]!} register={(r) => { rigs.current[i] = r; }} />
      ))}

      <mesh ref={ball} castShadow>
        <sphereGeometry args={[BALL_R * 1.8, 20, 14]} />
        <meshStandardMaterial map={ballTex} roughness={0.4} />
      </mesh>
      <mesh ref={ballShadow} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.25, 16]} />
        <meshBasicMaterial color="#000" transparent opacity={0.35} />
      </mesh>
    </>
  );
}
