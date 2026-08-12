const axios = require("axios");


/**
 * =========================================================
 * SAFE JSON PARSE
 * =========================================================
 */
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


/**
 * =========================================================
 * STRING HELPERS
 * =========================================================
 */
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


function truncate(value, maxLength = 500) {

    const result = toStringValue(value);

    if (!result) {
        return null;
    }

    return result.length > maxLength
        ? result.substring(0, maxLength)
        : result;
}


/**
 * =========================================================
 * FIND PROPERTY RECURSIVELY
 *
 * This is important because SAP token/audit payloads can
 * have xs.rolecollections at different nesting levels.
 * =========================================================
 */
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

            const result =
                findPropertyRecursive(
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

            const value =
                object[propertyName];

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

        const result =
            findPropertyRecursive(
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


/**
 * =========================================================
 * EXTRACT VALUE FROM TEXT
 *
 * Example:
 *
 * JWT User: chandana.s@incture.com
 *
 * started_by: chandana.s@incture.com
 * =========================================================
 */
function extractTextValue(text, labels) {

    if (!text) {
        return null;
    }

    const source = String(text);


    for (const label of labels) {

        const escapedLabel =
            label.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );


        const regex =
            new RegExp(
                escapedLabel +
                "\\s*[:=]\\s*([^,\\n\\r\\)\\}\\]]+)",
                "i"
            );


        const match =
            source.match(regex);


        if (match && match[1]) {

            let value =
                match[1].trim();


            value =
                value.replace(
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


/**
 * =========================================================
 * EXTRACT EMBEDDED TOKEN JSON
 *
 * Supports:
 *
 * TokenIssuedEvent ('{ ... }')
 * TokenIssuedEvent ("{ ... }")
 * =========================================================
 */
function extractTokenData(auditMessage) {

    if (!auditMessage) {
        return {};
    }


    const message =
        String(auditMessage);


    const regex =
        /TokenIssuedEvent\s*\(\s*['"]([\s\S]*?)['"]\s*\)/i;


    const match =
        message.match(regex);


    if (!match || !match[1]) {
        return {};
    }


    let tokenText =
        match[1].trim();


    // First attempt
    let tokenData =
        safeJsonParse(tokenText);


    if (tokenData) {
        return tokenData;
    }


    // Remove escaped quotes
    tokenText =
        tokenText
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'");


    tokenData =
        safeJsonParse(tokenText);


    if (tokenData) {
        return tokenData;
    }


    return {};
}


/**
 * =========================================================
 * EXTRACT ROLE COLLECTIONS
 *
 * REQUIRED:
 *
 * xs.rolecollections
 *
 * Also supports:
 *
 * xs.system.attributes.xs.rolecollections
 *
 * xs -> rolecollections
 * =========================================================
 */
function extractRoleCollections(
    tokenData,
    innerData,
    outerMessage,
    auditMessage
) {

    let roles = null;


    // -------------------------------------------------------
    // 1. Exact xs.rolecollections
    // -------------------------------------------------------

    roles =
        findPropertyRecursive(
            tokenData,
            [
                "xs.rolecollections"
            ]
        );


    // -------------------------------------------------------
    // 2. Nested xs.rolecollections
    // -------------------------------------------------------

    if (!roles) {

        roles =
            findPropertyRecursive(
                tokenData,
                [
                    "rolecollections"
                ]
            );
    }


    // -------------------------------------------------------
    // 3. Inner data
    // -------------------------------------------------------

    if (!roles) {

        roles =
            findPropertyRecursive(
                innerData,
                [
                    "xs.rolecollections",
                    "rolecollections"
                ]
            );
    }


    // -------------------------------------------------------
    // 4. Outer message
    // -------------------------------------------------------

    if (!roles) {

        roles =
            findPropertyRecursive(
                outerMessage,
                [
                    "xs.rolecollections",
                    "rolecollections"
                ]
            );
    }


    // -------------------------------------------------------
    // Convert result to array
    // -------------------------------------------------------

    if (Array.isArray(roles)) {

        return roles
            .map(role => toStringValue(role))
            .filter(Boolean);
    }


    if (typeof roles === "string") {

        return roles
            .split(",")
            .map(role => role.trim())
            .filter(Boolean);
    }


    if (roles) {

        return [
            String(roles).trim()
        ];
    }


    // -------------------------------------------------------
    // Last fallback:
    // Search textual audit message
    // -------------------------------------------------------

    if (auditMessage) {

        const roleMatch =
            String(auditMessage).match(
                /xs\.rolecollections\s*[:=]\s*\[([^\]]*)\]/i
            );


        if (roleMatch && roleMatch[1]) {

            return roleMatch[1]
                .split(",")
                .map(role =>
                    role
                        .trim()
                        .replace(/^["']|["']$/g, "")
                )
                .filter(Boolean);
        }
    }


    return [];
}


/**
 * =========================================================
 * EXTRACT USER ID
 *
 * REQUIRED PRIORITY:
 *
 * 1. JWT User
 * 2. started_by
 * 3. User
 * 4. outer user
 *
 * IMPORTANT:
 * Do NOT use:
 *
 * user_id
 * sub
 * email
 * user_name
 *
 * as the primary User ID.
 * =========================================================
 */
function extractUserId(
    tokenData,
    innerData,
    outerMessage,
    log,
    auditMessage
) {

    // -------------------------------------------------------
    // 1. JWT User from audit message
    // -------------------------------------------------------

    let userId =
        extractTextValue(
            auditMessage,
            [
                "JWT User"
            ]
        );


    // -------------------------------------------------------
    // 2. started_by from audit message
    // -------------------------------------------------------

    if (!userId) {

        userId =
            extractTextValue(
                auditMessage,
                [
                    "started_by",
                    "startedBy"
                ]
            );
    }


    // -------------------------------------------------------
    // 3. JWT User from JSON
    // -------------------------------------------------------

    if (!userId) {

        userId =
            findPropertyRecursive(
                tokenData,
                [
                    "JWT User",
                    "jwt_user",
                    "jwtUser"
                ]
            );
    }


    // -------------------------------------------------------
    // 4. User
    // -------------------------------------------------------

    if (!userId) {

        userId =
            findPropertyRecursive(
                tokenData,
                [
                    "User",
                    "user"
                ]
            );
    }


    if (!userId) {

        userId =
            findPropertyRecursive(
                innerData,
                [
                    "User",
                    "user",
                    "started_by",
                    "startedBy"
                ]
            );
    }


    // -------------------------------------------------------
    // 5. Outer User
    // -------------------------------------------------------

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


/**
 * =========================================================
 * EXTRACT USER NAME
 *
 * REQUIRED:
 *
 * given_name + family_name
 *
 * Chandana + S
 *
 * => Chandana S
 * =========================================================
 */
function extractUserName(
    tokenData,
    innerData,
    outerMessage,
    userId,
    auditMessage
) {

    let givenName =
        findPropertyRecursive(
            tokenData,
            [
                "given_name"
            ]
        );


    let familyName =
        findPropertyRecursive(
            tokenData,
            [
                "family_name"
            ]
        );


    // -------------------------------------------------------
    // Inner data fallback
    // -------------------------------------------------------

    if (!givenName) {

        givenName =
            findPropertyRecursive(
                innerData,
                [
                    "given_name"
                ]
            );
    }


    if (!familyName) {

        familyName =
            findPropertyRecursive(
                innerData,
                [
                    "family_name"
                ]
            );
    }


    // -------------------------------------------------------
    // Outer message fallback
    // -------------------------------------------------------

    if (!givenName) {

        givenName =
            findPropertyRecursive(
                outerMessage,
                [
                    "given_name"
                ]
            );
    }


    if (!familyName) {

        familyName =
            findPropertyRecursive(
                outerMessage,
                [
                    "family_name"
                ]
            );
    }


    // -------------------------------------------------------
    // Text fallback
    // -------------------------------------------------------

    if (!givenName) {

        givenName =
            extractTextValue(
                auditMessage,
                [
                    "given_name",
                    "given name"
                ]
            );
    }


    if (!familyName) {

        familyName =
            extractTextValue(
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


    // -------------------------------------------------------
    // Expected fallback:
    //
    // If given_name/family_name are unavailable,
    // display User ID.
    // -------------------------------------------------------

    return truncate(
        fullName || userId,
        200
    );
}


/**
 * =========================================================
 * EXTRACT USER INFORMATION
 * =========================================================
 */
function extractUserInformation(log) {

    // -------------------------------------------------------
    // OUTER MESSAGE
    // -------------------------------------------------------

    const outerMessage =
        safeJsonParse(
            log?.message
        ) || {};


    // -------------------------------------------------------
    // INNER DATA
    // -------------------------------------------------------

    const innerData =
        safeJsonParse(
            outerMessage?.data
        ) || {};


    // -------------------------------------------------------
    // AUDIT MESSAGE
    // -------------------------------------------------------

    const auditMessage =
        String(
            innerData?.message ||
            outerMessage?.message ||
            ""
        );


    // -------------------------------------------------------
    // TOKEN DATA
    // -------------------------------------------------------

    const tokenData =
        extractTokenData(
            auditMessage
        );


    // -------------------------------------------------------
    // USER ID
    // -------------------------------------------------------

    const userId =
        extractUserId(
            tokenData,
            innerData,
            outerMessage,
            log,
            auditMessage
        );


    // -------------------------------------------------------
    // USER NAME
    // -------------------------------------------------------

    const userName =
        extractUserName(
            tokenData,
            innerData,
            outerMessage,
            userId,
            auditMessage
        );


    // -------------------------------------------------------
    // ROLE COLLECTIONS
    // -------------------------------------------------------

    const roleCollections =
        extractRoleCollections(
            tokenData,
            innerData,
            outerMessage,
            auditMessage
        );


    // -------------------------------------------------------
    // SUBACCOUNT
    //
    // REQUIRED:
    //
    // log.tenant
    // -------------------------------------------------------

    const subaccount =
        truncate(
            log?.tenant,
            200
        );


    console.log(
        "-------------------------------------------------"
    );

    console.log(
        "Extracted User Information:"
    );

    console.log(
        JSON.stringify(
            {
                userId,
                userName,
                roleCollections,
                subaccount
            },
            null,
            2
        )
    );

    console.log(
        "-------------------------------------------------"
    );


    return {

        userId,

        userName,

        roleCollections,

        subaccount,

        auditMessage,

        tokenData,

        innerData,

        outerMessage

    };
}


/**
 * =========================================================
 * DETERMINE EVENT
 * =========================================================
 */
function determineEvent(auditMessage) {

    const message =
        String(
            auditMessage || ""
        ).toLowerCase();


    // -------------------------------------------------------
    // TOKEN ISSUED
    // -------------------------------------------------------

    if (
        message.includes(
            "tokenissuedevent"
        )
    ) {

        return {

            event:
                "Token Issued",

            fieldChanged:
                "Last Login",

            oldValue:
                "-",

            newValue:
                "Success",

            status:
                "Success"

        };
    }


    // -------------------------------------------------------
    // AUTHENTICATION SUCCESS
    // -------------------------------------------------------

    if (
        message.includes(
            "userauthenticationsuccess"
        )
    ) {

        return {

            event:
                "Login",

            fieldChanged:
                "Authentication",

            oldValue:
                "-",

            newValue:
                "Success",

            status:
                "Success"

        };
    }


    // -------------------------------------------------------
    // AUTHENTICATION FAILURE
    // -------------------------------------------------------

    if (
        message.includes(
            "userauthenticationfailure"
        )
    ) {

        return {

            event:
                "Login",

            fieldChanged:
                "Authentication",

            oldValue:
                "-",

            newValue:
                "Failure",

            status:
                "Failure"

        };
    }


    // -------------------------------------------------------
    // SECURITY AUDIT
    // -------------------------------------------------------

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

            event:
                "Security Audit",

            fieldChanged:
                null,

            oldValue:
                null,

            newValue:
                null,

            status:
                "Success"

        };
    }


    // -------------------------------------------------------
    // GENERIC AUDIT
    // -------------------------------------------------------

    return {

        event:
            "Audit Event",

        fieldChanged:
            null,

        oldValue:
            null,

        newValue:
            null,

        status:
            "Success"

    };
}


/**
 * =========================================================
 * MAP ONE AUDIT LOG
 * =========================================================
 */
function mapAuditLog(log) {

    const userInfo =
        extractUserInformation(log);


    const eventInfo =
        determineEvent(
            userInfo.auditMessage
        );


    // -------------------------------------------------------
    // ROLE COLLECTION STRING
    // -------------------------------------------------------

    const roleCollection =
        userInfo.roleCollections.length > 0
            ? userInfo.roleCollections.join(", ")
            : null;


    // -------------------------------------------------------
    // FINAL DATABASE RECORD
    // -------------------------------------------------------

    return {

        // 1. System
        system:
            "SAP BTP",


        // 2. User ID
        userId:
            userInfo.userId,


        // 3. User Name
        userName:
            userInfo.userName,


        // 4. User Type
        userType:
            "Standard",


        // 5. Role Collection
        roleCollection:
            truncate(
                roleCollection,
                500
            ),


        // 6. Event Type
        eventType:
            "User Management",


        // 7. Event
        event:
            eventInfo.event,


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
        //
        // IMPORTANT:
        // This is User ID, NOT User Name.
        performedBy:
            userInfo.userId,


        // 12. User Role
        //
        // Same xs.rolecollections value.
        userRole:
            truncate(
                roleCollection,
                500
            ),


        // 13. Subaccount
        subaccount:
            userInfo.subaccount,


        // 14. Timestamp
        timestamp:
            log?.time
                ? new Date(log.time)
                : null,


        // 15. Status
        status:
            eventInfo.status

    };
}


/**
 * =========================================================
 * FETCH AUDIT LOGS
 * =========================================================
 */
async function fetchUserAuditLogs(
    connection,
    token,
    timeFrom,
    timeTo
) {

    if (!connection?.apiBaseUrl) {

        throw new Error(
            "Audit Log API base URL is missing"
        );
    }


    const baseUrl =
        String(connection.apiBaseUrl)
            .replace(/\/+$/, "");

    const url =
        `${baseUrl}/auditlog/v2/auditlogrecords`;


    console.log(
        "================================================="
    );

    console.log(
        "FETCHING USER AUDIT LOGS"
    );

    console.log(
        `Subaccount: ${connection.subaccountName || "Unknown"}`
    );

    console.log(
        `Audit Log API: ${url}`
    );

    console.log(
        `From: ${timeFrom}`
    );

    console.log(
        `To: ${timeTo}`
    );

    console.log(
        "================================================="
    );


    let response;

    try {

        response =
            await axios.get(
                url,
                {

                    headers: {

                        Authorization:
                            `Bearer ${token}`,

                        Accept:
                            "application/json"

                    },

                    timeout:
                        120000,

                    params: {
                        time_from:
                            timeFrom,

                        time_to:
                            timeTo
                    }
                }
            );

    } catch (error) {

        console.error(
            "================================================="
        );

        console.error(
            "USER AUDIT API ERROR"
        );

        console.error(
            `Subaccount: ${connection.subaccountName || "Unknown"}`
        );

        console.error(
            "HTTP status:",
            error.response?.status
        );

        console.error(
            "Response:",
            JSON.stringify(
                error.response?.data
            )
        );

        console.error(
            "Error:",
            error.message
        );

        console.error(
            "================================================="
        );

        throw error;
    }


    const data =
        response.data;


    const records =
        Array.isArray(data)
            ? data
            : (
                Array.isArray(data?.value)
                    ? data.value
                    : []
            );


    console.log(
        `Received ${records.length} raw audit records`
    );


    const mappedRecords = [];


    records.forEach(
        (log, index) => {

            try {

                const mapped =
                    mapAuditLog(log);


                mappedRecords.push(mapped);


                if (index < 10) {

                    console.log(
                        `Mapped Audit Record ${index + 1}:`,
                        JSON.stringify(
                            mapped,
                            null,
                            2
                        )
                    );
                }

            } catch (err) {

                console.error(
                    `Error mapping audit record ${index + 1}:`,
                    err
                );

            }

        }
    );


    console.log(
        `Mapped ${mappedRecords.length} audit records`
    );


    return mappedRecords;
}


module.exports = {

    fetchUserAuditLogs

};
