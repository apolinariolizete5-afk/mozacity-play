import { useEffect, useRef } from "react";

type Point = { x: number; y: number };
type Props = { player: Point; ball: Point };

const VERTEX = `
attribute vec2 a_position;
attribute vec3 a_color;
varying vec3 v_color;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  gl_PointSize = 1.0;
  v_color = a_color;
}`;
const FRAGMENT = `
precision mediump float;
varying vec3 v_color;
void main() { gl_FragColor = vec4(v_color, 1.0); }`;

function project(x: number, y: number): [number, number] {
  // Projecção em perspectiva de coordenadas do campo para o plano WebGL.
  const depth = 0.58 + (y / 100) * 0.42;
  return [((x - 50) / 50) * depth * 0.88, (0.88 - y / 100 * 1.68) * depth];
}

export function FootballPitch3D({ player, ball }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    if (!buffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const position = gl.getAttribLocation(program, "a_position");
    const color = gl.getAttribLocation(program, "a_color");
    gl.enableVertexAttribArray(position);
    gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(color, 3, gl.FLOAT, false, 20, 8);

    const vertices: number[] = [];
    const tri = (a: [number, number], b: [number, number], c: [number, number], rgb: [number, number, number]) => {
      for (const p of [a, b, c]) vertices.push(p[0], p[1], ...rgb);
    };
    const quad = (a: [number, number], b: [number, number], c: [number, number], d: [number, number], rgb: [number, number, number]) => {
      tri(a, b, c, rgb); tri(a, c, d, rgb);
    };
    const line = (a: Point, b: Point, rgb: [number, number, number]) => {
      const p = project(a.x, a.y); const q = project(b.x, b.y);
      // Lines are drawn as thin triangles so they work consistently on mobile WebGL.
      const dx = q[0] - p[0]; const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1; const w = 0.0022;
      const nx = -dy / len * w; const ny = dx / len * w;
      quad([p[0]+nx,p[1]+ny],[q[0]+nx,q[1]+ny],[q[0]-nx,q[1]-ny],[p[0]-nx,p[1]-ny],rgb);
    };
    const circle = (cx: number, cy: number, radius: number, rgb: [number, number, number], filled: boolean) => {
      const steps = 32;
      for (let i = 0; i < steps; i++) {
        const a = i / steps * Math.PI * 2; const b = (i+1) / steps * Math.PI * 2;
        const p = project(cx + Math.cos(a)*radius, cy + Math.sin(a)*radius);
        const q = project(cx + Math.cos(b)*radius, cy + Math.sin(b)*radius);
        const center = project(cx, cy);
        if (filled) tri(center, p, q, rgb);
        else line({x:cx+Math.cos(a)*radius,y:cy+Math.sin(a)*radius},{x:cx+Math.cos(b)*radius,y:cy+Math.sin(b)*radius},rgb);
      }
    };
    const white: [number, number, number] = [0.94, 0.98, 0.94];
    const green: [number, number, number] = [0.10, 0.42, 0.22];
    const green2: [number, number, number] = [0.12, 0.48, 0.25];
    const field = [project(0,0),project(100,0),project(100,100),project(0,100)];
    quad(field[0],field[1],field[2],field[3],green);
    for (let y=0;y<100;y+=20) {
      const p = [project(0,y),project(100,y),project(100,y+20),project(0,y+20)];
      quad(p[0],p[1],p[2],p[3],y%40===0?green2:green);
    }
    line({x:4,y:4},{x:96,y:4},white); line({x:96,y:4},{x:96,y:96},white);
    line({x:96,y:96},{x:4,y:96},white); line({x:4,y:96},{x:4,y:4},white);
    line({x:4,y:50},{x:96,y:50},white);
    circle(50,50,11,white,false);
    line({x:25,y:4},{x:75,y:4},white); line({x:25,y:4},{x:25,y:19},white); line({x:75,y:4},{x:75,y:19},white); line({x:25,y:19},{x:75,y:19},white);
    line({x:40,y:4},{x:40,y:10},white); line({x:60,y:4},{x:60,y:10},white); line({x:40,y:10},{x:60,y:10},white);
    line({x:25,y:96},{x:75,y:96},white); line({x:25,y:96},{x:25,y:81},white); line({x:75,y:96},{x:75,y:81},white); line({x:25,y:81},{x:75,y:81},white);
    line({x:40,y:96},{x:40,y:90},white); line({x:60,y:96},{x:60,y:90},white); line({x:40,y:90},{x:60,y:90},white);
    const dot = (x: number, y: number, radius: number, rgb: [number,number,number]) => circle(x,y,radius,rgb,true);
    const teams = [{x:28,y:22},{x:72,y:22},{x:50,y:32},{x:25,y:43},{x:75,y:43},{x:50,y:48},{x:30,y:61},{x:70,y:61},{x:50,y:77}];
    const opponents = [{x:43,y:35},{x:60,y:48},{x:37,y:55},{x:66,y:72}];
    teams.forEach(p=>dot(p.x,p.y,2.2,[0.92,0.12,0.25]));
    opponents.forEach(p=>dot(p.x,p.y,2.2,[0.10,0.58,0.98]));
    dot(player.x,player.y,3.3,[1.0,0.82,0.08]);
    dot(ball.x,ball.y,1.5,[1.0,1.0,1.0]);

    const data = new Float32Array(vertices);
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clearColor(0.025,0.10,0.06,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,data.length/5);

    return () => {
      gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
    };
  }, [player.x, player.y, ball.x, ball.y]);

  return <canvas ref={canvasRef} width={900} height={620} aria-label="Campo de futebol 3D renderizado com WebGL" className="h-full w-full rounded-2xl" />;
}
