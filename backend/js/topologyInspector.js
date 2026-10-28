// Current selected node tracker
window.selectedNodeId = window.selectedNodeId || null;

// Call this whenever a node is clicked/selected in the 3D viewport renderer
function selectNodeForInspection(nodeId) {
    const nodes = window.nodes || [];
    const node = nodes.find(n => n.id === nodeId);
    
    const inspectorBody = document.getElementById('inspector-body');
    const inspectorStatus = document.getElementById('inspector-status');

    if (!node) {
        window.selectedNodeId = null;
        if (inspectorStatus) {
            inspectorStatus.textContent = "NO SELECTION";
            inspectorStatus.className = "text-[9px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700";
        }
        if (inspectorBody) {
            inspectorBody.innerHTML = `<div class="text-slate-500 italic text-center pt-8">Select a node on the deck to inspect its field equations and metric parameters.</div>`;
        }
        return;
    }

    window.selectedNodeId = node.id;
    
    // Update header status badge
    if (inspectorStatus) {
        inspectorStatus.textContent = `ACTIVE: ${node.id}`;
        inspectorStatus.className = "text-[9px] font-mono text-engine-cyan bg-engine-cyan/10 px-1.5 py-0.5 rounded border border-engine-cyan/30";
    }

    // Populate Inspector Body with editable controls and formulas
    inspectorBody.innerHTML = `
        <div class="space-y-3">
            <div class="bg-slate-900/90 border border-engine-border rounded p-2.5">
                <div class="text-[10px] text-slate-500">NODE ID & TYPE</div>
                <div class="text-sm font-bold text-engine-cyan flex justify-between items-center mt-0.5">
                    <span>${node.label}</span>
                    <span class="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">${node.category || 'METRIC'}</span>
                </div>
            </div>

            <div class="bg-slate-950/80 border border-engine-border rounded p-2.5">
                <div class="text-[10px] text-slate-500 mb-1">FIELD EQUATION / FORMULA</div>
                <div class="font-mono text-engine-amber bg-slate-900 p-2 rounded border border-engine-border/50 text-[11px] overflow-x-auto">
                    ${node.formula || 'g_μν = η_μν + h_μν'}
                </div>
            </div>

            <div class="space-y-2 bg-slate-900/60 border border-engine-border rounded p-2.5">
                <div class="text-[10px] text-slate-400 font-semibold">METRIC PARAMETERS</div>
                
                <div class="flex flex-col space-y-1">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-400">Field Intensity (Φ):</span>
                        <span id="val-intensity" class="text-engine-cyan font-mono">${(node.fieldIntensity ?? 1.0).toFixed(2)}</span>
                    </div>
                    <input type="range" min="0.1" max="5.0" step="0.05" value="${node.fieldIntensity ?? 1.0}"
                        oninput="updateNodeParam('${node.id}', 'fieldIntensity', parseFloat(this.value))"
                        class="w-full accent-engine-cyan bg-slate-800 h-1 rounded cursor-pointer">
                </div>

                <div class="flex flex-col space-y-1 pt-1">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-400">Angular Momentum / Spin:</span>
                        <span id="val-spin" class="text-engine-cyan font-mono">${(node.spin ?? 0.0).toFixed(2)}</span>
                    </div>
                    <input type="range" min="-1.0" max="1.0" step="0.05" value="${node.spin ?? 0.0}"
                        oninput="updateNodeParam('${node.id}', 'spin', parseFloat(this.value))"
                        class="w-full accent-engine-cyan bg-slate-800 h-1 rounded cursor-pointer">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1">
                <button onclick="centerViewportOnNode('${node.id}')" 
                    class="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 border border-engine-border hover:border-engine-cyan/50 text-slate-300 rounded text-[11px] transition-all">
                    Center View
                </button>
                <button onclick="deleteNode('${node.id}')" 
                    class="py-1.5 px-2 bg-engine-red/10 hover:bg-engine-red/20 border border-engine-red/30 text-engine-red rounded text-[11px] transition-all">
                    Remove Node
                </button>
            </div>
        </div>
    `;
}

// Live parameter modification handler
function updateNodeParam(nodeId, paramKey, value) {
    const nodes = window.nodes || [];
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    node[paramKey] = value;
    
    // Update live badge text if exists
    const spanVal = document.getElementById(`val-${paramKey === 'fieldIntensity' ? 'intensity' : 'spin'}`);
    if (spanVal) {
        spanVal.textContent = value.toFixed(2);
    }

    // Trigger deck renderer update if available
    if (window.deckViewport && typeof window.deckViewport.markDirty === 'function') {
        window.deckViewport.markDirty();
    }
}

// Node deletion handler
function deleteNode(nodeId) {
    window.nodes = (window.nodes || []).filter(n => n.id !== nodeId);
    selectNodeForInspection(null);
    
    const badge = document.getElementById('node-count-badge');
    if (badge) badge.textContent = window.nodes.length;
}

// Expose globally
window.selectNodeForInspection = selectNodeForInspection;
window.updateNodeParam = updateNodeParam;
window.deleteNode = deleteNode;