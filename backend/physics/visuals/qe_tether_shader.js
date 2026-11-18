import * as THREE from 'three';

/**
 * Creates a custom ShaderMaterial for Quantum Entanglement (QE) tethers.
 * Features:
 * - Luminous purple core with additive blending
 * - Phase-shifted sine wave modulation (superposition)
 * - Stochastic vertex wiggle (quantum foam effect)
 * - Traveling white-hot energy pulse driven by uTime along vUv.y
 */
export function createQETetherMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uColor: { value: new THREE.Color(0x9d4edd) }, // Luminous QE Purple
            uPulseSpeed: { value: 2.5 }
        },
        vertexShader: `
            varying vec2 vUv;
            uniform float uTime;
            
            void main() {
                vUv = uv;
                vec3 pos = position;
                
                // Stochastic quantum wiggle / displacement along the midpoint
                float wiggle = sin(pos.x * 12.0 + uTime * 5.0) * cos(pos.y * 12.0 + uTime * 4.0);
                pos += normal * wiggle * 0.12 * sin(uv.y * 3.1415); // Damped at endpoints
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uPulseSpeed;

            void main() {
                // Standing wave pulsation along the tether length (vUv.y)
                float wave = sin(vUv.y * 25.0 - uTime * 6.0) * 0.5 + 0.5;
                
                // Traveling energy pulse across the tether length
                float pulsePos = mod(uTime * uPulseSpeed, 1.0);
                float pulseDist = abs(vUv.y - pulsePos);
                float pulse = smoothstep(0.08, 0.0, pulseDist) * 3.5;

                // Color blend: Base purple core transitioning to white-hot at the pulse peak
                vec3 baseGlow = uColor * (0.4 + 0.4 * wave);
                vec3 pulseColor = mix(baseGlow, vec3(0.9, 1.0, 1.5), pulse);
                
                float alpha = 0.25 + 0.45 * wave + pulse;

                gl_FragColor = vec4(pulseColor, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}