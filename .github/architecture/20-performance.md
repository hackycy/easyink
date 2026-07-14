# 20. Performance And Resource Budgets

Performance correctness is part of the Viewer contract. Caches are bounded, dependency-complete, and generation-aware; budgets are reserved before allocation; superseded work cannot publish.

## 20.1 Explicit dependency keys

Every reusable result declares the dependencies that can change it. Depending on the stage, keys include:

- compiled profile identity and execution mode;
- material type, runtime instance key, and node revision;
- document revision, node graph revision, and data revision;
- resource revision and layout constraint key;
- available width and height, unit, and writing mode;
- prepared collection or row source revision;
- page, fragment range, and render policy identity.

Measure cache keys include profile, mode, type, instance, node, document, data, resource, and constraints. Runtime-model and prepared-data caches include their scope and data dependencies. Page DOM retention is not a layout or pagination cache key because virtualization cannot change committed facts.

All caches have host-configured entry limits. Eviction cannot retain strong descendant graphs or unbounded historical tombstones. Published values are copied and recursively frozen without freezing caller-owned inputs.

## 20.2 Admission and inline data

Document admission bounds material nodes, JSON nodes, depth, and string bytes before graph expansion. Inline data is copied with explicit node and string-byte limits. Effective runtime limits use the minimum applicable host limit, including inline-data nodes, runtime rows, layout facts, render-tree nodes, and browser DOM nodes.

Prepared collections reserve row and key-token budgets before materialization. Keys have token and byte limits. Runtime-row and layout-fact reservations use host budget tokens; material-local defaults cannot increase them.

## 20.3 Layout and render tokens

`MaterialLayoutBudgetToken` bounds runtime rows, layout facts, and fragmentation work. `MaterialRenderBudgetToken` bounds every element, text, fragment, markup, and imperative node across a root material and its nested slots. Core-created wrapper and fallback nodes consume the same shared token.

Large arrays, row models, layout facts, break indexes, render trees, and page slot registries are preallocated only after their reservation succeeds. Over-limit work is quarantined with stable diagnostics before allocation or DOM mutation. A material cannot swallow a budget error and continue consuming the generation.

## 20.4 Scheduling and cancellation

The measure scheduler has a bounded in-flight count. Resource preparation, runtime-model resolution, measure, layout, fragmentation, and render commits carry the generation's cancellation signal. Each asynchronous boundary and synchronous mount registration checkpoints cancellation and supersession.

Only the current generation may publish diagnostics, cache entries, revisions, or DOM. Candidate roots and mounts are disposed in reverse order on failure. Requested revisions remain distinct from committed revisions until the atomic root swap succeeds.

## 20.5 Page DOM and output readers

Interactive page virtualization retains a bounded page window plus configured overscan. Stable page slots preserve scroll geometry while material DOM is absent. Page unmount disposes page-local mounts only; the single profile material runtime owns shared facets.

Print and export acquire committed reader leases and materialize all pages. A waiting writer cannot partially replace the batch. Destroy revokes readers, cancels pending work, disposes candidate and committed mounts, then disposes the layout runtime, material runtime, resources, measures, and host in deterministic order.

## 20.6 Diagnostics

Budget, admission, resource, measure, fragmentation, render, cleanup, and cancellation failures use stable diagnostic codes with material type, node id, runtime instance, revision, requested count, used count, and limit where applicable. Quarantine is scoped to the failed profile/surface/generation facts and never mutates persisted Schema.

Performance tests use deterministic operation counts, reservation results, cache sizes, and retained-page counts instead of wall-clock thresholds.
