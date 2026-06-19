import { useEffect, useRef } from 'react'

const VERT = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const FRAG = `
  precision mediump float;
  uniform float u_time;
  uniform vec2 u_resolution;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float n = fbm(uv * 3.0 + u_time * 0.05);
    float glow = smoothstep(0.45, 0.55, n) * 0.03;
    vec3 color = vec3(0.04 + glow * 0.8, 0.04 + glow * 1.0, 0.04 + glow * 0.02);
    gl_FragColor = vec4(color, 1.0);
  }
`

function compileShader(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('Shader error:', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export default function ShaderBackground() {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const glRef     = useRef(null)
  const progRef   = useRef(null)
  const uniRef    = useRef({})

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas.getContext('webgl')
    if (!gl) return
    glRef.current = gl

    const vs = compileShader(gl, gl.VERTEX_SHADER,   VERT)
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return

    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog))
      return
    }
    progRef.current = prog
    gl.useProgram(prog)

    // Full-screen quad
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]), gl.STATIC_DRAW)

    const posLoc = gl.getAttribLocation(prog, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    uniRef.current = {
      time: gl.getUniformLocation(prog, 'u_time'),
      res:  gl.getUniformLocation(prog, 'u_resolution'),
    }

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    const start = performance.now()
    const render = () => {
      const t = (performance.now() - start) / 1000
      gl.uniform1f(uniRef.current.time, t)
      gl.uniform2f(uniRef.current.res, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      rafRef.current = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        display: 'block',
      }}
    />
  )
}
