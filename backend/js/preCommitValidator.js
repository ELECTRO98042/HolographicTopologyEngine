// backend/js/preCommitValidator.js
/**
 * Pre-Commit Validator
 * Dual-gate validation engine enforcing physical constraints, bond rules, 
 * orphan checks, and structural integrity before Main HUD synchronization.
 */
export class PreCommitValidator {
    constructor() {
        // Allowed connection matrix matching deck_render.js specs
        this.allowedConnections = {
            'METRIC': ['METRIC', 'TOPOLOGY', 'FIELD', 'POTENTIAL'],
            'TOPOLOGY': ['METRIC', 'TOPOLOGY', 'FIELD', 'POTENTIAL'],
            'FIELD': ['FIELD', 'TOPOLOGY', 'METRIC', 'POTENTIAL'],
            'POTENTIAL': ['POTENTIAL', 'FIELD', 'METRIC', 'TOPOLOGY']
        };
    }

    validate(stagedModel) {
        const violations = [];
        const warnings = [];
        const nodes = stagedModel.nodes || [];
        const edges = stagedModel.edges || [];

        const nodeMap = new Map();
        const seenIds = new Set();

        // 1. Check Node Level Invariants (Duplicates & Invalid Types)
        nodes.forEach((n, idx) => {
            if (seenIds.has(n.id)) {
                violations.push({ code: 'ERR_DUPLICATE_ID', message: `Duplicate node identifier found: '${n.id}'` });
            }
            seenIds.add(n.id);
            nodeMap.set(n.id, n);

            if (!this.allowedConnections[n.type]) {
                violations.push({ code: 'ERR_INVALID_TYPE', message: `Node '${n.id}' has unrecognized type: '${n.type}'` });
            }
        });

        // 2. Check Edge / Tether Level Invariants (Orphaned Edges & Self-Loops)
        const nodeDegrees = new Map();
        nodes.forEach(n => nodeDegrees.set(n.id, 0));

        edges.forEach((e, idx) => {
            const src = e.source;
            const tgt = e.target;

            // Self-reference check
            if (src === tgt) {
                violations.push({ code: 'ERR_SELF_LOOP', message: `Edge index ${idx} forms a self-loop on node '${src}'.` });
                return;
            }

            // Orphaned edge check (referencing non-existent nodes)
            const sourceNode = nodeMap.get(src);
            const targetNode = nodeMap.get(tgt);

            if (!sourceNode || !targetNode) {
                violations.push({
                    code: 'ERR_ORPHANED_EDGE',
                    message: `Edge connects to missing node ID(s) [src: ${src} (${!!sourceNode}), tgt: ${tgt} (${!!targetNode})]`
                });
                return;
            }

            // Increment degree count for connectivity tracking
            nodeDegrees.set(src, nodeDegrees.get(src) + 1);
            nodeDegrees.set(tgt, nodeDegrees.get(tgt) + 1);

            // Bond matrix validity check
            const typeA = sourceNode.type;
            const typeB = targetNode.type;

            if (this.allowedConnections[typeA] && !this.allowedConnections[typeA].includes(typeB)) {
                violations.push({
                    code: 'ERR_ILLEGAL_BOND',
                    message: `Illegal bond coupling between '${sourceNode.id}' (${typeA}) and '${targetNode.id}' (${typeB}).`
                });
            }
        });

        // 3. Check for Fully Isolated Orphan Nodes (Degree 0)
        nodes.forEach(n => {
            if (nodeDegrees.get(n.id) === 0 && nodes.length > 1) {
                warnings.push(`Node '${n.id}' (${n.name}) is completely unlinked (isolated orphan).`);
            }
        });

        // 4. Physics Arbiter Integration Check
        if (window.physicsArbiter && typeof window.physicsArbiter.validateModel === 'function') {
            const arbiterVerdict = window.physicsArbiter.validateModel(stagedModel);
            if (arbiterVerdict && arbiterVerdict.status === 'DENIED') {
                violations.push({ code: arbiterVerdict.code || 'ERR_PHYSICS_VIOLATION', message: arbiterVerdict.message });
            }
        }

        const isValid = violations.length === 0;

        return {
            isValid,
            violations,
            warnings,
            edgeCount: edges.length,
            summary: isValid
                ? 'Model passed all validation gates. Commit unlocked.'
                : `Validation failed with ${violations.length} blocking violation(s).`
        };
    }
}

// Provide both named and default exports to prevent module resolution errors
export default PreCommitValidator;