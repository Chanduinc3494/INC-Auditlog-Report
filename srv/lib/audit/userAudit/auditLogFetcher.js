const axios = require("axios");

const {
    mapAuditLog
} = require("./auditLogMapper");

const {
    truncate
} = require("./auditUtils");

const {
    processUserConfigLog
} = require("../configurationAudit/ProcessUserConfigLogs");

function extractHandle(pagingHeader) {
    if (!pagingHeader) {
        return null;
    }

    const match =
        String(pagingHeader).match(
            /handle=([^;]+)/i
        );

    return match
        ? match[1]
        : null;
}

function getBaseUrl(connection) {
    return String(
        connection.apiBaseUrl
    ).replace(/\/+$/, "");
}

function cleanToken(token) {
    return String(token).replace(
        /^Bearer\s+/i,
        ""
    );
}

/**
 * Extract records from API response.
 */
function extractResponseRecords(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (
        data &&
        Array.isArray(data.results)
    ) {
        return data.results;
    }

    return [];
}

function getErrorDetails(err) {
    const data =
        err &&
        err.response &&
        err.response.data;

    if (typeof data === "string") {
        return data;
    }

    if (
        data &&
        data.message
    ) {
        return data.message;
    }

    if (
        data &&
        data.error_description
    ) {
        return data.error_description;
    }

    if (
        data &&
        data.error
    ) {
        return data.error;
    }

    return err && err.message
        ? err.message
        : "Unknown error";
}

function validateConnection(
    connection,
    token,
    subaccountName
) {
    if (!connection) {
        throw new Error(
            "BTP Audit Log connection is missing."
        );
    }

    if (!connection.apiBaseUrl) {
        throw new Error(
            `Audit Log API base URL is missing for ${
                subaccountName || "Unknown"
            }.`
        );
    }

    if (!token) {
        throw new Error(
            `Audit Log OAuth token is missing for ${
                subaccountName || "Unknown"
            }.`
        );
    }
}

async function fetchAllAuditLogPages(
    connection,
    token,
    timeFrom,
    timeTo,
    category,
    subaccountName,
    logPrefix
) {
    const baseUrl =
        getBaseUrl(connection);

    const authorizationToken =
        cleanToken(token);

    const rawRecords = [];

    let handle = null;
    let page = 0;

    while (true) {
        page++;

        let url;

        if (handle) {
            url =
                `${baseUrl}/auditlog/v2/auditlogrecords` +
                `?handle=${encodeURIComponent(handle)}`;
        } else {
            url =
                `${baseUrl}/auditlog/v2/auditlogrecords` +
                `?category=${encodeURIComponent(category)}` +
                `&time_from=${encodeURIComponent(timeFrom)}` +
                `&time_to=${encodeURIComponent(timeTo)}`;
        }

        console.log(
            `[${logPrefix}] Loading Page ${page}...`
        );

        const pageStartTime =
            Date.now();

        const response =
            await axios.get(
                url,
                {
                    headers: {
                        Authorization:
                            `Bearer ${authorizationToken}`
                    },
                    timeout: 120000
                }
            );

        const pageDuration =
            Date.now() -
            pageStartTime;

        const records =
            extractResponseRecords(
                response.data
            );

        rawRecords.push(
            ...records
        );

        console.log(
            `[${logPrefix}] Page ${page} loaded successfully | ` +
            `Records in page: ${records.length} | ` +
            `Time taken: ${pageDuration} ms`
        );

        handle =
            extractHandle(
                response.headers &&
                response.headers.paging
            );

        if (!handle) {
            console.log(
                `[${logPrefix}] ` +
                "No further 'paging' handle found. Reached end of records."
            );

            break;
        }
    }

    return rawRecords;
}

async function fetchUserAuditLogs(
    connection,
    token,
    timeFrom,
    timeTo,
    subaccountName,
    instanceMap
) {
    validateConnection(
        connection,
        token,
        subaccountName
    );

    const targetSubaccount =
        subaccountName ||
        connection.subaccountId ||
        "Unknown";

    const totalStartTime =
        Date.now();

    try {
        const rawRecords =
            await fetchAllAuditLogPages(
                connection,
                token,
                timeFrom,
                timeTo,
                "audit.security-events",
                targetSubaccount,
                "AUDIT LOGS"
            );

        console.log(
            `[USER AUDIT] Processing ${rawRecords.length} raw audit records.`
        );

        const processedRecords =
            rawRecords
                .map(log =>
                    mapAuditLog(
                        log,
                        connection,
                        targetSubaccount,
                        instanceMap
                    )
                )
                .filter(Boolean);

        return processedRecords;

    } catch (err) {
        const totalDurationMs =
            Date.now() -
            totalStartTime;

        const status =
            err &&
            err.response &&
            err.response.status;

        const details =
            getErrorDetails(err);

        console.error(
            `[AUDIT LOGS ERROR] Failed to fetch audit logs ` +
            `for "${targetSubaccount}" ` +
            `after ${totalDurationMs} ms.`
        );

        throw new Error(
            `Failed to fetch user audit logs for ` +
            `${targetSubaccount}` +
            `${status ? ` (HTTP ${status})` : ""}: ` +
            `${details}`
        );
    }
}

async function fetchUserConfigLogs(
    connection,
    token,
    timeFrom,
    timeTo,
    userMapping,
    subaccountName,
    instanceMap
) {
    validateConnection(
        connection,
        token,
        subaccountName
    );

    const targetSubaccount =
        subaccountName ||
        connection.subaccountId ||
        "Unknown";

    try {
        const rawRecords =
            await fetchAllAuditLogPages(
                connection,
                token,
                timeFrom,
                timeTo,
                "audit.configuration",
                targetSubaccount,
                "AUDIT CONFIGURATION"
            );

        const processedRecords = [];

        for (const log of rawRecords) {
            const entries =
                processUserConfigLog(
                    log,
                    userMapping,
                    targetSubaccount,
                    instanceMap
                );

            if (
                Array.isArray(entries) &&
                entries.length > 0
            ) {
                processedRecords.push(
                    ...entries
                );
            }
        }

        return processedRecords;

    } catch (err) {
        const status =
            err &&
            err.response &&
            err.response.status;

        const details =
            getErrorDetails(err);

        throw new Error(
            `Failed to fetch configuration audit logs for ` +
            `${targetSubaccount || "Unknown"}` +
            `${status ? ` (HTTP ${status})` : ""}: ` +
            `${details}`
        );
    }
}

module.exports = {
    extractHandle,
    fetchUserAuditLogs,
    fetchUserConfigLogs
};