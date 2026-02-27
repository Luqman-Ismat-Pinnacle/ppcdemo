# Legacy Role Alias Deprecation Notes
Date: 2026-02-27

This release keeps legacy `/role-views/*/*` redirect aliases for compatibility while removing them from user-facing navigation and action bars.

## Policy
1. Legacy aliases remain active to preserve bookmarks/integrations.
2. Header and command-center CTAs should link only to canonical routes.
3. Aliases are considered deprecated and should not be used for new links.

## Canonical-first examples
- `/role-views/pca/data-quality` -> `/role-views/pca?section=data-quality`
- `/role-views/pcl/exceptions` -> `/role-views/pcl?section=exceptions`
- `/role-views/project-lead/report` -> `/role-views/project-lead?section=report`
- `/role-views/project-lead/documents` -> `/role-views/project-lead?section=documents`

## Telemetry follow-up
Track access counts to legacy aliases in server logs and remove aliases in a later cycle once usage is negligible.
