import * as THREE from 'three';

// =============================================================================
// DOPPLER VISUAL SHADERS — SELF-DOCUMENTING SHADER KNOBS
// =============================================================================
// [↑] = Raising the value | [↓] = Lowering the value
// =============================================================================

export function createDopplerShiftMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uIntensity: { value: 1.0 },
            uTealColor: { value: new THREE.Color(0x06b6d4) },
            uRedColor: { value: new THREE.Color(0xf43f5e) },
            uNeutralColor: { value: new THREE.Color(0x94a3b8) }
        },
        vertexShader: `
            attribute float aDopplerShift;
            attribute float aRadialShift;

            varying vec2 vUv;
            varying float vShiftFactor;
            varying float vRadial;

            uniform float uTime;

            void main() {
                vUv = uv;
                vShiftFactor = aDopplerShift;
                vRadial = aRadialShift;

                vec3 pos = position;
                float pulse = sin(uTime * clamp(2.0 * max(0.35, aDopplerShift), 0.5, 6.0)) * 0.05;
                pos *= (1.0 + pulse);

                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            varying float vShiftFactor;
            varying float vRadial;

            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uTealColor;
            uniform vec3 uRedColor;
            uniform vec3 uNeutralColor;

            void main() {
                vec2 centered = (vUv - 0.5) * 2.0;
                float r = length(centered);
                if (r > 1.0) discard;

                float shiftDelta = clamp((vShiftFactor - 1.0) * 8.0, -1.0, 1.0);
                float freq = clamp(4.0 * max(0.35, vShiftFactor), 1.0, 10.0);
                float animatedRadius = 0.45 + 0.35 * (0.5 + 0.5 * sin(uTime * freq - r * 6.0));
                float ringBand = 1.0 - smoothstep(0.0, 0.08, abs(r - animatedRadius));
                float outerRim = 1.0 - smoothstep(0.0, 0.03, abs(r - 0.88));

                vec3 col = uNeutralColor;
                if (shiftDelta > 0.03) {
                    col = mix(uNeutralColor, uTealColor, clamp(shiftDelta, 0.0, 1.0));
                } else if (shiftDelta < -0.03) {
                    col = mix(uNeutralColor, uRedColor, clamp(-shiftDelta, 0.0, 1.0));
                }

                float alpha = (ringBand * 0.8 + outerRim * 0.3) * clamp(uIntensity, 0.2, 1.5);
                if (alpha < 0.02) discard;

                gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.9));
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
    });
}

/**
 * 3D Trajectory Searchlight Beam Cone
 * - Apex sits at node (y = 0); outer mouth flares to y = -1 along velocity vector.
 * - Radial gradient is measured from the cone centerline (0.0) to its outer wall (1.0)
 *   so the beam reads clearly from any camera angle.
 *
 * Tuning guide:
 *   [↑] Raising the value   |   [↓] Lowering the value
 */
export function createSearchlightBeamMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uIntensity: { value: 1.0 },
            uBeamOpacity: { value: 0.65 },   // [↑] Brighter nozzle spray cone  | [↓] Softer translucent cone
            uAxialFalloff: { value: 1.45 },  // [↑] Tighter near-node focus    | [↓] Longer diffused throw
            uRadialFalloff: { value: 1.15 }, // [↑] More focused cone beam     | [↓] Wider radial spray spread
            uTealColor: { value: new THREE.Color(0x06b6d4) },
            uRedColor: { value: new THREE.Color(0xf43f5e) }
        },
        vertexShader: `
            attribute float aShiftPolarity; // >= 0.0 Teal (vx >= 0), < 0.0 Red (vx < 0)
            attribute float aMachRatio;

            varying float vPolarity;
            varying float vMach;
            varying float vAlongNorm;     // 0.0 at node nozzle -> 1.0 at far cone edge
            varying float vRadialNorm;    // 0.0 along beam axis -> 1.0 at outer cone wall

            void main() {
                vPolarity = aShiftPolarity;
                vMach = aMachRatio;

                // Apex at y = 0 (node), mouth at y = -1 along velocity direction
                float along = clamp(-position.y, 0.0, 1.0);
                float sliceRadius = max(0.0001, along);
                float radialDist = length(position.xz);

                vAlongNorm = along;
                vRadialNorm = clamp(radialDist / sliceRadius, 0.0, 1.0);

                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying float vPolarity;
            varying float vMach;
            varying float vAlongNorm;
            varying float vRadialNorm;

            uniform float uTime;
            uniform float uIntensity;
            uniform float uBeamOpacity;
            uniform float uAxialFalloff;
            uniform float uRadialFalloff;
            uniform vec3 uTealColor;
            uniform vec3 uRedColor;

            void main() {
                // Focused near the node nozzle, diffusing smoothly outward
                float axialGlow = pow(clamp(1.0 - vAlongNorm, 0.0, 1.0), uAxialFalloff);
                float radialGlow = pow(clamp(1.0 - vRadialNorm, 0.0, 1.0), uRadialFalloff);

                // Directional spray pulse moving outward from the node
                float sprayPulse = 0.80 + 0.20 * sin(vAlongNorm * 14.0 - uTime * (4.0 + vMach * 4.5));

                vec3 baseCol = vPolarity >= 0.0 ? uTealColor : uRedColor;
                vec3 col = mix(baseCol, vec3(1.0), axialGlow * radialGlow * 0.30);

                float alpha = axialGlow * radialGlow * sprayPulse * uBeamOpacity * clamp(uIntensity, 0.25, 2.0);
                if (alpha < 0.005) discard;

                gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.9));
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
    });
}

/**
 * Spindle-Tapered, Undulating Pairwise Tubule Shader
 * - Tapers at both ends (sin(vUv.y * PI)) so thick sleeves don't crowd the nodes.
 * - Swells mid-span and undulates/twists according to pairwise closing vs. separating state.
 */
export function createPairwiseTubuleMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uOpacity: { value: 0.34 },     // [↑] More visible pairwise sleeve | [↓] Lighter translucent sleeve
            uTwistSpeed: { value: 2.2 },   // [↑] Faster helical spin          | [↓] Slower rotation
            uWaveSpeed: { value: 2.5 },    // [↑] Faster wave undulation       | [↓] Slower undulation
            uRibContrast: { value: 0.55 }  // [↑] Stronger directional pulses  | [↓] Smoother gradient
        },
        vertexShader: `
            attribute float aClosingState; // > 0 closing (violet), < 0 separating (orange)
            attribute float aWaveAmp;

            varying vec2 vUv;
            varying vec3 vColor;
            varying float vClosing;

            uniform float uTime;
            uniform float uTwistSpeed;
            uniform float uWaveSpeed;

            void main() {
                vUv = uv;
                vClosing = aClosingState;
                vColor = instanceColor;

                vec3 pos = position;
                // vUv.y runs 0..1 along tubule length; spindle envelope tapers ends & swells center
                float spanEnv = sin(vUv.y * 3.14159265);
                float spindleScale = mix(0.32, 1.15, spanEnv);
                pos.xz *= spindleScale;

                // Helical twist: positive closing spins one way, negative separating spins opposite
                float dirSign = aClosingState >= 0.0 ? 1.0 : -1.0;
                float twistAngle = uTime * (uTwistSpeed + abs(aClosingState) * 3.5) * dirSign + vUv.y * 5.0;
                float cs = cos(twistAngle);
                float sn = sin(twistAngle);
                pos.xz = mat2(cs, -sn, sn, cs) * pos.xz;

                // Transverse wave undulation along the pair span
                float wavePhase = vUv.y * 9.424778 - uTime * uWaveSpeed * dirSign;
                float amp = clamp(aWaveAmp, 0.0, 1.2);
                pos.x += sin(wavePhase) * amp * spanEnv;
                pos.z += cos(wavePhase * 0.8) * amp * 0.65 * spanEnv;

                vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPos;
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            varying vec3 vColor;
            varying float vClosing;

            uniform float uTime;
            uniform float uOpacity;
            uniform float uRibContrast;

            void main() {
                float spanEnv = sin(vUv.y * 3.14159265);
                float dirSign = vClosing >= 0.0 ? 1.0 : -1.0;

                // Directional wave bands moving inward when closing, outward when separating
                float band = 0.5 + 0.5 * sin(vUv.y * 25.1327 - uTime * 4.5 * dirSign);
                float modFactor = mix(1.0, band, uRibContrast);

                float alpha = uOpacity * (0.20 + 0.80 * spanEnv) * modFactor;
                if (alpha < 0.006) discard;

                gl_FragColor = vec4(vColor, clamp(alpha, 0.0, 0.42));
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
    });
}

/**
 * Volumetric Cylindrical Dipole Material
 * - Renders smooth 3D cylindrical shading along each instanced shaft.
 * - uOpacity controls semi-transparency directly (0.0 = invisible, 1.0 = solid).
 */
export function createDipoleCylinderMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uOpacity: { value: 0.45 } // [↑] More opaque cylinder | [↓] More transparent cylinder
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vColor;
            varying vec3 vNormalView;
            varying vec3 vViewDir;

            uniform float uTime;

            void main() {
                vUv = uv;
                vColor = instanceColor;

                // Subtle axial breathing along the dipole shaft (vUv.y: 0 = base, 1 = tip)
                vec3 pos = position;
                float tipTaper = mix(1.0, 0.55, pow(vUv.y, 1.5));
                pos.xz *= tipTaper;

                vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
                vNormalView = normalize(normalMatrix * normal);
                vViewDir = normalize(-mvPos.xyz);

                gl_Position = projectionMatrix * mvPos;
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            varying vec3 vColor;
            varying vec3 vNormalView;
            varying vec3 vViewDir;

            uniform float uTime;
            uniform float uOpacity;

            void main() {
                // Cylindrical rim/core shading so it looks round in 3D, not flat
                float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
                float cylShade = mix(0.65, 1.15, pow(ndotv, 0.7));

                // Fade slightly toward the far tip so the shaft blends cleanly
                float tipFade = 1.0 - smoothstep(0.65, 1.0, vUv.y) * 0.45;
                float pulse = 0.90 + 0.10 * sin(vUv.y * 8.0 - uTime * 3.5);

                float alpha = clamp(uOpacity * tipFade * pulse, 0.0, 1.0);
                if (alpha < 0.005) discard;

                gl_FragColor = vec4(vColor * cylShade, alpha);
            }
        `,
        transparent: true,
        blending: THREE.NormalBlending, // NormalBlending lets uOpacity act as true see-through opacity
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
    });
}