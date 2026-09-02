const cds = require("@sap/cds");

function getSecondPrecisionTimestamp(timestamp) {
    if (!timestamp) {
        return "";
    }

    const date =
        timestamp instanceof Date
            ? timestamp
            : new Date(timestamp);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return String(timestamp);
    }

    return date
        .toISOString()
        .slice(0, 19);
}

function deduplicateUserAuditEntries(
    entries
) {
    const unique =
        new Map();

    if (!Array.isArray(entries)) {
        return [];
    }

    for (const entry of entries) {
        if (!entry) {
            continue;
        }

        const timestamp =
            getSecondPrecisionTimestamp(
                entry.timestamp
            );

        const key = [
            entry.system || "",
            entry.userId || "",
            entry.userName || "",
            entry.userType || "",
            entry.roleCollection || "",
            entry.eventType || "",
            entry.event || "",
            entry.fieldChanged || "",
            entry.oldValue || "",
            entry.newValue || "",
            entry.performedBy || "",
            entry.userRole || "",
            entry.status || "",
            entry.subaccount || "",
            timestamp
        ].join("|");

        if (!unique.has(key)) {
            unique.set(
                key,
                entry
            );
        }
    }

    return Array.from(
        unique.values()
    );
}

function consolidateUserPersonaRecords(
    entries
) {
    if (
        !Array.isArray(entries) ||
        entries.length === 0
    ) {
        return [];
    }

    const personaMap =
        new Map();

    for (const entry of entries) {
        if (!entry) {
            continue;
        }

        const subaccount =
            entry.subaccount || "";

        const userId =
            entry.userId &&
            typeof entry.userId === "string"
                ? entry.userId.trim()
                : "";

        const eventType =
            entry.eventType || "";

        const event =
            entry.event || "";

        const compositeKey =
            `${subaccount}|${userId}|${eventType}|${event}`;

        if (!entry.ID) {
            entry.ID =
                cds.utils.uuid();
        }

        if (
            !personaMap.has(
                compositeKey
            )
        ) {
            personaMap.set(
                compositeKey,
                entry
            );

            continue;
        }

        const existingEntry =
            personaMap.get(
                compositeKey
            );

        const currentTime =
            new Date(
                entry.timestamp || 0
            ).getTime();

        const existingTime =
            new Date(
                existingEntry.timestamp || 0
            ).getTime();

        if (
            currentTime >
            existingTime
        ) {
            entry.ID =
                existingEntry.ID;

            personaMap.set(
                compositeKey,
                entry
            );
        }
    }

    return Array.from(
        personaMap.values()
    );
}

module.exports = {
    getSecondPrecisionTimestamp,
    deduplicateUserAuditEntries,
    consolidateUserPersonaRecords
};