
/**
 * Acquires the synchronization lock for a report.
 */
async function acquireSyncLock({
    reportName,
    SELECT,
    INSERT,
    UPDATE,
    ReportSyncStatus
}) {
    let syncStatus = await SELECT.one
        .from(ReportSyncStatus)
        .where({
            reportName
        });

    const isFirstSync = !syncStatus?.lastSyncAt;

    const LOCK_TIMEOUT_MS = isFirstSync
        ? 2 * 60 * 60 * 1000   // 2 hours
        : 1 * 60 * 60 * 1000;   // 1 hour

    const now = new Date();

    // ============================================================
    // Existing running synchronization
    // ============================================================

    if (syncStatus?.isRunning) {

        const runningSince = syncStatus.runningSince
            ? new Date(syncStatus.runningSince)
            : null;

        const lockExpired =
            !runningSince ||
            (now.getTime() - runningSince.getTime()) >= LOCK_TIMEOUT_MS;

        // Lock is still valid
        if (!lockExpired) {
            return {
                acquired: false,
                isFirstSync,
                syncStatus
            };
        }

        // ========================================================
        // Stale lock - previous process was interrupted
        // ========================================================

        console.warn(
            `[${reportName}] Stale synchronization lock detected. ` +
            `runningSince=${runningSince?.toISOString()}, ` +
            `timeout=${LOCK_TIMEOUT_MS / 60 / 1000} minutes`
        );

        await UPDATE(ReportSyncStatus)
            .set({
                isRunning: false,
                lastSyncStatus: "FAILED",
                lastRunAt: now,
                message:
                    "Previous synchronization was interrupted or timed out."
            })
            .where({
                reportName
            });

        // Refresh status after stale-lock recovery
        syncStatus = await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName
            });
    }

    // ============================================================
    // Acquire lock
    // ============================================================

    const runningSince = new Date();

    if (!syncStatus) {

        await INSERT
            .into(ReportSyncStatus)
            .entries({
                reportName,
                lastSyncStatus: "RUNNING",
                isRunning: true,
                runningSince
            });

        syncStatus = {
            reportName,
            lastSyncAt: null,
            isRunning: true,
            runningSince
        };

    } else {

        await UPDATE(ReportSyncStatus)
            .set({
                isRunning: true,
                runningSince,
                lastSyncStatus: "RUNNING"
            })
            .where({
                reportName
            });
    }

    return {
        acquired: true,
        isFirstSync,
        syncStatus
    };
}

module.exports={
    acquireSyncLock
}