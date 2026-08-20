const axios = require("axios");

/* ========================================================================= */
/*  HELPER FUNCTIONS                                                         */
/* ========================================================================= */

/** Safely parse JSON strings. */
function safeJsonParse(value) {
    if (!value || typeof value === "object") return value || null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

/** Convert value to trimmed string. */
function toStringValue(value) {
    if (value === null || value === undefined) return null;
    const result = String(value).trim();
    return result || null;
}

/** Truncate string to maximum length. */
function truncate(value, maxLength = 200) {
    const result = toStringValue(value);
    if (!result) return null;
    return result.length > maxLength ? result.substring(0, maxLength) : result;
}

/** Recursively search an object or array for key names. */
function findPropertyRecursive(object, propertyNames) {
    if (!object || typeof object !== "object") return null;

    if (Array.isArray(object)) {
        for (const item of object) {
            const result = findPropertyRecursive(item, propertyNames);
            if (result !== null && result !== undefined) return result;
        }
        return null;
    }

    for (const propertyName of propertyNames) {
        if (Object.prototype.hasOwnProperty.call(object, propertyName)) {
            const value = object[propertyName];
            if (value !== null && value !== undefined && value !== "") return value;
        }
    }

    for (const key of Object.keys(object)) {
        const result = findPropertyRecursive(object[key], propertyNames);
        if (result !== null && result !== undefined) return result;
    }

    return null;
}

/** Extract key-value from unstructured string. */
function extractTextValue(text, labels) {
    if (!text) return null;
    const source = String(text);

    for (const label of labels) {
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escapedLabel + "\\s*[:=]\\s*([^,\\n\\r\\)\\}\\]]+)", "i");
        const match = source.match(regex);
        if (match && match[1]) {
            const value = match[1].trim().replace(/^["']|["']$/g, "");
            if (value) return value;
        }
    }
    return null;
}

/** Extract nested TokenIssuedEvent payload from audit string. */
function extractTokenData(auditMessage) {
    if (!auditMessage) return {};
    const message = String(auditMessage);
    const patterns = [
        /TokenIssuedEvent\s*:\s*['"]?(\{[\s\S]*\})/i,
        /TokenIssuedEvent\s*=\s*['"]?(\{[\s\S]*\})/i,
        /TokenIssuedEvent\s*\(\s*['"](\{[\s\S]*?\})['"]\s*\)/i,
        /TokenIssuedEvent\s*\(\s*['"](\[[\s\S]*?\])['"]\s*\)/i
    ];

    for (const regex of patterns) {
        const match = message.match(regex);
        if (!match || !match[1]) continue;

        let tokenText = match[1].trim();
        let tokenData = safeJsonParse(tokenText);
        if (tokenData) return tokenData;

        tokenText = tokenText.replace(/\\"/g, '"').replace(/\\'/g, "'");
        tokenData = safeJsonParse(tokenText);
        if (tokenData) return tokenData;
    }
    return {};
}

/** Extract Role Collections list. */
function extractRoleCollections(tokenData, innerData, outerMessage, auditMessage) {
    let roles = findPropertyRecursive(tokenData, ["xs.rolecollections", "rolecollections"]);
    if (!roles) roles = findPropertyRecursive(innerData, ["xs.rolecollections", "rolecollections"]);
    if (!roles) roles = findPropertyRecursive(outerMessage, ["xs.rolecollections", "rolecollections"]);

    if (Array.isArray(roles)) {
        return roles.map(role => toStringValue(role)).filter(Boolean);
    }
    if (typeof roles === "string") {
        return roles.split(",").map(role => role.trim()).filter(Boolean);
    }
    if (roles) {
        return [String(roles).trim()];
    }

    if (auditMessage) {
        const roleMatch = String(auditMessage).match(/xs\.rolecollections\s*[:=]\s*\[([^\]]*)\]/i);
        if (roleMatch && roleMatch[1]) {
            return roleMatch[1].split(",").map(r => r.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
        }
    }
    return [];
}

/** Extract target User ID. */
function extractUserId(tokenData, innerData, outerMessage, log, auditMessage) {
    let userId = extractTextValue(auditMessage, ["JWT User", "started_by", "startedBy", "user_id", "userId", "user", "username"]);
    if (!userId) userId = findPropertyRecursive(tokenData, ["JWT User", "jwt_user", "jwtUser", "User", "user"]);
    if (!userId) userId = findPropertyRecursive(innerData, ["User", "user", "started_by", "startedBy", "userId", "username"]);
    if (!userId) userId = outerMessage?.User || outerMessage?.user || log?.user || null;

    return truncate(userId, 200);
}

/** Extract User Name. */
function extractUserName(tokenData, innerData, outerMessage, userId, auditMessage) {
    let givenName = findPropertyRecursive(tokenData, ["given_name"]) ||
                    findPropertyRecursive(innerData, ["given_name"]) ||
                    findPropertyRecursive(outerMessage, ["given_name"]) ||
                    extractTextValue(auditMessage, ["given_name", "given name"]);

    let familyName = findPropertyRecursive(tokenData, ["family_name"]) ||
                     findPropertyRecursive(innerData, ["family_name"]) ||
                     findPropertyRecursive(outerMessage, ["family_name"]) ||
                     extractTextValue(auditMessage, ["family_name", "family name"]);

    const first = toStringValue(givenName) || "";
    const last = toStringValue(familyName) || "";
    const fullName = `${first} ${last}`.trim();

    return truncate(fullName || userId, 200);
}

/** Extract Category/EventType without raw 'audit.' prefixes. */
function extractCategory(innerData, outerMessage, auditMessage) {
    let category = findPropertyRecursive(innerData, ["category", "Category"]) ||
                   findPropertyRecursive(outerMessage, ["category", "Category"]);

    if (!category && auditMessage) {
        category = extractTextValue(auditMessage, ["Category", "category"]);
    }

    if (category) {
        const catStr = String(category).toLowerCase().replace(/^audit\./i, "").trim();

        if (catStr.includes("data-access") || catStr.includes("data_access") || catStr.includes("data access")) {
            return "Data Access";
        }
        if (catStr.includes("data-modification") || catStr.includes("data_modification") || catStr.includes("data modification")) {
            return "Data Modification";
        }
        if (catStr.includes("configuration") || catStr.includes("config")) {
            return "Configuration";
        }
        if (catStr.includes("security") || catStr.includes("security-events")) {
            return "Security Events";
        }

        // Generic fallback formatter for any unhandled audit categories
        const formatted = catStr
            .replace(/[._-]/g, " ")
            .split(" ")
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

        return truncate(formatted, 200);
    }

    return "Security Events";
}

/** Extract Action/Event Name. */
function extractEventName(auditMessage) {
    if (!auditMessage) return null;
    const message = String(auditMessage).trim();
    const eventPatterns = [
        /event\s*[:=]\s*["']?([^,"'\n\r}]+)/i,
        /eventName\s*[:=]\s*["']?([^,"'\n\r}]+)/i,
        /event_name\s*[:=]\s*["']?([^,"'\n\r}]+)/i
    ];

    for (const regex of eventPatterns) {
        const match = message.match(regex);
        if (match && match[1]) return truncate(match[1].trim(), 200);
    }

    const knownEvents = [
        "TokenIssuedEvent",
        "UserAuthenticationSuccess",
        "UserAuthenticationFailure",
        "SecurityAuditEvent",
        "UserCreated",
        "UserDeleted",
        "UserUpdated",
        "RoleCollectionAssigned",
        "RoleCollectionUnassigned",
        "Create User",
        "Delete User"
    ];

    for (const eventName of knownEvents) {
        if (message.toLowerCase().includes(eventName.toLowerCase())) {
            return eventName;
        }
    }
    return null;
}

/** Extract Origin / User Type. */
function extractOrigin(innerData, outerMessage, auditMessage) {
    let origin = findPropertyRecursive(innerData, ["origin", "Origin"]) ||
                 findPropertyRecursive(outerMessage, ["origin", "Origin"]);

    if (!origin && auditMessage) {
        const originMatch = String(auditMessage).match(/["']?origin["']?\s*[:=]\s*["']?([^,"'\s}\]]+)/i);
        if (originMatch && originMatch[1]) origin = originMatch[1];
    }
    return truncate(origin, 100);
}

/** Consolidate payload information. */
function extractUserInformation(log) {
    const outerMessage = safeJsonParse(log?.message) || {};
    const innerData = safeJsonParse(outerMessage?.data) || {};
    const auditMessage = String(innerData?.message || outerMessage?.message || log?.message || "");

    const category = extractCategory(innerData, outerMessage, auditMessage);
    const tokenData = extractTokenData(auditMessage);
    const userId = extractUserId(tokenData, innerData, outerMessage, log, auditMessage);
    const userName = extractUserName(tokenData, innerData, outerMessage, userId, auditMessage);
    const roleCollections = extractRoleCollections(tokenData, innerData, outerMessage, auditMessage);
    const origin = extractOrigin(innerData, outerMessage, auditMessage);
    const subaccount = truncate(log?.tenant, 200);

    return {
        userId,
        userName,
        roleCollections,
        category,
        origin,
        subaccount,
        auditMessage,
        tokenData,
        innerData,
        outerMessage
    };
}

/* ========================================================================= */
/*  STRICT AUDIT EVENT EXTRACTION (DISCARDS INVALID/EMPTY EVENTS)            */
/* ========================================================================= */

function determineEvent(userInfo) {
    const message = String(userInfo.auditMessage || "").toLowerCase();
    const innerData = userInfo.innerData || {};
    const outerMessage = userInfo.outerMessage || {};

    const attributes = innerData.attributes || outerMessage.attributes || [];

    // 1. LOGIN & AUTHENTICATION EVENTS
    if (message.includes("tokenissuedevent")) {
        return {
            fieldChanged: "Last Login",
            oldValue: "-",
            newValue: "Success",
            status: "Success"
        };
    }

    if (message.includes("userauthenticationsuccess")) {
        return {
            fieldChanged: "Authentication",
            oldValue: "-",
            newValue: "Success",
            status: "Success"
        };
    }

    if (message.includes("userauthenticationfailure")) {
        return {
            fieldChanged: "Authentication",
            oldValue: "-",
            newValue: "Failure",
            status: "Failure"
        };
    }

    // 2. USER CREATED / PROVISIONED EVENT
    if (
        message.includes("user created") ||
        message.includes("create user") ||
        message.includes("createuser") ||
        message.includes("usercreation") ||
        message.includes("created user") ||
        message.includes("shadow user created") ||
        message.includes("user provisioned") ||
        message.includes("add user")
    ) {
        return {
            fieldChanged: "User Account",
            oldValue: "Not Exists",
            newValue: userInfo.userId || "Created",
            status: "Success"
        };
    }

    // 3. USER DELETED EVENT
    if (
        message.includes("user deleted") ||
        message.includes("delete user") ||
        message.includes("deleteuser") ||
        message.includes("userdeletion") ||
        message.includes("deleted user") ||
        message.includes("remove user")
    ) {
        return {
            fieldChanged: "User Account",
            oldValue: userInfo.userId || "Active",
            newValue: "Deleted",
            status: "Success"
        };
    }

    // 4. USER UPDATED EVENT
    if (
        message.includes("user updated") ||
        message.includes("update user") ||
        message.includes("updateuser") ||
        message.includes("userupdate")
    ) {
        return {
            fieldChanged: "User Account",
            oldValue: "Updated",
            newValue: userInfo.userId || "Modified",
            status: "Success"
        };
    }

    // 5. ROLE COLLECTION ASSIGNMENT / UNASSIGNMENT
    if (
        message.includes("rolecollection") ||
        message.includes("role_collection") ||
        message.includes("role collection")
    ) {
        const roles = userInfo.roleCollections.length > 0 ? userInfo.roleCollections.join(", ") : "Role Collection";

        if (message.includes("assign") || message.includes("add")) {
            return {
                fieldChanged: "Role Collection",
                oldValue: "-",
                newValue: truncate(roles, 255),
                status: "Success"
            };
        }
        if (message.includes("unassign") || message.includes("remove") || message.includes("delete")) {
            return {
                fieldChanged: "Role Collection",
                oldValue: truncate(roles, 255),
                newValue: "Removed",
                status: "Success"
            };
        }
    }

    // 6. ATTRIBUTES ARRAY CHANGE EXTRACTION (DYNAMIC UPDATE TRACKING)
    if (Array.isArray(attributes) && attributes.length > 0) {
        let fieldNames = [];
        let oldVals = [];
        let newVals = [];

        for (const attr of attributes) {
            if (!attr) continue;

            const name = attr.name || attr.attribute || attr.key;
            if (!name) continue;

            const oldVal = attr.old !== undefined && attr.old !== null ? String(attr.old) : "-";
            const newVal = attr.new !== undefined && attr.new !== null ? String(attr.new) : "-";

            fieldNames.push(name);
            oldVals.push(oldVal);
            newVals.push(newVal);
        }

        if (fieldNames.length > 0) {
            return {
                fieldChanged: truncate(fieldNames.join(", "), 100),
                oldValue: truncate(oldVals.join(", "), 255),
                newValue: truncate(newVals.join(", "), 255),
                status: "Success"
            };
        }
    }

    return null;
}

/** Map raw record to CDS schema if it represents a valid event. */
function mapAuditLog(log, connection, subaccountName) {
    const userInfo = extractUserInformation(log);
    const eventInfo = determineEvent(userInfo);

    if (!eventInfo) {
        return null;
    }

    const eventName = extractEventName(userInfo.auditMessage);
    const roleCollectionStr = userInfo.roleCollections.length > 0 ? userInfo.roleCollections.join(", ") : null;
    const region = truncate(connection?.region || log?.region || null, 50);

    return {
        system: "SAP BTP",
        userId: userInfo.userId,
        userName: userInfo.userName,
        userType: userInfo.origin || "Standard",
        roleCollection: truncate(roleCollectionStr, 1000),
        eventType: truncate(userInfo.category, 200),
        event: eventName || "Audit Event",
        fieldChanged: eventInfo.fieldChanged,
        oldValue: eventInfo.oldValue,
        newValue: eventInfo.newValue,
        performedBy: userInfo.userId,
        userRole: truncate(roleCollectionStr, 1000),
        subaccount: subaccountName || userInfo.subaccount,
        region: region,
        timestamp: log?.time ? new Date(log.time) : null,
        status: eventInfo.status
    };
}

/** Parse 'handle' token out of the 'paging' response header. */
function extractHandle(pagingHeader) {
    if (!pagingHeader) {
        return null;
    }
    const match = pagingHeader.match(/handle=([^;]+)/);
    return match ? match[1] : null;
}

/* ========================================================================= */
/*  MAIN EXPORTED API FUNCTION                                               */
/* ========================================================================= */

async function fetchUserAuditLogs(connection, token, timeFrom, timeTo, subaccountName) {
    if (!connection) {
        throw new Error("BTP Audit Log connection is missing.");
    }

    if (!connection.apiBaseUrl) {
        throw new Error(`Audit Log API base URL is missing for ${subaccountName || "Unknown"}.`);
    }

    if (!token) {
        throw new Error(`Audit Log OAuth token is missing for ${subaccountName || "Unknown"}.`);
    }

    const baseUrl = String(connection.apiBaseUrl).replace(/\/+$/, "");
    const cleanToken = String(token).replace(/^Bearer\s+/i, "");
    const targetSubaccount = subaccountName || "Unknown";

    const rawRecords = [];
    let handle = null;
    let page = 0;

    const totalStartTime = Date.now();
    console.log(`\n=================================================================`);
    console.log(`[AUDIT LOGS] Starting fetch for subaccount: "${targetSubaccount}"`);
    console.log(`[AUDIT LOGS] Time range: ${timeFrom} to ${timeTo}`);
    console.log(`=================================================================\n`);

    try {
        while (true) {
            page++;
            const pageStartTime = Date.now();

            // Fetch records across categories
            const url = handle
                ? `${baseUrl}/auditlog/v2/auditlogrecords?handle=${encodeURIComponent(handle)}`
                : `${baseUrl}/auditlog/v2/auditlogrecords` +
                  `?category=audit.security-events` +
                  `&time_from=${encodeURIComponent(timeFrom)}` +
                  `&time_to=${encodeURIComponent(timeTo)}`;

            console.log(`[AUDIT LOGS] Loading Page ${page}...`);

            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${cleanToken}`
                },
                timeout: 120000
            });

            const pageDuration = Date.now() - pageStartTime;
            let fetchedCount = 0;

            if (Array.isArray(response.data)) {
                fetchedCount = response.data.length;
                rawRecords.push(...response.data);
            } else if (response.data?.results && Array.isArray(response.data.results)) {
                fetchedCount = response.data.results.length;
                rawRecords.push(...response.data.results);
            }

            console.log(
                `[AUDIT LOGS] Page ${page} loaded successfully | ` +
                `Records in page: ${fetchedCount} | ` +
                `Time taken: ${pageDuration} ms`
            );

            // Extract pagination handle from response headers
            handle = extractHandle(response.headers["paging"]);

            if (!handle) {
                console.log(`[AUDIT LOGS] No further 'paging' handle found. Reached end of records.`);
                break;
            }
        }

        const totalDurationMs = Date.now() - totalStartTime;
        const totalDurationSec = (totalDurationMs / 1000).toFixed(2);

        // Filter and map valid records only
        const processedRecords = rawRecords
            .map(log => mapAuditLog(log, connection, targetSubaccount))
            .filter(Boolean);

        console.log(`\n-----------------------------------------------------------------`);
        console.log(`[AUDIT LOGS SUMMARY] Subaccount: "${targetSubaccount}"`);
        console.log(`[AUDIT LOGS SUMMARY] Total Pages Fetched : ${page}`);
        console.log(`[AUDIT LOGS SUMMARY] Total Raw Records   : ${rawRecords.length}`);
        console.log(`[AUDIT LOGS SUMMARY] Valid Mapped Logs   : ${processedRecords.length}`);
        console.log(`[AUDIT LOGS SUMMARY] Total Time Taken    : ${totalDurationMs} ms (${totalDurationSec} s)`);
        console.log(`-----------------------------------------------------------------\n`);

        return processedRecords;

    } catch (err) {
        const totalDurationMs = Date.now() - totalStartTime;
        const status = err.response?.status;
        const data = err.response?.data;

        let details;
        if (typeof data === "string") {
            details = data;
        } else if (data?.message) {
            details = data.message;
        } else if (data?.error_description) {
            details = data.error_description;
        } else if (data?.error) {
            details = data.error;
        } else {
            details = err.message;
        }

        console.error(
            `\n[AUDIT LOGS ERROR] Failed at Page ${page} for "${targetSubaccount}" ` +
            `after ${totalDurationMs} ms.`
        );

        throw new Error(
            `Failed to fetch user audit logs for ${targetSubaccount}` +
            `${status ? ` (HTTP ${status})` : ""}: ${details}`
        );
    }
}

module.exports = {
    fetchUserAuditLogs
};