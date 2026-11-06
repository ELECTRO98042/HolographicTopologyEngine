# Holographic Topology Engine v2.8.2

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.8.2-blue.svg)](https://github.com/ELECTRO98042/HolographicTopologyEngine-v2.5)
[![Status](https://img.shields.io/badge/status-active--development-green.svg)](#)

A high-performance computational geometry and volumetric visualization engine implementing **AdS/CFT bulk-boundary correspondence**, **Yang-Mills $SU(3)$ gauge field tensors**, **Schwarzschild metric spacetime curvature**, and a unified **6-pass physical wave interference pipeline**.

Designed for real-time theoretical physics simulation, field topology analysis, and high-density spatial rendering.

---

## Key Features in v2.8.2

- **Yang-Mills $SU(3)$ Gauge Integration**: Full color-charge field matrix evaluation across interior lattice node points.
- **Schwarzschild Spacetime Curvature**: Relativistic radial metric distortions with unclipped boundary dynamics.
- **Unified 6-Pass Volumetric Interference Engine**:
  1. **Thermal Pass**: Hawking radiation simulation and modular thermal sink dissipation fields.
  2. **Wave Pass**: Klein-Gordon scalar wave synthesis and quantum vacuum energy fluctuations.
  3. **EMP Pass**: Magnetohydrodynamic (MHD) shockwave propagation and pulse fronts.
  4. **Atmosphere Pass**: Volumetric mist, spatial density gradients, and turbulent eddy shear.
  5. **Doppler Pass**: Relativistic frequency-shifted emission cones for moving spatial emitters.
  6. **Multipath Pass**: Gravitational lensing caustics and multipath wave convergence.
- **Additive Diagnostic Pipeline**: Centralized `drawAdditiveDiagnosticOverlays()` utilizing `screen` compositing to prevent brightness blowouts across overlapping high-energy passes.
- **Expanded Bulk Geometry Volume**: Native $900 \times 900$ world space featuring 72 grid rows and Z-axis spatial bounds spanning $[-140, +140]$ without spatial clipping or moiré artifacts.

---

## Architectural & Mathematical Overview

The engine maintains dual representation of bulk spatial geometry and boundary field states via anti-de Sitter / Conformal Field Theory (AdS/CFT) mappings.

### 1. Spacetime Metric & Curvature
Spacetime distortion near black hole horizons and massive nodes is calculated using the Schwarzschild metric tensor component:

$$g_{00} = -\left(1 - \frac{2GM}{c^2 r}\right), \quad g_{rr} = \left(1 - \frac{2GM}{c^2 r}\right)^{-1}$$

Radial displacement scales continuously across the grid to prevent numerical instabilities near horizon boundaries.

### 2. Yang-Mills $SU(3)$ Field Tensor
Color-charge field dynamics evaluate the non-Abelian field strength tensor $F_{\mu\nu}^a$:

$$F_{\mu\nu}^a = \partial_\mu A_\nu^a - \partial_\nu A_\mu^a + g f^{abc} A_\mu^b A_\nu^c$$

where $f^{abc}$ represent the structure constants of the $SU(3)$ Lie algebra.

### 3. Klein-Gordon Scalar Wave Equation
Scalar field propagation throughout the 6-pass interference engine obeys the relativistic wave equation:

$$\left( \Box + \frac{m^2 c^2}{\hbar^2} \right) \Psi(\mathbf{r}, t) = 0$$

---

## Repository Structure

```text
├── README.md               # Repository overview, math foundations, and quickstart
├── CHANGELOG.md            # Release notes detailing v2.5 to v2.8.2 progression
├── docs/                   # Node-by-node physics specs and operation manuals
├── src/                    # Core WebGL/JS engine & 6-pass interference pipeline
├── backend/                # FastAPI web server and WebSocket telemetry side-cars
├── assets/                 # Renders, diagnostic diagrams, and visual captures
└── installers/             # Cross-platform build configurations (Linux, macOS, Windows)

Quickstart & Installation
Prerequisites

    Node.js: v18.0.0 or higher

    Python: v3.10+ (for FastAPI side-car telemetry server)

    Modern web browser with WebGL 2.0 support

Running Locally

    Clone the repository:
    Bash

    git clone [https://github.com/ELECTRO98042/HolographicTopologyEngine-v2.5.git](https://github.com/ELECTRO98042/HolographicTopologyEngine-v2.5.git)
    cd HolographicTopologyEngine-v2.5

    Start the FastAPI backend server:
    Bash

    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

    Launch the frontend interface:
    Open src/index.html in your WebGL 2.0 compatible browser or serve locally using a static web server:
    Bash

    npx serve src/

Configuration & Runtime HUD Controls

Live simulation parameter tuning is exposed via integrated HUD side-car controls:
Control Parameter	Range	Default	Description
Grid Resolution	18−144 rows	72	Bulk spatial lattice row density
Z-Bound Range	[−200,+200]	[−140,+140]	Vertical coordinate rendering extent
Pass Compositing	Screen / Additive	Screen	Overlay blending mode for diagnostic renders
Doppler Shift β	0.0−0.99c	0.15c	Relativistic velocity factor for emission cones
Color Charge g	0.1−5.0	1.2	Yang-Mills SU(3) coupling constant
License

Distributed under the MIT License. See LICENSE for more information.


***

### Next Steps:
1. You can save this text directly as `README.md` in your project root folder.
2. If you'd like, we can draft `CHANGELOG.md` next to detail the exact transition from **v2.5** up to **v2.8.2**, or outline the `docs/` folder for node-by-node physics specifications. How would you like to proceed?


