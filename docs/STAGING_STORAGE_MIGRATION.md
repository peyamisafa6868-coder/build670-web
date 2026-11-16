# BUILD670 staging persistence migration gate

This branch is **not** deployed. It only makes the scan checkpoint directory configurable using `BUILD670_SCAN_DATA_DIR`. Without the variable, existing behavior is unchanged.

## Data safety gates before mounting a volume

1. Freeze new scans and inventory existing staging checkpoint files (`runtime-data/scan-*.json`, `latest-scan.json`) from the **running container**, without restarting or redeploying it.
2. Export those files to an independently verified backup location; record file counts and SHA-256 digests. The Railway OAuth connection cannot read container files, so this step requires an authorized container-access/export method.
3. Verify restore into an isolated environment and ensure scan ownership, job metadata and all results survive. Do not treat a new empty volume as a backup.
4. Only after the export is verified, attach a staging-only volume mounted at `/data`, set `BUILD670_SCAN_DATA_DIR=/data/scan-checkpoints`, and restore files **before** resuming scans. Volume attachment redeploys the service.
5. Run tests for restart recovery, authenticated access, storage health, checkpoint retention, failure handling, and backup/restore. Existing policy still restores at most four scans younger than two hours; long-term retention requires a separate reviewed change.
6. Never change `main`, production, user token variables, or existing users as part of this migration.

If any export or restore gate fails, **do not attach or deploy**. Keep the existing staging instance intact.
