const {
    toStringValue,
    truncate
} = require("./auditUtils");

function extractNormalizedCloneId(rawUserId) {
    if (
        !rawUserId ||
        typeof rawUserId !== "string"
    ) {
        return null;
    }

    const match = rawUserId.match(
        /^sb-clone([a-f0-9]{32})!/i
    );

    if (!match) {
        return null;
    }

    const hex = match[1].toLowerCase();

    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32)
    ].join("-");
}

function normalizeUuid(value) {
    if (!value) {
        return null;
    }

    let text = String(value)
        .trim()
        .toLowerCase()
        .replace(/[{}]/g, "");

    if (text.startsWith("sb-clone")) {
        text = text.substring(
            "sb-clone".length
        );
    }

    text = text.split("!")[0];

    const compact = text.replace(/-/g, "");

    if (!/^[a-f0-9]{32}$/.test(compact)) {
        return null;
    }

    return [
        compact.slice(0, 8),
        compact.slice(8, 12),
        compact.slice(12, 16),
        compact.slice(16, 20),
        compact.slice(20, 32)
    ].join("-");
}

function extractInstanceName(value) {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        return toStringValue(value);
    }

    if (typeof value !== "object") {
        return null;
    }

    const possibleNames = [
        "name",
        "instanceName",
        "serviceInstanceName",
        "service_instance_name",
        "displayName",
        "display_name",
        "label",
        "title"
    ];

    for (const key of possibleNames) {
        const candidate = toStringValue(
            value[key]
        );

        if (candidate) {
            return candidate;
        }
    }

    return null;
}

function resolveTechnicalUser(
    rawUserId,
    instanceMap
) {
    if (
        !rawUserId ||
        typeof rawUserId !== "string"
    ) {
        return null;
    }

    const originalUserId =
        rawUserId.trim();

    if (!originalUserId) {
        return null;
    }

    if (
        !originalUserId
            .toLowerCase()
            .startsWith("sb-")
    ) {
        return null;
    }

    console.log(
        "[USER AUDIT] Technical user detected."
    );

    console.log(
        "[USER AUDIT] Raw service user:",
        originalUserId
    );

    if (originalUserId.includes("|")) {
        const parts = originalUserId
            .split("|")
            .map(part => part.trim())
            .filter(Boolean);

        if (parts.length > 1) {
            const lastPart =
                parts[parts.length - 1];

            const instanceName =
                lastPart
                    .split("!")[0]
                    .trim();

            if (instanceName) {
                console.log(
                    "[USER AUDIT] Service instance resolved from pipe format:",
                    instanceName
                );

                return truncate(
                    instanceName,
                    200
                );
            }
        }
    }

    if (originalUserId.includes("!")) {
        const instanceName =
            originalUserId
                .split("!")[0]
                .trim();

        if (instanceName) {
            console.log(
                "[USER AUDIT] Service instance resolved from simple format:",
                instanceName
            );

            return truncate(
                instanceName,
                200
            );
        }
    }

    const cloneInstanceId =
        extractNormalizedCloneId(
            originalUserId
        );

    if (cloneInstanceId) {
        const compactCloneId =
            cloneInstanceId
                .replace(/-/g, "")
                .toLowerCase();

        console.log(
            "[USER AUDIT] Normalized clone instance ID:",
            cloneInstanceId
        );

        if (instanceMap) {

            if (instanceMap instanceof Map) {
                const directCandidates = [
                    cloneInstanceId,
                    cloneInstanceId.toLowerCase(),
                    compactCloneId,
                    `sb-clone${compactCloneId}`,
                    originalUserId
                ];

                for (
                    const key
                    of directCandidates
                ) {
                    if (!instanceMap.has(key)) {
                        continue;
                    }

                    const value =
                        instanceMap.get(key);

                    const instanceName =
                        extractInstanceName(
                            value
                        );

                    if (instanceName) {
                        console.log(
                            "[USER AUDIT] Resolved technical identity from map:",
                            instanceName
                        );

                        return truncate(
                            instanceName,
                            200
                        );
                    }
                }

                /**
                 * Normalized UUID comparison.
                 */
                for (
                    const [key, value]
                    of instanceMap.entries()
                ) {
                    const normalizedKey =
                        normalizeUuid(key);

                    const normalizedValueId =
                        normalizeUuid(
                            value?.id ||
                            value?.guid ||
                            value?.instanceId ||
                            value?.instance_id ||
                            value?.serviceInstanceId ||
                            value?.service_instance_id
                        );

                    if (
                        normalizedKey ===
                            cloneInstanceId ||
                        normalizedValueId ===
                            cloneInstanceId
                    ) {
                        const instanceName =
                            extractInstanceName(
                                value
                            ) ||
                            extractInstanceName(
                                key
                            );

                        if (instanceName) {
                            console.log(
                                "[USER AUDIT] Resolved technical identity from normalized map:",
                                instanceName
                            );

                            return truncate(
                                instanceName,
                                200
                            );
                        }
                    }
                }
            }

            if (
                typeof instanceMap === "object" &&
                !(instanceMap instanceof Map)
            ) {
                const directValues = [
                    instanceMap[
                        cloneInstanceId
                    ],
                    instanceMap[
                        compactCloneId
                    ],
                    instanceMap[
                        `sb-clone${compactCloneId}`
                    ]
                ];

                for (
                    const value
                    of directValues
                ) {
                    const instanceName =
                        extractInstanceName(
                            value
                        );

                    if (instanceName) {
                        console.log(
                            "[USER AUDIT] Resolved technical identity from object map:",
                            instanceName
                        );

                        return truncate(
                            instanceName,
                            200
                        );
                    }
                }

                for (
                    const [key, value]
                    of Object.entries(instanceMap)
                ) {
                    const normalizedKey =
                        normalizeUuid(key);

                    if (
                        normalizedKey ===
                        cloneInstanceId
                    ) {
                        const instanceName =
                            extractInstanceName(
                                value
                            );

                        if (instanceName) {
                            console.log(
                                "[USER AUDIT] Resolved technical identity from normalized object map:",
                                instanceName
                            );

                            return truncate(
                                instanceName,
                                200
                            );
                        }
                    }
                }
            }
        }
    }
    const fallbackName =
        originalUserId
            .split("!")[0]
            .trim();

    if (fallbackName) {
        console.log(
            "[USER AUDIT] Using technical user fallback:",
            fallbackName
        );

        return truncate(
            fallbackName,
            200
        );
    }

    console.warn(
        "[USER AUDIT] Could not resolve technical service instance name:",
        originalUserId
    );

    return null;
}

module.exports = {
    extractNormalizedCloneId,
    normalizeUuid,
    extractInstanceName,
    resolveTechnicalUser
};