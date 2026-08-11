const cds = require("@sap/cds");
const axios = require("axios");

/**
 * =========================================================
 * CONFIGURATION AUDIT FUNCTIONS
 * =========================================================
 *
 * FINAL OUTPUT:
 *
 * system
 * userId
 * userRole
 * eventType
 * btpService
 * subAccount       <-- IMPORTANT: CDS field name
 * region
 * actionPerformed
 * timestamp
 *
 * CDS:
 *
 * entity ConfigurationReport : cuid {
 *     system          : String(50);
 *     userId          : String(100);
 *     userRole        : String(1000);
 *     eventType       : String(50);
 *     btpService      : String(100);
 *     subAccount      : String(100);
 *     region          : String(100);
 *     actionPerformed : String(255);
 *     timestamp       : Timestamp;
 * }
 *
 * =========================================================
 */


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

    if (
        typeof value === "object"
    ) {
        return value;
    }

    try {

        return JSON.parse(
            String(value)
        );

    } catch (err) {

        return null;

    }
}


/**
 * =========================================================
 * PARSE NESTED JSON
 * =========================================================
 */
function parseNestedJson(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    if (
        typeof value === "object"
    ) {
        return value;
    }

    let current =
        String(value).trim();

    for (
        let i = 0;
        i < 6;
        i++
    ) {

        if (!current) {
            return null;
        }

        const parsed =
            safeJsonParse(
                current
            );

        if (
            parsed !== null
        ) {

            if (
                typeof parsed === "object"
            ) {

                return parsed;

            }

            current =
                String(parsed);

            continue;
        }

        /**
         * Remove wrapping quotes
         */
        current =
            current
                .replace(
                    /^["']/,
                    ""
                )
                .replace(
                    /["']$/,
                    ""
                )
                .replace(
                    /\\"/g,
                    '"'
                )
                .replace(
                    /\\\\/g,
                    "\\"
                )
                .trim();

        const parsedAgain =
            safeJsonParse(
                current
            );

        if (
            parsedAgain !== null
        ) {

            return parsedAgain;

        }

    }

    return null;
}


/**
 * =========================================================
 * STRING VALUE
 * =========================================================
 */
function toStringValue(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    if (
        typeof value === "object"
    ) {
        return null;
    }

    const result =
        String(value).trim();

    return result || null;
}


/**
 * =========================================================
 * VALUE TO STRING
 * =========================================================
 */
function valueToString(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    if (
        typeof value !== "object"
    ) {

        return toStringValue(
            value
        );

    }

    const possibleValues = [

        value.id,

        value.tenantId,

        value.tenant_id,

        value.tenant,

        value.subAccount,

        value.subaccount,

        value.subaccountId,

        value.subaccountid,

        value.subaccount_id,

        value.zid,

        value.zoneId,

        value.zone_id,

        value.value

    ];

    for (
        const item of possibleValues
    ) {

        const result =
            toStringValue(
                item
            );

        if (result) {
            return result;
        }

    }

    return null;
}


/**
 * =========================================================
 * TRUNCATE
 * =========================================================
 */
function truncate(
    value,
    maxLength = 500
) {

    const result =
        toStringValue(
            value
        );

    if (!result) {
        return null;
    }

    if (
        result.length > maxLength
    ) {

        return result.substring(
            0,
            maxLength
        );

    }

    return result;
}


/**
 * =========================================================
 * GET PROPERTY CASE INSENSITIVE
 * =========================================================
 */
function getOwnProperty(
    object,
    propertyName
) {

    if (
        !object ||
        typeof object !== "object"
    ) {

        return null;

    }

    const target =
        String(propertyName)
            .toLowerCase();

    for (
        const key of Object.keys(object)
    ) {

        if (
            key.toLowerCase() ===
            target
        ) {

            return object[key];

        }

    }

    return null;
}


/**
 * =========================================================
 * FIND PROPERTY RECURSIVELY
 * =========================================================
 */
function findPropertyRecursive(
    object,
    propertyNames,
    maxDepth = 15,
    currentDepth = 0
) {

    if (
        object === null ||
        object === undefined ||
        currentDepth > maxDepth
    ) {

        return null;

    }

    if (
        typeof object !== "object"
    ) {

        return null;

    }

    const names =
        propertyNames.map(
            name =>
                String(name)
                    .toLowerCase()
        );

    /**
     * Array
     */
    if (
        Array.isArray(object)
    ) {

        for (
            const item of object
        ) {

            const result =
                findPropertyRecursive(
                    item,
                    propertyNames,
                    maxDepth,
                    currentDepth + 1
                );

            if (
                result !== null &&
                result !== undefined &&
                result !== ""
            ) {

                return result;

            }

        }

        return null;
    }

    /**
     * Direct properties FIRST
     */
    for (
        const key of Object.keys(object)
    ) {

        if (
            names.includes(
                key.toLowerCase()
            )
        ) {

            const value =
                object[key];

            if (
                value !== null &&
                value !== undefined &&
                value !== ""
            ) {

                return value;

            }

        }

    }

    /**
     * Nested properties
     */
    for (
        const key of Object.keys(object)
    ) {

        const value =
            object[key];

        if (
            value &&
            typeof value === "object"
        ) {

            const result =
                findPropertyRecursive(
                    value,
                    propertyNames,
                    maxDepth,
                    currentDepth + 1
                );

            if (
                result !== null &&
                result !== undefined &&
                result !== ""
            ) {

                return result;

            }

        }

    }

    return null;
}


/**
 * =========================================================
 * BUILD SEARCH OBJECT
 * =========================================================
 */
function buildSearchObject(log) {

    const root = {};

    if (
        log &&
        typeof log === "object"
    ) {

        Object.assign(
            root,
            log
        );

    }

    /**
     * Outer message
     */
    const outerMessage =
        getOwnProperty(
            log,
            "message"
        );

    const parsedMessage =
        parseNestedJson(
            outerMessage
        );

    if (
        parsedMessage &&
        typeof parsedMessage === "object"
    ) {

        root.messageData =
            parsedMessage;

        Object.assign(
            root,
            parsedMessage
        );

    }

    /**
     * Data
     */
    const data =
        getOwnProperty(
            root,
            "data"
        );

    const parsedData =
        parseNestedJson(
            data
        );

    if (
        parsedData &&
        typeof parsedData === "object"
    ) {

        root.dataObject =
            parsedData;

        Object.assign(
            root,
            parsedData
        );

    }

    /**
     * Nested message inside data
     */
    const nestedMessage =
        findPropertyRecursive(
            root.dataObject,
            [
                "message"
            ]
        );

    const parsedNestedMessage =
        parseNestedJson(
            nestedMessage
        );

    if (
        parsedNestedMessage &&
        typeof parsedNestedMessage === "object"
    ) {

        root.nestedMessageData =
            parsedNestedMessage;

        Object.assign(
            root,
            parsedNestedMessage
        );

    }

    return root;
}


/**
 * =========================================================
 * NORMALIZE USER
 * =========================================================
 */
function normalizeUserKey(value) {

    const user =
        toStringValue(
            value
        );

    if (!user) {
        return null;
    }

    let normalized =
        user
            .trim()
            .toLowerCase();

    normalized =
        normalized.replace(
            /^user\/[^/]+\//i,
            ""
        );

    normalized =
        normalized.replace(
            /^user\//i,
            ""
        );

    normalized =
        normalized.replace(
            /^client\//i,
            ""
        );

    return normalized;
}


/**
 * =========================================================
 * EXTRACT USER ID
 * =========================================================
 */
function extractUserId(
    log,
    searchObject
) {

    let user =
        getOwnProperty(
            log,
            "user"
        );

    if (!user) {

        user =
            getOwnProperty(
                log,
                "User"
            );

    }

    if (!user) {

        user =
            findPropertyRecursive(
                searchObject,
                [
                    "user",
                    "User",
                    "userId",
                    "user_id",
                    "user_name",
                    "username",
                    "jwtUser",
                    "JWT User",
                    "started_by",
                    "startedBy",
                    "email"
                ]
            );

    }

    return truncate(
        valueToString(user),
        300
    );
}


/**
 * =========================================================
 * EXTRACT SUBACCOUNT FROM AUDIT RECORD
 * =========================================================
 *
 * IMPORTANT
 *
 * SAP Audit Log records can contain:
 *
 * tenant
 * tenantId
 * tenant_id
 * subaccountId
 * subaccountid
 * subaccount_id
 * subAccount
 * zid
 * zoneId
 * zone_id
 *
 * For your current audit records:
 *
 * tenant =
 * 4848195b-a792-4f4c-8b4b-a18269a08069
 *
 * This is the value we want.
 *
 * PRIORITY:
 *
 * 1. tenant
 * 2. tenantId
 * 3. tenant_id
 * 4. subAccount
 * 5. subaccount
 * 6. subaccountId
 * 7. subaccountid
 * 8. subaccount_id
 * 9. zid
 * 10. zoneId
 * 11. zone_id
 *
 * =========================================================
 */
function extractSubaccount(
    log,
    searchObject
) {

    const propertyNames = [

        "tenant",

        "tenantId",

        "tenant_id",

        "subAccount",

        "subaccount",

        "subaccountId",

        "subaccountid",

        "subaccount_id",

        "zid",

        "zoneId",

        "zone_id"

    ];

    /**
     * -----------------------------------------------------
     * 1. Check direct audit log properties
     * -----------------------------------------------------
     */
    for (
        const propertyName of propertyNames
    ) {

        const value =
            getOwnProperty(
                log,
                propertyName
            );

        const result =
            valueToString(
                value
            );

        if (result) {

            console.log(
                "================================================="
            );

            console.log(
                `SUBACCOUNT FOUND FROM AUDIT RECORD: ${propertyName} = ${result}`
            );

            console.log(
                "================================================="
            );

            return truncate(
                result,
                100
            );

        }

    }

    /**
     * -----------------------------------------------------
     * 2. Check known nested objects
     * -----------------------------------------------------
     */
    const preferredObjects = [

        searchObject?.dataObject,

        searchObject?.messageData,

        searchObject?.nestedMessageData,

        searchObject

    ];

    for (
        const object of preferredObjects
    ) {

        if (
            !object ||
            typeof object !== "object"
        ) {
            continue;
        }

        for (
            const propertyName of propertyNames
        ) {

            const value =
                findPropertyRecursive(
                    object,
                    [
                        propertyName
                    ]
                );

            const result =
                valueToString(
                    value
                );

            if (result) {

                console.log(
                    "================================================="
                );

                console.log(
                    `SUBACCOUNT FOUND FROM NESTED AUDIT RECORD: ${propertyName} = ${result}`
                );

                console.log(
                    "================================================="
                );

                return truncate(
                    result,
                    100
                );

            }

        }

    }

    console.warn(
        "SUBACCOUNT NOT FOUND IN AUDIT RECORD"
    );

    return null;
}


/**
 * =========================================================
 * EXTRACT SUBACCOUNT FROM JWT
 * =========================================================
 *
 * Priority:
 *
 * 1. ext_attr.subaccountid
 * 2. subaccount_id
 * 3. subaccountId
 * 4. subAccount
 * 5. tenant
 * 6. tenantId
 * 7. zid
 * 8. zone_id
 *
 * =========================================================
 */
function extractSubaccountFromToken(
    token
) {

    if (!token) {

        console.warn(
            "Cannot extract subaccount: token is empty"
        );

        return null;

    }

    try {

        const parts =
            String(token)
                .split(".");

        if (
            parts.length < 2
        ) {

            console.warn(
                "Access token is not a JWT"
            );

            return null;

        }

        /**
         * JWT payload
         */
        const payload =
            parts[1];

        /**
         * Base64URL -> Base64
         */
        const base64 =
            payload
                .replace(
                    /-/g,
                    "+"
                )
                .replace(
                    /_/g,
                    "/"
                );

        /**
         * Add padding
         */
        const padded =
            base64 +
            "=".repeat(
                (4 - base64.length % 4) % 4
            );

        /**
         * Decode
         */
        const decoded =
            Buffer
                .from(
                    padded,
                    "base64"
                )
                .toString(
                    "utf8"
                );

        const tokenData =
            JSON.parse(
                decoded
            );

        /**
         * -------------------------------------------------
         * 1. ext_attr.subaccountid
         * -------------------------------------------------
         */
        const extSubaccount =
            tokenData
                ?.ext_attr
                ?.subaccountid;

        if (
            extSubaccount
        ) {

            console.log(
                `SUBACCOUNT FOUND FROM JWT: ext_attr.subaccountid = ${extSubaccount}`
            );

            return String(
                extSubaccount
            ).trim();

        }

        /**
         * -------------------------------------------------
         * 2. subaccount_id
         * -------------------------------------------------
         */
        if (
            tokenData?.subaccount_id
        ) {

            console.log(
                `SUBACCOUNT FOUND FROM JWT: subaccount_id = ${tokenData.subaccount_id}`
            );

            return String(
                tokenData.subaccount_id
            ).trim();

        }

        /**
         * -------------------------------------------------
         * 3. subaccountId
         * -------------------------------------------------
         */
        if (
            tokenData?.subaccountId
        ) {

            console.log(
                `SUBACCOUNT FOUND FROM JWT: subaccountId = ${tokenData.subaccountId}`
            );

            return String(
                tokenData.subaccountId
            ).trim();

        }

        /**
         * -------------------------------------------------
         * 4. subAccount
         * -------------------------------------------------
         */
        if (
            tokenData?.subAccount
        ) {

            console.log(
                `SUBACCOUNT FOUND FROM JWT: subAccount = ${tokenData.subAccount}`
            );

            return String(
                tokenData.subAccount
            ).trim();

        }

        /**
         * -------------------------------------------------
         * 5. tenant
         * -------------------------------------------------
         */
        if (
            tokenData?.tenant
        ) {

            console.log(
                `SUBACCOUNT FOUND FROM JWT: tenant = ${tokenData.tenant}`
            );

            return String(
                tokenData.tenant
            ).trim();

        }

        /**
         * -------------------------------------------------
         * 6. tenantId
         * -------------------------------------------------
         */
        if (
            tokenData?.tenantId
        ) {

            console.log(
                `SUBACCOUNT FOUND FROM JWT: tenantId = ${tokenData.tenantId}`
            );

            return String(
                tokenData.tenantId
            ).trim();

        }

        /**
         * -------------------------------------------------
         * 7. zid
         * -------------------------------------------------
         */
        if (
            tokenData?.zid
        ) {

            console.log(
                `SUBACCOUNT FOUND FROM JWT: zid = ${tokenData.zid}`
            );

            return String(
                tokenData.zid
            ).trim();

        }

        /**
         * -------------------------------------------------
         * 8. zone_id
         * -------------------------------------------------
         */
        if (
            tokenData?.zone_id
        ) {

            console.log(
                `SUBACCOUNT FOUND FROM JWT: zone_id = ${tokenData.zone_id}`
            );

            return String(
                tokenData.zone_id
            ).trim();

        }

    } catch (err) {

        console.warn(
            "Could not extract subaccount from JWT:",
            err.message
        );

    }

    return null;
}


/**
 * =========================================================
 * EXTRACT REGION
 * =========================================================
 */
function extractRegion(
    searchObject,
    credentials
) {

    let region =
        findPropertyRecursive(
            searchObject,
            [
                "region",
                "regionName",
                "region_name",
                "cfRegion",
                "cf_region",
                "landscape",
                "dataCenter",
                "datacenter"
            ]
        );

    region =
        valueToString(
            region
        );

    if (region) {

        return truncate(
            region,
            100
        );

    }

    /**
     * Derive region from CMS URL
     *
     * Example:
     *
     * https://auditlog-management.cfapps.us10.hana.ondemand.com
     *
     * -> us10
     */
    const url =
        credentials?.url;

    if (url) {

        try {

            const hostname =
                new URL(
                    url
                ).hostname;

            let match =
                hostname.match(
                    /(?:cfapps\.|cf\.)?([a-z]{2}\d+)\.hana\.ondemand\.com/i
                );

            if (
                match &&
                match[1]
            ) {

                return match[1];

            }

            match =
                hostname.match(
                    /\b([a-z]{2}\d+)\b/i
                );

            if (
                match &&
                match[1]
            ) {

                return match[1];

            }

        } catch (err) {

            console.warn(
                "Could not derive region:",
                err.message
            );

        }

    }

    return null;
}


/**
 * =========================================================
 * EXTRACT OBJECT
 * =========================================================
 */
function extractObject(
    searchObject
) {

    const object =
        findPropertyRecursive(
            searchObject,
            [
                "object"
            ]
        );

    if (
        object &&
        typeof object === "object"
    ) {

        return object;

    }

    return {};
}


/**
 * =========================================================
 * EXTRACT OBJECT TYPE
 * =========================================================
 */
function extractObjectType(
    searchObject
) {

    const object =
        extractObject(
            searchObject
        );

    let type =
        getOwnProperty(
            object,
            "type"
        );

    if (!type) {

        type =
            getOwnProperty(
                object,
                "objectType"
            );

    }

    if (!type) {

        type =
            findPropertyRecursive(
                searchObject,
                [
                    "objectType",
                    "object_type",
                    "type"
                ]
            );

    }

    return truncate(
        valueToString(
            type
        ),
        200
    );
}


/**
 * =========================================================
 * EXTRACT TABLE NAME
 * =========================================================
 */
function extractTableName(
    searchObject
) {

    const tableName =
        findPropertyRecursive(
            searchObject,
            [
                "tableName",
                "table_name",
                "table"
            ]
        );

    return truncate(
        valueToString(
            tableName
        ),
        200
    );
}


/**
 * =========================================================
 * NORMALIZE CRUD
 * =========================================================
 */
function normalizeCrud(
    value
) {

    if (!value) {
        return null;
    }

    const text =
        String(value)
            .trim()
            .toUpperCase();

    if (
        text.includes("CREATE") ||
        text === "POST"
    ) {

        return "CREATE";

    }

    if (
        text.includes("UPDATE") ||
        text === "PUT" ||
        text === "PATCH"
    ) {

        return "UPDATE";

    }

    if (
        text.includes("DELETE") ||
        text === "REMOVE"
    ) {

        return "DELETE";

    }

    if (
        text.includes("READ") ||
        text === "GET"
    ) {

        return "READ";

    }

    return null;
}


/**
 * =========================================================
 * EXTRACT CRUD TYPE
 * =========================================================
 */
function extractCrudType(
    searchObject
) {

    const object =
        extractObject(
            searchObject
        );

    /**
     * object.id.crudType
     */
    const objectId =
        getOwnProperty(
            object,
            "id"
        );

    if (
        objectId &&
        typeof objectId === "object"
    ) {

        const crud =
            getOwnProperty(
                objectId,
                "crudType"
            );

        const normalized =
            normalizeCrud(
                crud
            );

        if (normalized) {

            return normalized;

        }

    }

    /**
     * object.crudType
     */
    const objectCrud =
        getOwnProperty(
            object,
            "crudType"
        );

    const normalizedObjectCrud =
        normalizeCrud(
            objectCrud
        );

    if (normalizedObjectCrud) {

        return normalizedObjectCrud;

    }

    /**
     * Search complete object
     */
    const crud =
        findPropertyRecursive(
            searchObject,
            [
                "crudType",
                "crud_type",
                "operation",
                "operationType",
                "action",
                "actionType"
            ]
        );

    const normalizedCrud =
        normalizeCrud(
            crud
        );

    if (normalizedCrud) {

        return normalizedCrud;

    }

    /**
     * Search raw JSON text
     */
    try {

        const text =
            JSON.stringify(
                searchObject
            );

        const match =
            text.match(
                /\b(CREATE|UPDATE|DELETE|READ)\b/i
            );

        if (
            match &&
            match[1]
        ) {

            return match[1]
                .toUpperCase();

        }

    } catch (err) {
        // Ignore
    }

    return null;
}


/**
 * =========================================================
 * DETERMINE BTP SERVICE
 * =========================================================
 */
function determineBtpService(
    objectType,
    tableName,
    searchObject
) {

    const candidates = [

        objectType,

        tableName

    ];

    /**
     * Add complete audit object text
     */
    try {

        candidates.push(
            JSON.stringify(
                searchObject
            )
        );

    } catch (err) {
        // Ignore
    }

    for (
        const candidate of candidates
    ) {

        if (!candidate) {
            continue;
        }

        const value =
            String(candidate)
                .toLowerCase();

        /**
         * ---------------------------------------------------
         * XSUAA
         * ---------------------------------------------------
         */
        if (

            value.includes(
                "xs_rolecollection2user"
            ) ||

            value.includes(
                "xsrolecollection2user"
            ) ||

            value.includes(
                "xsrolecollections"
            ) ||

            value.includes(
                "xsrolecollection"
            ) ||

            value.includes(
                "xsrole"
            ) ||

            value.includes(
                "rolecollection"
            ) ||

            value.includes(
                "rolecollections"
            ) ||

            value.includes(
                "xsuaa"
            )

        ) {

            return "XSUAA";

        }

        /**
         * ---------------------------------------------------
         * Cloud Foundry
         * ---------------------------------------------------
         */
        if (

            value === "application" ||

            value === "app" ||

            value === "route" ||

            value === "domain" ||

            value === "space" ||

            value === "organization" ||

            value === "org" ||

            value === "serviceinstance" ||

            value === "service_instance" ||

            value === "servicekey" ||

            value === "service_key" ||

            value === "buildpack" ||

            value === "securitygroup" ||

            value === "quota" ||

            value === "process" ||

            value.includes(
                "cloud foundry"
            ) ||

            value.includes(
                "cloudfoundry"
            )

        ) {

            return "Cloud Foundry";

        }

        /**
         * ---------------------------------------------------
         * Destination
         * ---------------------------------------------------
         */
        if (
            value.includes(
                "destination"
            )
        ) {

            return "Destination";

        }

        /**
         * ---------------------------------------------------
         * Connectivity
         * ---------------------------------------------------
         */
        if (
            value.includes(
                "connectivity"
            )
        ) {

            return "Connectivity";

        }

        /**
         * ---------------------------------------------------
         * Integration Suite
         * ---------------------------------------------------
         */
        if (

            value.includes(
                "integration suite"
            ) ||

            value.includes(
                "integration"
            ) ||

            value.includes(
                "iflow"
            ) ||

            value.includes(
                "i-flow"
            )

        ) {

            return "Integration Suite";

        }

    }

    /**
     * Never return objectId as BTP service.
     */
    return null;
}


/**
 * =========================================================
 * EXTRACT ACTION PERFORMED
 * =========================================================
 */
function extractActionPerformed(
    searchObject
) {

    return extractCrudType(
        searchObject
    );
}


/**
 * =========================================================
 * EXTRACT ROLE COLLECTIONS
 * =========================================================
 */
function extractRoleCollections(
    tokenData
) {

    if (
        !tokenData ||
        typeof tokenData !== "object"
    ) {

        return [];

    }

    let roles = null;

    /**
     * Exact SAP property
     */
    roles =
        getOwnProperty(
            tokenData,
            "xs.rolecollections"
        );

    /**
     * Nested xs object
     */
    if (!roles) {

        const xs =
            getOwnProperty(
                tokenData,
                "xs"
            );

        if (
            xs &&
            typeof xs === "object"
        ) {

            roles =
                getOwnProperty(
                    xs,
                    "rolecollections"
                );

        }

    }

    /**
     * SAP system attributes
     */
    if (!roles) {

        roles =
            getOwnProperty(
                tokenData,
                "xs.system.attributes.xs.rolecollections"
            );

    }

    /**
     * Recursive fallback
     */
    if (!roles) {

        roles =
            findPropertyRecursive(
                tokenData,
                [
                    "xs.rolecollections",
                    "rolecollections",
                    "roleCollections"
                ]
            );

    }

    if (
        Array.isArray(roles)
    ) {

        return roles
            .map(
                role =>
                    valueToString(
                        role
                    )
            )
            .filter(Boolean);

    }

    if (
        typeof roles === "string"
    ) {

        return roles
            .split(",")
            .map(
                role =>
                    role
                        .trim()
                        .replace(
                            /^["']|["']$/g,
                            ""
                        )
            )
            .filter(Boolean);

    }

    return [];
}


/**
 * =========================================================
 * EXTRACT TOKEN DATA FROM MESSAGE
 * =========================================================
 */
function extractTokenDataFromMessage(
    message
) {

    if (!message) {
        return null;
    }

    const text =
        String(message);

    const match =
        text.match(
            /TokenIssuedEvent\s*\(\s*['"]([\s\S]*?)['"]\s*\)/i
        );

    if (
        !match ||
        !match[1]
    ) {

        return null;

    }

    let tokenText =
        match[1].trim();

    /**
     * Direct JSON
     */
    let tokenData =
        parseNestedJson(
            tokenText
        );

    if (
        tokenData &&
        typeof tokenData === "object"
    ) {

        return tokenData;

    }

    /**
     * Escaped JSON
     */
    tokenText =
        tokenText
            .replace(
                /\\"/g,
                '"'
            )
            .replace(
                /\\\\/g,
                "\\"
            );

    tokenData =
        parseNestedJson(
            tokenText
        );

    if (
        tokenData &&
        typeof tokenData === "object"
    ) {

        return tokenData;

    }

    return null;
}


/**
 * =========================================================
 * FIND TOKEN DATA
 * =========================================================
 */
function findTokenData(
    object,
    maxDepth = 15,
    currentDepth = 0
) {

    if (
        object === null ||
        object === undefined ||
        currentDepth > maxDepth
    ) {

        return null;

    }

    if (
        typeof object === "string"
    ) {

        if (
            object.includes(
                "TokenIssuedEvent"
            )
        ) {

            return extractTokenDataFromMessage(
                object
            );

        }

        return null;

    }

    if (
        typeof object !== "object"
    ) {

        return null;

    }

    if (
        Array.isArray(object)
    ) {

        for (
            const item of object
        ) {

            const result =
                findTokenData(
                    item,
                    maxDepth,
                    currentDepth + 1
                );

            if (result) {
                return result;
            }

        }

        return null;
    }

    /**
     * Search direct string properties first
     */
    for (
        const key of Object.keys(object)
    ) {

        const value =
            object[key];

        if (
            typeof value === "string" &&
            value.includes(
                "TokenIssuedEvent"
            )
        ) {

            const result =
                extractTokenDataFromMessage(
                    value
                );

            if (result) {
                return result;
            }

        }

    }

    /**
     * Search nested properties
     */
    for (
        const key of Object.keys(object)
    ) {

        const result =
            findTokenData(
                object[key],
                maxDepth,
                currentDepth + 1
            );

        if (result) {
            return result;
        }

    }

    return null;
}


/**
 * =========================================================
 * EXTRACT TOKEN USER
 * =========================================================
 */
function extractTokenUser(
    tokenData,
    securityLog
) {

    if (
        tokenData &&
        typeof tokenData === "object"
    ) {

        const user =
            findPropertyRecursive(
                tokenData,
                [
                    "User",
                    "user",
                    "user_name",
                    "userName",
                    "username",
                    "email"
                ]
            );

        const result =
            valueToString(
                user
            );

        if (result) {
            return result;
        }

    }

    const logUser =
        findPropertyRecursive(
            securityLog,
            [
                "user",
                "User",
                "userId",
                "user_name",
                "username",
                "email"
            ]
        );

    return valueToString(
        logUser
    );
}


/**
 * =========================================================
 * BUILD ROLE MAP
 *
 * user -> xs.rolecollections
 *
 * =========================================================
 */
function buildRoleMap(
    securityRecords
) {

    const roleMap =
        new Map();

    for (
        const log of securityRecords
    ) {

        try {

            const searchObject =
                buildSearchObject(
                    log
                );

            /**
             * Find TokenIssuedEvent
             */
            const tokenData =
                findTokenData(
                    searchObject
                );

            if (!tokenData) {
                continue;
            }

            /**
             * Get roles
             */
            const roles =
                extractRoleCollections(
                    tokenData
                );

            if (
                roles.length === 0
            ) {

                continue;

            }

            /**
             * Get user
             */
            const user =
                extractTokenUser(
                    tokenData,
                    log
                );

            if (!user) {
                continue;
            }

            /**
             * Normalize user
             */
            const normalizedUser =
                normalizeUserKey(
                    user
                );

            if (!normalizedUser) {
                continue;
            }

            const roleString =
                roles.join(
                    ", "
                );

            /**
             * Store normalized user
             */
            roleMap.set(
                normalizedUser,
                roleString
            );

            /**
             * Also store email
             */
            const emailMatch =
                normalizedUser.match(
                    /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})$/i
                );

            if (
                emailMatch &&
                emailMatch[1]
            ) {

                roleMap.set(
                    emailMatch[1]
                        .toLowerCase(),
                    roleString
                );

            }

        } catch (err) {

            console.warn(
                "Unable to process security record:",
                err.message
            );

        }

    }

    return roleMap;
}


/**
 * =========================================================
 * FIND USER ROLE
 * =========================================================
 */
function findUserRole(
    userId,
    searchObject,
    roleMap
) {

    /**
     * -----------------------------------------------------
     * 1. Check configuration record itself
     * -----------------------------------------------------
     */
    const directRoles =
        findPropertyRecursive(
            searchObject,
            [
                "xs.rolecollections",
                "rolecollections",
                "roleCollections"
            ]
        );

    if (
        Array.isArray(directRoles)
    ) {

        const result =
            directRoles
                .map(
                    role =>
                        valueToString(
                            role
                        )
                )
                .filter(Boolean)
                .join(", ");

        if (result) {
            return result;
        }

    }

    if (
        typeof directRoles === "string"
    ) {

        return directRoles;

    }

    /**
     * -----------------------------------------------------
     * 2. Find TokenIssuedEvent directly
     * -----------------------------------------------------
     */
    const tokenData =
        findTokenData(
            searchObject
        );

    if (tokenData) {

        const roles =
            extractRoleCollections(
                tokenData
            );

        if (
            roles.length > 0
        ) {

            return roles.join(
                ", "
            );

        }

    }

    /**
     * -----------------------------------------------------
     * 3. Match user with role map
     * -----------------------------------------------------
     */
    const possibleUsers = [];

    if (userId) {

        possibleUsers.push(
            userId
        );

    }

    const nestedUser =
        findPropertyRecursive(
            searchObject,
            [
                "user",
                "User",
                "userId",
                "user_name",
                "username",
                "email"
            ]
        );

    if (nestedUser) {

        possibleUsers.push(
            nestedUser
        );

    }

    for (
        const user of possibleUsers
    ) {

        const normalized =
            normalizeUserKey(
                user
            );

        if (!normalized) {
            continue;
        }

        /**
         * Exact match
         */
        if (
            roleMap.has(
                normalized
            )
        ) {

            return roleMap.get(
                normalized
            );

        }

        /**
         * Email match
         */
        const emailMatch =
            normalized.match(
                /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})$/i
            );

        if (
            emailMatch &&
            roleMap.has(
                emailMatch[1]
                    .toLowerCase()
            )
        ) {

            return roleMap.get(
                emailMatch[1]
                    .toLowerCase()
            );

        }

    }

    return null;
}


/**
 * =========================================================
 * MAP CONFIGURATION AUDIT LOG
 * =========================================================
 */
function mapConfigurationAuditLog(
    log,
    credentials,
    roleMap,
    tokenSubaccount
) {

    const searchObject =
        buildSearchObject(
            log
        );

    /**
     * =====================================================
     * USER ID
     * =====================================================
     */
    const userId =
        extractUserId(
            log,
            searchObject
        );

    /**
     * =====================================================
     * USER ROLE
     * =====================================================
     */
    const userRole =
        findUserRole(
            userId,
            searchObject,
            roleMap
        );

    /**
     * =====================================================
     * SUBACCOUNT
     * =====================================================
     *
     * Priority:
     *
     * 1. Audit record
     * 2. JWT
     *
     * IMPORTANT:
     *
     * The final property is "subAccount"
     * because that is the CDS field name.
     *
     * =====================================================
     */
    let subaccount =
        extractSubaccount(
            log,
            searchObject
        );

    let subaccountSource =
        "AUDIT RECORD";

    /**
     * If audit record does not contain
     * subaccount, use JWT.
     */
    if (!subaccount) {

        subaccount =
            tokenSubaccount;

        subaccountSource =
            "JWT";

    }

    console.log(
        "================================================="
    );

    console.log(
        `FINAL SUBACCOUNT SOURCE: ${subaccountSource} = ${subaccount || "NOT FOUND"}`
    );

    console.log(
        "================================================="
    );

    /**
     * =====================================================
     * REGION
     * =====================================================
     */
    const region =
        extractRegion(
            searchObject,
            credentials
        );

    /**
     * =====================================================
     * OBJECT TYPE
     * =====================================================
     */
    const objectType =
        extractObjectType(
            searchObject
        );

    /**
     * =====================================================
     * TABLE NAME
     * =====================================================
    */
    const tableName =
        extractTableName(
            searchObject
        );

    /**
     * =====================================================
     * BTP SERVICE
     * =====================================================
     */
    const btpService =
        determineBtpService(
            objectType,
            tableName,
            searchObject
        );

    /**
     * =====================================================
     * ACTION
     * =====================================================
     */
    const actionPerformed =
        extractActionPerformed(
            searchObject
        );

    /**
     * =====================================================
     * TIMESTAMP
     * =====================================================
     */
    let timestamp =
        getOwnProperty(
            log,
            "creationTimestamp"
        );

    if (!timestamp) {

        timestamp =
            getOwnProperty(
                log,
                "time"
            );

    }

    if (!timestamp) {

        timestamp =
            findPropertyRecursive(
                searchObject,
                [
                    "creationTimestamp",
                    "createdAt",
                    "timestamp",
                    "time"
                ]
            );

    }

    let finalTimestamp =
        null;

    if (timestamp) {

        const date =
            new Date(
                timestamp
            );

        if (
            !Number.isNaN(
                date.getTime()
            )
        ) {

            finalTimestamp =
                date;

        }

    }

    /**
     * =====================================================
     * DEBUG
     * =====================================================
     *
     * IMPORTANT:
     * Use subAccount here to match CDS.
     */
    console.log(
        "================================================="
    );

    console.log(
        "CONFIGURATION AUDIT MAPPING"
    );

    console.log(
        JSON.stringify(
            {
                userId,
                userRole,
                objectType,
                tableName,
                btpService,

                // IMPORTANT:
                // CDS field = subAccount
                subAccount: subaccount,

                region,
                actionPerformed,
                timestamp:
                    finalTimestamp
            },
            null,
            2
        )
    );

    console.log(
        "================================================="
    );

    /**
     * =====================================================
     * FINAL OBJECT
     * =====================================================
     *
     * IMPORTANT:
     *
     * subAccount
     *
     * NOT:
     *
     * subaccount
     *
     * because CDS defines:
     *
     * subAccount : String(100);
     *
     * =====================================================
     */
    return {

        system:
            "SAP BTP",

        userId:
            truncate(
                userId,
                100
            ),

        userRole:
            truncate(
                userRole,
                1000
            ),

        eventType:
            "Configuration",

        btpService:
            truncate(
                btpService,
                100
            ),

        /**
         * IMPORTANT CDS FIELD NAME
         */
        subAccount:
            truncate(
                subaccount,
                100
            ),

        region:
            truncate(
                region,
                100
            ),

        actionPerformed:
            truncate(
                actionPerformed,
                255
            ),

        timestamp:
            finalTimestamp

    };
}


/**
 * =========================================================
 * FETCH ONE AUDIT CATEGORY
 * =========================================================
 */
async function fetchAuditCategory(
    token,
    baseUrl,
    category
) {

    const records = [];

    let handle =
        null;

    let pageNumber =
        1;

    do {

        console.log(
            `Fetching ${category} page ${pageNumber}`
        );

        const params = {

            category:
                category

        };

        if (handle) {

            params.handle =
                handle;

        }

        const response =
            await axios.get(
                baseUrl,
                {

                    headers: {

                        Authorization:
                            `Bearer ${token}`,

                        Accept:
                            "application/json"

                    },

                    params,

                    timeout:
                        120000

                }
            );

        const data =
            response.data;

        let pageRecords = [];

        if (
            Array.isArray(data)
        ) {

            pageRecords =
                data;

        } else if (
            Array.isArray(
                data?.value
            )
        ) {

            pageRecords =
                data.value;

        } else if (
            Array.isArray(
                data?.records
            )
        ) {

            pageRecords =
                data.records;

        }

        console.log(
            `${category} page ${pageNumber}: ${pageRecords.length} records`
        );

        records.push(
            ...pageRecords
        );

        /**
         * SAP paging header
         */
        const pagingHeader =
            response.headers?.paging ||
            response.headers?.Paging;

        handle =
            null;

        if (pagingHeader) {

            const pagingText =
                String(
                    pagingHeader
                );

            const match =
                pagingText.match(
                    /handle\s*=\s*["']?([^,"';\s]+)["']?/i
                );

            if (
                match &&
                match[1]
            ) {

                handle =
                    match[1].trim();

            }

        }

        if (handle) {

            pageNumber++;

        }

    } while (
        handle
    );

    return records;
}


/**
 * =========================================================
 * FETCH CONFIGURATION AUDIT LOGS
 * =========================================================
 */
async function fetchConfigurationAuditLogs(
    token
) {

    const credentials =
        cds.env.requires.cms.credentials;

    if (
        !credentials ||
        !credentials.url
    ) {

        throw new Error(
            "CMS credentials URL is missing"
        );

    }

    if (!token) {

        throw new Error(
            "Audit Log access token is missing"
        );

    }

    /**
     * =====================================================
     * EXTRACT SUBACCOUNT FROM JWT
     * =====================================================
     */
    const tokenSubaccount =
        extractSubaccountFromToken(
            token
        );

    console.log(
        "================================================="
    );

    console.log(
        "AUDIT LOG JWT SUBACCOUNT"
    );

    console.log(
        `JWT Subaccount ID: ${tokenSubaccount || "NOT FOUND"}`
    );

    console.log(
        "================================================="
    );

    /**
     * =====================================================
     * AUDIT LOG API URL
     * =====================================================
     */
    const baseUrl =
        `${credentials.url}/auditlog/v2/auditlogrecords`;

    console.log(
        "================================================="
    );

    console.log(
        "STARTING CONFIGURATION AUDIT LOG SYNC"
    );

    console.log(
        "================================================="
    );

    /**
     * =====================================================
     * 1. CONFIGURATION AUDIT RECORDS
     * =====================================================
     */
    const configurationRecords =
        await fetchAuditCategory(
            token,
            baseUrl,
            "audit.configuration"
        );

    console.log(
        `Received ${configurationRecords.length} configuration records`
    );

    /**
     * =====================================================
     * 2. SECURITY EVENTS
     *
     * Required for:
     *
     * xs.rolecollections
     * =====================================================
     */
    let securityRecords = [];

    try {

        securityRecords =
            await fetchAuditCategory(
                token,
                baseUrl,
                "audit.security-events"
            );

        console.log(
            `Received ${securityRecords.length} security records`
        );

    } catch (err) {

        console.warn(
            "audit.security-events could not be fetched:",
            err.message
        );

        /**
         * Fallback category
         */
        try {

            securityRecords =
                await fetchAuditCategory(
                    token,
                    baseUrl,
                    "audit.security"
                );

            console.log(
                `Received ${securityRecords.length} security records from fallback category`
            );

        } catch (fallbackErr) {

            console.warn(
                "Security audit records unavailable:",
                fallbackErr.message
            );

        }

    }

    /**
     * =====================================================
     * 3. BUILD USER -> ROLE COLLECTION MAP
     * =====================================================
     */
    const roleMap =
        buildRoleMap(
            securityRecords
        );

    console.log(
        `Role map contains ${roleMap.size} users`
    );

    /**
     * Debug role map
     */
    for (
        const [
            user,
            roles
        ]
        of roleMap.entries()
    ) {

        console.log(
            `ROLE MAP: ${user} -> ${roles}`
        );

    }

    /**
     * =====================================================
     * 4. MAP CONFIGURATION RECORDS
     * =====================================================
     */
    const mappedRecords = [];

    configurationRecords.forEach(
        (log, index) => {

            try {

                const mapped =
                    mapConfigurationAuditLog(
                        log,
                        credentials,
                        roleMap,
                        tokenSubaccount
                    );

                mappedRecords.push(
                    mapped
                );

                if (
                    index < 10
                ) {

                    console.log(
                        `FINAL CONFIGURATION RECORD ${index + 1}`
                    );

                    console.log(
                        JSON.stringify(
                            mapped,
                            null,
                            2
                        )
                    );

                }

            } catch (err) {

                console.error(
                    `Error mapping configuration record ${index + 1}:`,
                    err
                );

            }

        }
    );

    console.log(
        "================================================="
    );

    console.log(
        `Mapped ${mappedRecords.length} configuration audit records`
    );

    console.log(
        "================================================="
    );

    return mappedRecords;
}


/**
 * =========================================================
 * EXPORTS
 * =========================================================
 */
module.exports = {

    fetchConfigurationAuditLogs,

    mapConfigurationAuditLog

};