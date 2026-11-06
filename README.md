## 📜 License & Commercial Rights

This repository is licensed under the **PolyForm Noncommercial License 1.0.0**. 

- **Academic, personal, and research use:** Free to use, modify, and distribute under non-commercial terms.
- **Commercial use:** Commercial use, integration into proprietary software, or monetized deployments require an explicit commercial license. Please contact the maintainer to acquire a commercial licensing agreement.

# Holographic Topology Engine v2.8.2

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.8.2-blue.svg)](https://github.com/ELECTRO98042/HolographicTopologyEngine)
[![Status](https://img.shields.io/badge/status-active--development-green.svg)](#)
[![Python Version](https://img.shields.io/badge/python-3.10%2B-blueviolet.svg)](https://www.python.org/)
[![WebGL 2.0](https://img.shields.io/badge/WebGL-2.0-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext)

A high-performance computational geometry and volumetric visualization engine engineered for advanced theoretical physics research, real-time quantum field simulations, and holographic boundary-bulk mapping. 

The engine implements **AdS/CFT bulk-boundary correspondence**, non-Abelian **Yang-Mills $SU(3)$ gauge field tensors**, relativistic **Schwarzschild spacetime curvature metrics**, and a unified **6-pass physical wave interference pipeline** backed by a high-speed Python/FastAPI compute telemetry core.

---

## 🔬 Professional Research Applications

The Holographic Topology Engine is designed to support academic and industrial theoretical physics research by providing a controlled interactive testbed for complex non-linear field dynamics:

- **Gauge-Gravity Duality Modeling:** Explore conformal field theory (CFT) boundary responses driven by bulk anti-de Sitter (AdS) gravitational geometries and black hole horizon perturbations.
- **Yang-Mills Confinement & Chromomagnetic Fields:** Simulate color-charge flux tube dynamics, topological winding configurations, and vacuum expectation values under varying coupling constants ($g$).
- **Gravitational Lensing & Spacetime Stress-Energy:** Visualize relativistic light bending, metric tensor distortions, and graviton-scalar wave interactions near extreme curvature regimes.
- **Quantum Vacuum Fluctuations:** Analyze Klein-Gordon scalar wave energy densities and modular thermal sink dissipation across high-density 3D spatial grids.

---

## 📊 Core Metrics & Telemetry Provided

During live simulation runs, the engine calculates and streams high-precision physical telemetry metrics over WebSocket and diagnostic buffers:

* **Energy-Momentum Tensor ($T_{\mu\nu}$):** Real-time spatial tracking of energy density, momentum flux, and shear stress across lattice nodes.
* **Ricci Curvature & Metric Scalars:** Dynamic evaluation of scalar curvature invariants ($R$) and radial dropoff gradients under Schwarzschild metric deformations.
* **Color-Charge Field Strengths ($F_{\mu\nu}^a$):** Quantitative tensor evaluations of non-Abelian gauge fields across interior node points.
* **Entanglement & Flux Density Approximations:** Bounded spatial energy conservation logs and phase coherence tracking.
* **Frame Performance Telemetry:** Sub-millisecond tracking of GPU draw times, pass latency, and memory allocation spikes inside the render loop.

---

## 🛠️ Data Interoperability: Import & Export Functions

The engine includes robust data serialization to bridge real-time WebGL rendering with heavy offline analytical tools:

* **State Snapshots (JSON/YAML):** Export and import full simulation parameters, camera states, node matrices, and field configurations instantly.
* **Binary Frame Channels:** High-throughput streaming of raw float32 tensor arrays via binary WebSocket channels for external logging.
* **Raw Grid Dumps:** Export 3D spatial lattices into standard multi-dimensional array structures (`.npy`/`.csv`) for post-processing in external environments.

---

## 📓 Scientific Journal & Jupyter Notebook Integration

To facilitate academic publishing and reproducible research, v2.8.2 introduces direct integration with interactive data science notebooks:

* **Jupyter Export Pipelines:** Automatically export live telemetry logs, state parameters, and time-series evolution data directly into structured `.ipynb` notebooks.
* **Post-Processing Scripts:** Includes pre-built Python scripts for generating publication-quality matplotlib/seaborn phase space diagrams, contour plots of Yang-Mills color fields, and energy conservation graphs directly from recorded session data.

---

## 🧪 The Scientific Testing Suite

To ensure mathematical rigor and numerical stability, the engine features an integrated **Scientific Testing Suite**:

* **Moiré Interference Regression Checks:** Automated verification passes that detect and eliminate spatial aliasing and moiré artifacts across high-frequency wave overlaps.
* **Z-Axis Boundary Integrity Tests:** Validates unclipped spatial rendering across extended coordinate bounds ($-140$ to $+140$).
* **Energy Boundedness Stress Tests:** Long-duration execution testing (1+ hours) ensuring scalar wave equations and thermal sinks remain physically bounded without energy drift or numerical explosion.
* **Visual Regression Benchmarks:** Compares active render outputs against reference tensor baselines to prevent visual degradation during shader updates.

---

## ⚙️ Custom Build & Modular Configuration

The architecture is built for extensibility, allowing researchers to inject custom physical models:

* **Custom Node Properties:** Easily extend lattice nodes with custom scalar, vector, or tensor properties via the modular backend compute API.
* **Custom Shader Passes:** Insert proprietary GLSL fragment or compute shaders into the render pipeline alongside the standard 6-pass interference suite.
* **Configurable Compute Scaling:** Switch seamlessly between lightweight local browser execution and heavy distributed FastAPI backend crunching.

---

## Unified 6-Pass Volumetric Interference Pipeline

1. **Thermal Pass:** Hawking radiation simulation & modular thermal sink dissipation fields.
2. **Wave Pass:** Klein-Gordon scalar wave equations and quantum vacuum energy fluctuations.
3. **EMP Pass:** Magnetohydrodynamic (MHD) shockwaves and electromagnetic pulse fronts.
4. **Atmosphere Pass:** Dynamic volumetric mist, density variation, and turbulent eddy shear.
5. **Doppler Pass:** Relativistic frequency-shifted emission cones for directional sources.
6. **Multipath Pass:** Gravitational lensing caustics and multipath wave convergence.

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

1.    Clone the repository:

Bash

git clone https://github.com/ELECTRO98042/HolographicTopologyEngine.git
cd HolographicTopologyEngine

2.  Start the FastAPI backend server:

Bash

cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

3.  Launch the frontend interface:
Open src/index.html in your WebGL 2.0 compatible browser or serve locally using a static web server:

Bash

npx serve src/

Configuration & Runtime HUD Controls

Live simulation parameter tuning is exposed via integrated HUD side-car controls:

Control                 Parameter            Range           Default	Description
Grid Resolution         $18 - 144$ rows      $72$            Bulk spatial lattice row density
Z-Bound Range           $[-200, +200]$       $[-140, +140]$  Vertical coordinate rendering extent
Pass Compositing        Screen / Additive    Screen          Overlay blending mode for diagnostic renders
Doppler Shift $\beta$   $0.0 - 0.99c$        $0.15c$         Relativistic velocity factor for emission cones
Color Charge $g$        $0.1 - 5.0$          $1.2$           Yang-Mills $SU(3)$ coupling constant

License

Distributed under the MIT License. See LICENSE for more information.






     
