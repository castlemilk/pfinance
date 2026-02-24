'use client';

import { useEffect, useRef, useCallback } from 'react';

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_opacity;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m * m * m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float hash(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
  }

  float stars(vec2 uv, float t) {
    float result = 0.0;
    for (float i = 0.0; i < 3.0; i++) {
      float scale = 80.0 + i * 60.0;
      vec2 grid = floor(uv * scale);
      vec2 f = fract(uv * scale);
      float rnd = hash(grid + i * 100.0);
      if (rnd > 0.97) {
        vec2 center = vec2(hash(grid * 1.1 + i), hash(grid * 2.3 + i)) * 0.6 + 0.2;
        float d = length(f - center);
        float brightness = hash(grid * 3.7 + i);
        float twinkle = sin(t * (1.5 + brightness * 3.0) + rnd * 6.283) * 0.5 + 0.5;
        twinkle = mix(0.3, 1.0, twinkle);
        float star = smoothstep(0.04 + brightness * 0.02, 0.0, d) * twinkle * (0.4 + brightness * 0.6);
        result += star;
      }
    }
    return result;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 uvAspect = vec2(uv.x * aspect, uv.y);
    float t = u_time * 0.15;

    float n1 = snoise(uvAspect * 2.0 + t * 0.3) * 0.5 + 0.5;
    float n2 = snoise(uvAspect * 4.0 - t * 0.2 + 10.0) * 0.5 + 0.5;
    float n3 = snoise(uvAspect * 1.5 + t * 0.1 + 20.0) * 0.5 + 0.5;

    vec3 color1 = vec3(0.85, 0.55, 0.2);
    vec3 color2 = vec3(0.4, 0.6, 0.35);
    vec3 color3 = vec3(0.75, 0.42, 0.25);
    vec3 nebula = n1 * color1 * 0.06 + n2 * color2 * 0.04 + n3 * color3 * 0.03;

    float starField = stars(uvAspect, u_time);
    vec3 starColor = vec3(0.9, 0.85, 0.7) * starField;

    float vignette = 1.0 - length((uv - 0.5) * 1.5);
    vignette = smoothstep(0.0, 1.0, vignette);

    vec3 finalColor = (nebula + starColor) * vignette;
    gl_FragColor = vec4(finalColor, u_opacity);
  }
`;

export default function WebGLStars({ className = '', opacity = 0.6 }: { className?: string; opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const isVisibleRef = useRef(true);
  const prefersReducedMotion = useRef(false);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  useEffect(() => {
    // Respect prefers-reduced-motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = motionQuery.matches;
    if (prefersReducedMotion.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,       // Skip AA for perf
      powerPreference: 'low-power',  // Prefer integrated GPU
    });
    if (!gl) return;

    // Compile shaders
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FRAGMENT_SHADER);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('Fragment shader error:', gl.getShaderInfoLog(fs));
      return;
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const opacityLoc = gl.getUniformLocation(program, 'u_opacity');

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const resize = () => {
      // Cap at 1x DPR for performance — this is a background effect
      const dpr = Math.min(window.devicePixelRatio, 1);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resize();

    // Debounce resize events
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resize, 150);
    };
    window.addEventListener('resize', debouncedResize, { passive: true });

    // Pause when offscreen via IntersectionObserver
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting && !animFrameRef.current) {
          render();
        }
      },
      { threshold: 0 }
    );
    observer.observe(canvas);

    // Pause when tab is hidden
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      } else if (isVisibleRef.current) {
        render();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const startTime = performance.now();

    const render = () => {
      if (!isVisibleRef.current || document.hidden) {
        animFrameRef.current = 0;
        return;
      }
      const t = (performance.now() - startTime) / 1000;
      gl.uniform1f(timeLoc, t);
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.uniform1f(opacityLoc, opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cleanup();
      window.removeEventListener('resize', debouncedResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      observer.disconnect();
      clearTimeout(resizeTimeout);
      // Clean up WebGL resources
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [opacity, cleanup]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ pointerEvents: 'none', willChange: 'contents' }}
      aria-hidden="true"
    />
  );
}
