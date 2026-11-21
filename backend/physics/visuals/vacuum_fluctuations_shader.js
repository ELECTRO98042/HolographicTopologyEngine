// backend/physics/visuals/vacuum_fluctuations_shader.js
import * as THREE from 'three';

export function createVacuumFoamMaterial(uniforms) {
    return new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
            uniform float uTime;
            uniform float uNoiseFreq;
            uniform float uNoiseSpeed;
            uniform float uDispAmp;
            uniform float uInnerRadius;
            uniform float uOuterRadius;

            varying float vNoiseVal;
            varying float vShellMask;

            // Compact 3D gradient/value noise for procedural quantum foam displacement
            float hash31(vec3 p) {
                p = fract(p * 0.1031);
                p += dot(p, p.yzx + 33.33);
                return fract((p.x + p.y) * p.z);
            }

            float valueNoise3D(vec3 x) {
                vec3 i = floor(x);
                vec3 f = fract(x);
                f = f * f * (3.0 - 2.0 * f);

                float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
                float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
                float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
                float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
                float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
                float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
                float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
                float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

                float nx00 = mix(n000, n100, f.x);
                float nx10 = mix(n010, n110, f.x);
                float nx01 = mix(n001, n101, f.x);
                float nx11 = mix(n011, n111, f.x);

                float nxy0 = mix(nx00, nx10, f.y);
                float nxy1 = mix(nx01, nx11, f.y);

                return mix(nxy0, nxy1, f.z);
            }

            float fbm3D(vec3 p) {
                float sum = 0.0;
                float amp = 0.55;
                float freq = 1.0;
                for (int o = 0; o < 3; o++) {
                    sum += amp * valueNoise3D(p * freq);
                    freq *= 2.03;
                    amp *= 0.5;
                }
                return sum;
            }

            void main() {
                vec3 p = position;
                float r = length(p);

                // Emphasize inter-shell negative space between inner core and outer boundary
                float innerFade = smoothstep(uInnerRadius * 0.6, uInnerRadius * 1.35, r);
                float outerFade = 1.0 - smoothstep(uOuterRadius * 0.75, uOuterRadius * 1.15, r);
                vShellMask = clamp(innerFade * outerFade, 0.0, 1.0);

                vec3 sampleCoord = p * uNoiseFreq + vec3(uTime * uNoiseSpeed);
                float n = fbm3D(sampleCoord);
                vNoiseVal = n;

                vec3 normalDir = r > 1e-4 ? normalize(p) : vec3(0.0, 1.0, 0.0);
                // [↑] Larger volumetric foam displacement | [↓] Tighter zero-point surface ripple
                vec3 displaced = p + normalDir * ((n - 0.5) * 2.0) * uDispAmp * vShellMask;

                gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
            }
        `,
        fragmentShader: /* glsl */ `
            uniform float uTime;
            uniform float uLambdaDensity;
            uniform float uShimmerOpacity;
            uniform float uIntensity;

            varying float vNoiseVal;
            varying float vShellMask;

            void main() {
                // Zero-point micro-shimmer across inter-shell space
                float shimmer = 0.65 + 0.35 * sin(uTime * 6.5 + vNoiseVal * 24.0);
                float foamBand = smoothstep(0.32, 0.78, vNoiseVal) * vShellMask;

                // [↑] Stronger inter-shell shimmer veil | [↓] Lighter zero-point texture over core
                float alpha = foamBand * shimmer * uShimmerOpacity * clamp(uLambdaDensity, 0.1, 2.5) * clamp(uIntensity, 0.15, 1.8);
                alpha = clamp(alpha, 0.0, 0.24);
                if (alpha < 0.004) discard;

                vec3 coldFoam = vec3(0.22, 0.78, 1.0);
                vec3 violetZeroPoint = vec3(0.68, 0.42, 1.0);
                vec3 col = mix(coldFoam, violetZeroPoint, clamp(vNoiseVal, 0.0, 1.0));

                gl_FragColor = vec4(col, alpha);
            }
        `
    });
}