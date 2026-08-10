# Amendments to existing stories — BRD v7.0 (direction scoping)

Direction is a cross-cutting scoping axis, so several already-written stories gain
acceptance criteria rather than being replaced. Apply these before starting the story.
EPIC-08 holds the work that is genuinely new.

| Story | Amendment required |
| :--- | :--- |
| STORY-01-01 | The client record gains `enabledDirections`. A direction cannot be enabled without a valid registry for it. |
| STORY-01-03 | Isolation guard extends from a client predicate to a client-and-direction predicate on counter and transaction access. |
| STORY-02-01 | Registry snapshot becomes a map keyed by direction. Both directions swap in one atomic operation so versions cannot diverge. |
| STORY-02-02 | Windows are declared per direction. The same dimension code may declare different windows in each direction. |
| STORY-02-04 | Limit definitions carry an immutable `direction`. CRUD paths become direction-scoped. |
| STORY-02-05 | Inert-definition warnings gain a third cause: the direction is not enabled. |
| STORY-02-06 | Definition and registry caches key on the client-and-direction pair. |
| STORY-03-01 | Counter key builder inserts the direction segment immediately after the client identifier. |
| STORY-03-02 | The mandatory global per-transaction cap is mandatory **per enabled direction**. |
| STORY-03-04 | `hot` and `shardFactor` are declared per direction. A combined dimension is sized against the summed rate of both. |
| STORY-04-01 | Transaction primary key becomes the client, direction and transaction identifier triple. |
| STORY-04-03 | The waterfall iterates the dimensions declared for that client **and direction** only. |
| STORY-04-05 | Audit records carry direction, and each applied counter key records the direction segment used. |
| STORY-05-01 | Reversal input gains direction. Combined counters are decremented on their shared neutral key. |
| STORY-05-02 | Reconciliation derives counters per client and direction, and handles the shared combined key separately. |
| STORY-06-01 | Retention sizing is recalculated with inward volume included before inward is enabled. |
| STORY-06-02 | Metrics are dimensioned by direction as well as by client, dimension and window. |
| STORY-07-01 | Load certification states whether the target is per direction or combined. |
| STORY-07-03 | The acceptance pack extends to cover UAT 45 through UAT 52. |
