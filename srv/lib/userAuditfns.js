
 
const axios = require("axios");
const {processUserConfigLog} = require("./ProcessUserConfigLogs");
/* ========================================================================= */

/*  HELPER FUNCTIONS                                                         */

/* ========================================================================= */
 
/* Safely parse JSON.*/
function safeJsonParse(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }
 
    if (typeof value === "object") {
        return value;
    }
 
    try {

        return JSON.parse(value);
    } catch (err) {
        return null;

    }

}
 
/* Convert value to trimmed string.*/
function toStringValue(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }
 
    const result = String(value).trim();
 
    return result || null;

}
 
/* Truncate string to maximum length.*/
function truncate(value, maxLength = 500) {
    const result = toStringValue(value);
 
    if (!result) {
        return null;
    }
 
    return result.length > maxLength
        ? result.substring(0, maxLength)
        : result;
}
 
/** Recursively search an object/array for a property.*/
function findPropertyRecursive(object, propertyNames) {
    if (
        object === null ||
        object === undefined ||
        typeof object !== "object"
    ) {
        return null;
    }
 
    if (Array.isArray(object)) {

        for (const item of object) {
            const result = findPropertyRecursive(
                item,
                propertyNames
            );
 
            if (
                result !== null &&
                result !== undefined
            ) {
                return result;
            }
        }
 
        return null;

    }

    for (const propertyName of propertyNames) {
        if (
            Object.prototype.hasOwnProperty.call(
                object,
                propertyName
            )
        ) {
            const value = object[propertyName];
 
            if (
                value !== null &&
                value !== undefined &&
                value !== ""
            ) {
                return value;
            }
        }

    }

    for (const key of Object.keys(object)) {
        const result = findPropertyRecursive(
            object[key],
            propertyNames
        );
 
        if (
            result !== null &&
            result !== undefined
        ) {
            return result;
        }
    }

    return null;

}
 
/*Extract a value from text using labels such as:JWT User: abc Category=xyz*/
function extractTextValue(text, labels) {
    if (!text) {
        return null;
    }
 
    const source = String(text);

    for (const label of labels) {
        const escapedLabel = label.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
 
        const regex = new RegExp(
            escapedLabel +
            "\\s*[:=]\\s*([^,\\n\\r\\)\\}\\]]+)",
            "i"
        );
 
        const match = source.match(regex);
 
        if (
            match &&
            match[1]
        ) {
            let value = match[1].trim();
 
            value = value.replace(
                /^["']|["']$/g,
                ""
            );
 
            if (value) {
                return value;
            }
        }

    }
 
    return null;

}
 
/*Extract TokenIssuedEvent data from audit message.*/
function extractTokenData(auditMessage) {
    if (!auditMessage) {
        return {};
    }
 
    const message = String(auditMessage);
 
    const patterns = [

        /TokenIssuedEvent\s*:\s*['"]?(\{[\s\S]*\})/i,
 
        /TokenIssuedEvent\s*=\s*['"]?(\{[\s\S]*\})/i,
 
        /TokenIssuedEvent\s*\(\s*['"](\{[\s\S]*?\})['"]\s*\)/i,
 
        /TokenIssuedEvent\s*\(\s*['"](\[[\s\S]*?\])['"]\s*\)/i

    ];

    for (const regex of patterns) {

        const match = message.match(regex);
 
        if (
            !match ||
            !match[1]
        ) {
            continue;
        }
 
        let tokenText = match[1].trim();
 
        let tokenData = safeJsonParse(tokenText);
 
        if (tokenData) {
            return tokenData;
        }
 
        tokenText = tokenText
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'");
 
        tokenData = safeJsonParse(tokenText);
 
        if (tokenData) {
            return tokenData;
        }
    }
 
    return {};

}
 
/*** Extract role collections.*/
function extractRoleCollections(
    tokenData,
    innerData,
    outerMessage,
    auditMessage
) {
    let roles = null;
 
    // 1. Exact xs.rolecollections
    roles = findPropertyRecursive(
        tokenData,
        [
            "xs.rolecollections"
        ]
    );
 
    // 2. rolecollections
    if (!roles) {
        roles = findPropertyRecursive(
            tokenData,
            [
                "rolecollections"
            ]
        );
    }
 
    // 3. Inner data
    if (!roles) {
        roles = findPropertyRecursive(
            innerData,
            [
                "xs.rolecollections",
                "rolecollections"
            ]
        );
    }
 
    // 4. Outer message
    if (!roles) {
        roles = findPropertyRecursive(
            outerMessage,
            [
                "xs.rolecollections",
                "rolecollections"
            ]
        );
    }
 
    // Convert array
    if (Array.isArray(roles)) {
        return roles
            .map(role => toStringValue(role))
            .filter(Boolean);
    }
 
    // Convert comma-separated string
    if (typeof roles === "string") {
        return roles
            .split(",")
            .map(role => role.trim())
            .filter(Boolean);
    }
 
    // Single value
    if (roles) {
        return [
            String(roles).trim()
        ];
    }

    if (auditMessage) {
        const roleMatch = String(auditMessage).match(
            /xs\.rolecollections\s*[:=]\s*\[([^\]]*)\]/i
        );
 
        if (
            roleMatch &&
            roleMatch[1]
        ) {
            return roleMatch[1]
                .split(",")
                .map(role =>
                    role
                        .trim()
                        .replace(
                            /^["']|["']$/g,
                            ""
                        )
                )
                .filter(Boolean);
        }

    }
 
    return [];

}
 
function extractUserId(
    tokenData,
    innerData,
    outerMessage,
    log,
    auditMessage
) {
    // 1. JWT User from audit message
    let userId = extractTextValue(
        auditMessage,
        [
            "JWT User"
        ]
    );
 
    // 2. started_by
    if (!userId) {
        userId = extractTextValue(
            auditMessage,
            [
                "started_by",
                "startedBy"
            ]
        );
    }
 
    // 3. Token data
    if (!userId) {
        userId = findPropertyRecursive(
            tokenData,
            [
                "JWT User",
                "jwt_user",
                "jwtUser"
            ]
        );
    }
 
    // 4. User
    if (!userId) {
        userId = findPropertyRecursive(
            tokenData,
            [
                "User",
                "user"
            ]
        );
    }
 
    // 5. Inner data
    if (!userId) {
        userId = findPropertyRecursive(
            innerData,
            [
                "User",
                "user",
                "started_by",
                "startedBy"
            ]
        );
    }
 
    // 6. Outer message / log
    if (!userId) {
        userId =
            outerMessage?.User ||
            outerMessage?.user ||
            log?.user ||
            null;
    }
 
    return truncate(
        userId,
        200
    );
}
 
function extractUserName(
    tokenData,
    innerData,
    outerMessage,
    userId,
    auditMessage
) {
    let givenName = findPropertyRecursive(
        tokenData,
        [
            "given_name"
        ]
    );
 
    let familyName = findPropertyRecursive(
        tokenData,
        [
            "family_name"
        ]
    );
 
    // Inner data fallback
    if (!givenName) {
        givenName = findPropertyRecursive(
            innerData,
            [
                "given_name"
            ]
        );
    }
 
    if (!familyName) {
        familyName = findPropertyRecursive(
            innerData,
            [
                "family_name"
            ]
        );
    }
 
    // Outer message fallback
    if (!givenName) {
        givenName = findPropertyRecursive(
            outerMessage,
            [
                "given_name"
            ]
        );
    }
 
    if (!familyName) {
        familyName = findPropertyRecursive(
            outerMessage,
            [
                "family_name"
            ]
        );
    }
 
    // Text fallback
    if (!givenName) {
        givenName = extractTextValue(
            auditMessage,
            [
                "given_name",
                "given name"
            ]
        );
    }
 
    if (!familyName) {
        familyName = extractTextValue(
            auditMessage,
            [
                "family_name",
                "family name"
            ]
        );
    }
 
    const first =
        toStringValue(givenName) || "";
 
    const last =
        toStringValue(familyName) || "";
 
    const fullName =
        `${first} ${last}`.trim();
 
    return truncate(
        fullName || userId,
        200
    );
}
 
function extractCategory(
    innerData,
    outerMessage,
    auditMessage
) {
    let category = findPropertyRecursive(
        innerData,
        [
            "category",
            "Category"
        ]
    );
 
    if (!category) {
        category = findPropertyRecursive(
            outerMessage,
            [
                "category",
                "Category"
            ]
        );
    }
 
    if (
        !category &&
        auditMessage
    ) {
        category = extractTextValue(
            auditMessage,
            [
                "Category",
                "category"
            ]
        );
    }
 
    return truncate(
        category || "User Management",
        200
    );
}
 
function extractEventName(auditMessage) {
    if (!auditMessage) {
        return null;
    }
 
    const message =
        String(auditMessage).trim();
 
    const eventPatterns = [

        /event\s*[:=]\s*["']?([^,"'\n\r}]+)/i,

        /eventName\s*[:=]\s*["']?([^,"'\n\r}]+)/i,

        /event_name\s*[:=]\s*["']?([^,"'\n\r}]+)/i

    ];

    for (const regex of eventPatterns) {

        const match = message.match(regex);
 
        if (
            match &&
            match[1]
        ) {
            return truncate(
                match[1].trim(),
                200
            );
        }
    }

    const knownEvents = [

        "TokenIssuedEvent",

        "UserAuthenticationSuccess",

        "UserAuthenticationFailure",
        "SecurityAuditEvent"
    ];
 
    for (const eventName of knownEvents) {
        if (
            message
                .toLowerCase()
                .includes(
                    eventName.toLowerCase()
                )
        ) {
            return eventName;
        }
    }
 
    return null;
}
 
function extractOrigin(
    innerData,
    outerMessage,
    auditMessage
) {
    let origin = findPropertyRecursive(
        innerData,
        [
            "origin",
            "Origin"
        ]
    );
 
    if (!origin) {
        origin = findPropertyRecursive(
            outerMessage,
            [
                "origin",
                "Origin"
            ]
        );
    }
 
    if (!origin) {
        const attributes =
            innerData?.attributes ||
            outerMessage?.attributes;
 
        if (Array.isArray(attributes)) {
            for (const attribute of attributes) {
                if (!attribute) {
                    continue;
                }
 
                // Check attribute.new
                if (attribute.new) {
                    const newData =
                        safeJsonParse(
                            attribute.new
                        );
 
                    if (newData) {
                        origin =
                            findPropertyRecursive(
                                newData,
                                [
                                    "origin",
                                    "Origin"
                                ]
                            );
 
                        if (origin) {
                            break;
                        }
                    }
 
                    // Sometimes escaped JSON
                    if (!origin) {
                        const newText =
                            String(
                                attribute.new
                            )
                                .replace(
                                    /\\"/g,
                                    '"'
                                )
                                .replace(
                                    /\\'/g,
                                    "'"
                                );
 
                        const parsedNewData =
                            safeJsonParse(
                                newText
                            );
 
                        if (parsedNewData) {
                            origin =
                                findPropertyRecursive(
                                    parsedNewData,
                                    [
                                        "origin",
                                        "Origin"
                                    ]
                                );
 
                            if (origin) {
                                break;
                            }
                        }
                    }
 
                    // Direct text search
                    if (!origin) {
                        const originMatch =
                            String(
                                attribute.new
                            ).match(
                                /["']?origin["']?\s*:\s*["']([^"']+)["']/i
                            );
 
                        if (
                            originMatch &&
                            originMatch[1]
                        ) {
                            origin =
                                originMatch[1];
 
                            break;
                        }
                    }
                }
            }
        }
    }
 
    // Final textual fallback
    if (
        !origin &&
        auditMessage
    ) {
        const originMatch =
            String(auditMessage).match(
                /["']?origin["']?\s*[:=]\s*["']?([^,"'\s}\]]+)/i
            );
 
        if (
            originMatch &&
            originMatch[1]
        ) {
            origin =
                originMatch[1];
        }
    }
 
    return truncate(
        origin,
        100
    );
}
 
function extractUserInformation(log) {
    const outerMessage =
        safeJsonParse(
            log?.message
        ) || {};
 
    const innerData =
        safeJsonParse(
            outerMessage?.data
        ) || {};
 
    const auditMessage =
        String(
            innerData?.message ||
            outerMessage?.message ||
            ""
        );
 
    const category =
        extractCategory(
            innerData,
            outerMessage,
            auditMessage
        );
 
    const tokenData =
        extractTokenData(
            auditMessage
        );
 
    const userId =
        extractUserId(
            tokenData,
            innerData,
            outerMessage,
            log,
            auditMessage
        );
 
    const userName =
        extractUserName(
            tokenData,
            innerData,
            outerMessage,
            userId,
            auditMessage
        );
 
    const roleCollections =
        extractRoleCollections(
            tokenData,
            innerData,
            outerMessage,
            auditMessage
        );
 
    const origin =
        extractOrigin(
            innerData,
            outerMessage,
            auditMessage
        );
 
    // Subaccount
    const subaccount =
        truncate(
            log?.tenant,
            200
        );
 
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
 
function determineEvent(auditMessage) {
    const message =
        String(
            auditMessage || ""
        ).toLowerCase();
 
    // TOKEN ISSUED
    if (
        message.includes(
            "tokenissuedevent"
        )
    ) {
        return {

            fieldChanged: "Last Login",

            oldValue: "-",

            newValue: "Success",

            status: "Success"

        };

    }
 
    // AUTHENTICATION SUCCESS
    if (
        message.includes(
            "userauthenticationsuccess"
        )
    ) {
        return {

            fieldChanged: "Authentication",

            oldValue: "-",

            newValue: "Success",

            status: "Success"

        };

    }
 
    // AUTHENTICATION FAILURE
    if (
        message.includes(
            "userauthenticationfailure"
        )
    ) {
        return {

            fieldChanged: "Authentication",

            oldValue: "-",

            newValue: "Failure",

            status: "Failure"

        };

    }
 
    // SECURITY AUDIT
    if (
        message.includes(
            "securityauditevent"
        ) ||
        message.includes(
            "securityaudit"
        ) ||
        message.includes(
            "security audit"
        )
    ) {
        return {
            fieldChanged: null,
            oldValue: null,
            newValue: null,
            status: "Success"

        };

    }
 
    return {
        fieldChanged: null,
        oldValue: null,
        newValue: null,
        status: "Success"
    };
}
 
function mapAuditLog(
    log,
    connection,
    subaccountName
) {
    const userInfo =
        extractUserInformation(
            log
        );
 
    const eventInfo =
        determineEvent(
            userInfo.auditMessage
        );
 
    // Event name
    const eventName =
        extractEventName(
            userInfo.auditMessage
        );
 
    // Role collection string
    const roleCollection =
        userInfo.roleCollections.length > 0
            ? userInfo.roleCollections.join(", ")
            : null;
 
    const region =
        truncate(
            connection?.region ||
            log?.region ||
            null,
            50
        );
 
    return {
        // 1. System
        system: "SAP BTP",
 
        // 2. User ID
        userId:
            userInfo.userId,
 
        // 3. User Name
        userName:
            userInfo.userName,
 
        // 4. User Type
        // Mapped from origin
        userType:
            userInfo.origin ||
            "Standard",
 
        // 5. Role Collection
        roleCollection:
            truncate(
                roleCollection,
                500
            ),
 
        // 6. Event Type
        // Comes from category
        eventType:
            truncate(
                userInfo.category,
                200
            ),
 
        // 7. Event
        event:
            eventName ||
            "Audit Event",
 
        // 8. Field Changed
        fieldChanged:
            eventInfo.fieldChanged,
 
        // 9. Old Value
        oldValue:
            eventInfo.oldValue,
 
        // 10. New Value
        newValue:
            eventInfo.newValue,
 
        // 11. Performed By
        performedBy:
            userInfo.userId,
 
        // 12. User Role
        userRole:
            truncate(
                roleCollection,
                500
            ),
 
        // 13. Subaccount
        subaccount:
             subaccountName ||
             userInfo.subaccount,
 
        // 14. Region
        region: region,
 
        // 15. Timestamp
        timestamp:
            log?.time
                ? new Date(log.time)
                : null,
 
        // 16. Status
        status:
            eventInfo.status
    };
}
 
async function fetchUserAuditLogs(
    connection,
    token,
    timeFrom,
    timeTo,
    subaccountName
) {
    if (!connection) {
        throw new Error("BTP Audit Log connection is missing.");
    }

    if (!connection.apiBaseUrl) {
        throw new Error(
            `Audit Log API base URL is missing for ${
                connection.subaccountName ||
                "Unknown"
            }.`
        );
    }

    if (!token) {
        throw new Error(
            `Audit Log OAuth token is missing for ${
                connection.subaccountName ||
                "Unknown"
            }.`
        );
    }
 
    const baseUrl =
        String(
            connection.apiBaseUrl
        ).replace(
            /\/+$/,
            ""
        );
 
    const url =
        `${baseUrl}/auditlog/v2/auditlogrecords`;
 
    const headers = {
        Authorization:
            `Bearer ${String(token).replace(
                /^Bearer\s+/i,
                ""
            )}`,
 
        Accept:
            "application/json"
    };
 
    const params = {
        time_from: timeFrom,
        time_to: timeTo
    };
 
    let records = [];
 
    try {
        const response =
            await axios.get(
                url,
                {
                    headers,
                    params,
 
                    timeout:
                        120000,
 
                    validateStatus:
                        () => true
                }
            );
 
        if (
            response.status === 401
        ) {
            console.error(
                `Subaccount: ${
                    connection.subaccountName ||
                    "Unknown"
                }`
            );
 
            throw new Error(
                `Audit Log API returned 401 Unauthorized for ${
                    connection.subaccountName ||
                    "Unknown"
                }. Check the AUDIT_LOG OAuth client credentials/token binding.`
            );
        }
 
        if (
            response.status === 403
        ) {
            throw new Error(
                `Audit Log API returned 403 Forbidden for ${
                    connection.subaccountName ||
                    "Unknown"
                }. The OAuth client does not have sufficient Audit Log permissions.`
            );
        }
 
        if (
            response.status < 200 ||
            response.status >= 300
        ) {
            throw new Error(
                `Audit Log API returned HTTP ${
                    response.status
                }: ${
                    typeof response.data === "string"
                        ? response.data
                        : JSON.stringify(
                            response.data
                        )
                }`
            );
        }
 
        const data =
            err.response?.data;

        let details;

        if (typeof data === "string") {

            details = data;

        } else if (data?.message) {

            details = data.message;

        } else if (data?.error_description) {

            details =
                data.error_description;

        } else if (data?.error) {

            details = data.error;

        } else {

            details = err.message;
        }

        throw new Error(
            `Failed to fetch configuration audit logs for ${
                subaccountName || "Unknown"
            }` +
            `${status ? ` (HTTP ${status})` : ""}: ${details}`
        );
    }
}

function getSecondPrecisionTimestamp(timestamp) {
    if (!timestamp) {
        return "";
    }

    const date =
        timestamp instanceof Date
            ? timestamp
            : new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return String(timestamp);
    }

    return date.toISOString().slice(0, 19);
}
function deduplicateUserAuditEntries(entries) {

    const unique = new Map();

    for (const entry of entries) {

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
            unique.set(key, entry);
        }
    }

    return Array.from(
        unique.values()
    );
}
module.exports = {
    fetchUserAuditLogs,
    mapAuditLog
};
 