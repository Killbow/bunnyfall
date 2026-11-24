// @ts-check
import { buildProgram } from './glProgram.js';
const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 uv;
uniform mat4 vp; uniform vec3 centre; uniform float radius; uniform vec2 shape;
out vec2 tex; out vec3 world;
void main(){
  float a=uv.x*6.28318530718;
  float top=max(0.,(uv.y-shape.x/shape.y)/(1.-shape.x/shape.y));
  float r=radius*sqrt(max(0.,1.-top*top));
  world=centre+vec3(cos(a)*r,-shape.x+uv.y*shape.y,sin(a)*r);
  tex=uv; gl_Position=vp*vec4(world,1.);
}`;
const FS = `#version 300 es
precision highp float;
in vec2 tex; in vec3 world;
uniform float seconds; uniform vec3 eye; uniform int kind;
out vec4 color;
void main(){
  float a=tex.x*6.28318530718, h=tex.y;
  float curl=a*9.+h*29.-seconds*.65+sin(a*5.-h*13.+seconds*.4)*1.9;
  float vein=pow(.5+.5*sin(curl),14.);
  float cloud=.5+.5*sin(a*4.+h*17.+seconds*.2)*sin(a*7.-h*11.-seconds*.35);
  float flash=pow(max(0.,sin(a*17.+h*35.+seconds*.9)),40.)*vein;
  float alpha=(.36+cloud*.25+vein*.22)*clamp(1.-length(world-eye)/6000.,0.,1.);
  vec3 c=mix(vec3(.035,.008,.065),vec3(.32,.035,.55),cloud);
  c+=vec3(.48,.14,.8)*vein+vec3(.65,.3,.9)*flash;
  if(kind==1)c=mix(c,vec3(.65,.1,.06),.65);
  if(kind==3)c=mix(c,vec3(.65,.42,.08),.7);
  color=vec4(c*alpha,alpha);
}`;
export class CromwarkSealRenderer {
  constructor(gl) {
    this.gl=gl; this.program=buildProgram(gl,VS,FS);
    this.u=Object.fromEntries(['vp','centre','radius','seconds','eye','shape','kind'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
    const v=[];
    for(let j=0;j<32;j++) for(let i=0;i<128;i++) {
      const a=i/128,b=(i+1)/128,c=j/32,d=(j+1)/32;
      v.push(a,c,b,c,b,d,a,c,b,d,a,d);
    }
    this.count=v.length/2; this.vao=gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0); gl.bindVertexArray(null);
    this.vp=new Float32Array(16);
  }
  draw(seal,proj,view,eye,seconds) {
    if(!seal || Math.hypot(eye[0]-seal.x,eye[2]-seal.z)>6000+seal.radius) return false;
    const gl=this.gl,u=this.u;
    for(let c=0;c<4;c++) for(let r=0;r<4;r++) this.vp[c*4+r]=proj[r]*view[c*4]+proj[4+r]*view[c*4+1]+proj[8+r]*view[c*4+2]+proj[12+r]*view[c*4+3];
    gl.useProgram(this.program); gl.uniformMatrix4fv(u.vp,false,this.vp);
    gl.uniform3f(u.centre,seal.x,seal.y,seal.z); gl.uniform1f(u.radius,seal.radius);
    gl.uniform2f(u.shape,seal.below??120,(seal.height??380)+(seal.below??120));
    gl.uniform1i(u.kind,seal.kind??0);
    gl.uniform3fv(u.eye,eye); gl.uniform1f(u.seconds,seconds% (Math.PI*40));
    gl.bindVertexArray(this.vao); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.drawArrays(gl.TRIANGLES,0,this.count);
    gl.bindVertexArray(null); gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
    return true;
  }
  /** Frees the program, the vertex array and the buffer. */
  dispose() {
    if(!this.program) return;
    const gl=this.gl;
    gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
    this.buffer=null; this.vao=null; this.program=null;
  }
}
