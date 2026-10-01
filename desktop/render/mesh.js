import * as THREE from 'three/webgpu';
export function coordinates(low,high,spacing,features=[]){const set=new Set([low,high]);for(let p=Math.ceil(low/spacing)*spacing;p<high;p+=spacing)if(p>low)set.add(p);for(const p of features)if(p>low&&p<high)set.add(p);return [...set].sort((a,b)=>a-b);}
// All patches share a world-aligned grid and explicit corner coordinates.
export function oceanPlane(x,z,w,d,spacing,featuresX=[],featuresZ=[]){
 const xs=coordinates(x,x+w,spacing,featuresX),zs=coordinates(z,z+d,spacing,featuresZ),nx=xs.length,nz=zs.length,positions=new Float32Array(nx*nz*3),normals=new Float32Array(positions.length),uv=new Float32Array(nx*nz*2),indices=[];
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const p=j*nx+i;positions.set([xs[i],0,zs[j]],p*3);normals[p*3+1]=1;uv.set([(xs[i]-x)/w,(zs[j]-z)/d],p*2);if(i<nx-1&&j<nz-1)indices.push(p,p+nx,p+1,p+1,p+nx,p+nx+1);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
}
