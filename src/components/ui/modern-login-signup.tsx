import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import * as THREE from 'three';

type ModernAuthShellProps = {
  children: ReactNode;
};

/** Shared visual shell for the real InstRent authentication forms. */
export default function ModernLoginSignup({ children }: ModernAuthShellProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let active = true;
    let animationId = 0;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2() },
      u_opacities: { value: [0.22, 0.22, 0.28, 0.35, 0.45, 0.6, 0.7, 0.8, 0.9, 1.0] },
      u_colors: { value: [
        new THREE.Vector3(1, 0.18, 0.38),
        new THREE.Vector3(1, 0.45, 0.18),
        new THREE.Vector3(0.95, 0.16, 0.35),
        new THREE.Vector3(1, 0.7, 0.25),
        new THREE.Vector3(0.7, 0.12, 0.4),
        new THREE.Vector3(1, 0.3, 0.2),
      ] },
      u_total_size: { value: 22 },
      u_dot_size: { value: 6 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        precision mediump float;
        uniform vec2 u_resolution;
        out vec2 fragCoord;
        void main() {
          gl_Position = vec4(position, 1.0);
          fragCoord = (position.xy + 1.0) * 0.5 * u_resolution;
          fragCoord.y = u_resolution.y - fragCoord.y;
        }
      `,
      fragmentShader: `
        precision mediump float;
        in vec2 fragCoord;
        uniform float u_time;
        uniform float u_opacities[10];
        uniform vec3 u_colors[6];
        uniform float u_total_size;
        uniform float u_dot_size;
        uniform vec2 u_resolution;
        out vec4 fragColor;
        float PHI = 1.61803398874989484820459;
        float random(vec2 xy) {
          return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
        }
        void main() {
          vec2 st = fragCoord.xy;
          st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));
          st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));
          float opacity = step(0.0, st.x) * step(0.0, st.y);
          vec2 cell = vec2(int(st.x / u_total_size), int(st.y / u_total_size));
          float showOffset = random(cell);
          float flicker = random(cell * floor((u_time / 5.0) + showOffset + 5.0));
          opacity *= u_opacities[int(flicker * 10.0)];
          opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
          opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));
          vec3 color = u_colors[int(showOffset * 6.0)];
          vec2 centerGrid = u_resolution / 2.0 / u_total_size;
          float distanceFromCenter = distance(centerGrid, cell);
          float intro = distanceFromCenter * 0.01 + random(cell) * 0.15;
          opacity *= step(intro, u_time * 3.0);
          fragColor = vec4(color * opacity, opacity);
        }
      `,
      glslVersion: THREE.GLSL3,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      uniforms.u_resolution.value.set(width * pixelRatio, height * pixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);
    const startTime = performance.now();
    const animate = () => {
      if (!active) return;
      animationId = window.requestAnimationFrame(animate);
      uniforms.u_time.value = (performance.now() - startTime) / 1000;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      active = false;
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(animationId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-8 text-white">
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-80" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.58),rgba(0,0,0,0.96)_78%)]" />
      <section className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/90 p-5 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-8">
        {children}
      </section>
    </main>
  );
}
