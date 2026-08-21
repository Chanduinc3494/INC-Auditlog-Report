const axios = require("axios");

async function fetchConfigurationAuditLogs(
    baseUrl,
    token,
    timeFrom,
    timeTo
) {
    if (!baseUrl) {
        throw new Error(
            "Audit Log API base URL is missing."
        );
    }

    if (!token) {
        throw new Error(
            "Audit Log access token is missing."
        );
    }

    if (!timeFrom) {
        throw new Error(
            "Audit Log timeFrom is missing."
        );
    }

    if (!timeTo) {
        throw new Error(
            "Audit Log timeTo is missing."
        );
    }

    const normalizedBaseUrl =
        String(baseUrl).replace(/\/+$/, "");

    const allLogs = [];

    let handle = null;
    let page = 0;

    try {

        while (true) {

            page++;

            const url = handle
                ? `${normalizedBaseUrl}` +
                `/auditlog/v2/auditlogrecords` +
                `?handle=${encodeURIComponent(handle)}`
                : `${normalizedBaseUrl}` +
                `/auditlog/v2/auditlogrecords` +
                `?category=audit.configuration` +
                `&time_from=${encodeURIComponent(timeFrom)}` +
                `&time_to=${encodeURIComponent(timeTo)}`;


            const start = Date.now();

            const response = await axios.get(
                url,
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`,

                        Accept:
                            "application/json"
                    },

                    timeout: 30000
                }
            );


            const duration =
                Date.now() - start;




            // ----------------------------------------------------
            // Audit Log API returns an array
            // ----------------------------------------------------

            if (
                !Array.isArray(
                    response.data
                )
            ) {

                throw new Error(
                    `Unexpected Audit Log API response ` +
                    `format on page ${page}.`
                );
            }


            allLogs.push(
                ...response.data
            );


            // ----------------------------------------------------
            // Get pagination handle
            // ----------------------------------------------------

            handle =
                extractHandle(
                    response.headers?.paging
                );


            if (!handle) {
                break;
            }
        }





        return allLogs;


    } catch (err) {

        const status =
            err.response?.status;

        const data =
            err.response?.data;


        let details;


        if (typeof data === "string") {

            details = data;

        } else if (data?.message) {

            details =
                data.message;

        } else if (
            data?.error_description
        ) {

            details =
                data.error_description;

        } else if (data?.error) {

            details =
                data.error;

        } else {

            details =
                err.message;
        }


        throw new Error(
            `Failed to fetch configuration audit logs` +
            `${status ? ` (HTTP ${status})` : ""}: ` +
            `${details}`
        );
    }
}


function extractHandle(pagingHeader) {

    if (!pagingHeader) {
        return null;
    }


    const match =
        pagingHeader.match(
            /handle=([^;]+)/
        );


    return match
        ? match[1]
        : null;
}

// configurationAuditMapper.js

function normalizeString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}


/**
 * message is stored/received as a JSON STRING.
 */
function parseMessage(message) {
    if (!message) {
        return null;
    }

    if (typeof message === "object") {
        return message;
    }

    try {
        return JSON.parse(message);
    } catch (error) {
        throw new Error(
            `Unable to parse audit message JSON: ${error.message}`
        );
    }
}


function parseJsonValue(value) {
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
    } catch {
        return null;
    }
}


function normalizeUserId(user) {
    const value = normalizeString(user);

    if (!value) {
        return "";
    }

    // user/sap.default/aniketkumar.singh@incture.com
    //                     ↓
    // aniketkumar.singh@incture.com
    //
    // If you want the complete technical user value instead,
    // remove this normalization.
    if (value.startsWith("user/")) {
        const parts = value.split("/");

        return parts[parts.length - 1];
    }

    return value;
}


function normalizeEventType(value) {
    const event = normalizeString(value).toUpperCase();

    switch (event) {
        case "CREATE":
        case "CREATED":
        case "POST":
            return "CREATE";

        case "UPDATE":
        case "UPDATED":
        case "PUT":
        case "PATCH":
            return "UPDATE";

        case "DELETE":
        case "DELETED":
        case "REMOVE":
            return "DELETE";

        case "PROVISION":
        case "PROVISIONED":
            return "CREATE";

        case "DE-PROVISION":
        case "DEPROVISION":
        case "DEPROVISIONED":
            return "DELETE";

        default:
            return event || "UPDATE";
    }
}


function getObjectContext(message) {
    const messageObject = message?.object || {};
    const objectId = messageObject?.id || {};

    return {
        type: normalizeString(messageObject.type),
        id: objectId,

        crudType: normalizeString(
            objectId.crudType
        ),

        operation: normalizeString(
            objectId.operation
        ),

        operationType: normalizeString(
            objectId.operationType
        ),

        action: normalizeString(
            objectId.action
        ),

        tableName: normalizeString(
            objectId.tableName
        ),

        objectId: normalizeString(
            objectId.object_id
        ),

        roleCollectionName: normalizeString(
            objectId.rolecollection_name
        )
    };
}


function getRawOperation(context) {
    return (
        context.crudType ||
        context.operation ||
        context.operationType ||
        context.action
    );
}


function getEventType(context, message) {
    const operation = normalizeString(
        getRawOperation(context)
    );

    if (operation) {
        return normalizeEventType(operation);
    }

    const objectType =
        context.type.toLowerCase();

    if (objectType === "tenant provision") {
        return "CREATE";
    }

    if (
        objectType === "tenant de-provision" ||
        objectType === "tenant deprovision"
    ) {
        return "DELETE";
    }

    return "UPDATE";
}


/**
 * Return only attributes where old != new.
 */
function getChangedAttributes(attributes = []) {
    return attributes.filter(attr => {
        if (!attr) {
            return false;
        }

        const oldValue =
            attr.old === null ||
                attr.old === undefined
                ? ""
                : String(attr.old);

        const newValue =
            attr.new === null ||
                attr.new === undefined
                ? ""
                : String(attr.new);

        return oldValue !== newValue;
    });
}


/**
 * Convert seconds to a user-friendly duration.
 */
function formatDuration(seconds) {
    if (
        seconds === null ||
        seconds === undefined ||
        seconds === ""
    ) {
        return "Not configured";
    }

    const value = Number(seconds);

    if (!Number.isFinite(value)) {
        return String(seconds);
    }

    if (value < 0) {
        return "Disabled";
    }

    if (value === 0) {
        return "0 seconds";
    }

    let remaining = Math.floor(value);

    const days = Math.floor(
        remaining / 86400
    );

    remaining %= 86400;

    const hours = Math.floor(
        remaining / 3600
    );

    remaining %= 3600;

    const minutes = Math.floor(
        remaining / 60
    );

    const secondsRemaining =
        remaining % 60;

    const parts = [];

    if (days > 0) {
        parts.push(`${days}d`);
    }

    if (hours > 0) {
        parts.push(`${hours}h`);
    }

    if (minutes > 0) {
        parts.push(`${minutes}m`);
    }

    if (
        secondsRemaining > 0 ||
        parts.length === 0
    ) {
        parts.push(`${secondsRemaining}s`);
    }

    return parts.join(" ");
}


function formatValue(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "Not configured";
    }

    if (typeof value === "boolean") {
        return value
            ? "Enabled"
            : "Disabled";
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
}


function getAddUpdateRemove(oldValue, newValue) {
    const oldEmpty =
        oldValue === null ||
        oldValue === undefined ||
        String(oldValue).trim() === "";

    const newEmpty =
        newValue === null ||
        newValue === undefined ||
        String(newValue).trim() === "";

    if (oldEmpty && !newEmpty) {
        return "ADDED";
    }

    if (!oldEmpty && newEmpty) {
        return "REMOVED";
    }

    if (
        !oldEmpty &&
        !newEmpty &&
        String(oldValue) !== String(newValue)
    ) {
        return "UPDATED";
    }

    return "UNCHANGED";
}


/**
 * ---------------------------------------------------------
 * TOKEN VALIDITY
 * ---------------------------------------------------------
 */
function mapTokenValidity(attributes) {
    for (const attr of attributes) {
        const name =
            normalizeString(attr?.name)
                .toLowerCase();

        if (name !== "complete") {
            continue;
        }

        const oldValue =
            parseJsonValue(attr.old);

        const newValue =
            parseJsonValue(attr.new);

        if (!oldValue || !newValue) {
            continue;
        }

        const accessChanged =
            oldValue.accessTokenValidity !==
            newValue.accessTokenValidity;

        const refreshChanged =
            oldValue.refreshTokenValidity !==
            newValue.refreshTokenValidity;

        if (!accessChanged && !refreshChanged) {
            continue;
        }

        const changes = [];

        if (accessChanged) {
            changes.push(
                `Access Token Validity: ` +
                `${formatDuration(
                    oldValue.accessTokenValidity
                )} → ` +
                `${formatDuration(
                    newValue.accessTokenValidity
                )}`
            );
        }

        if (refreshChanged) {
            changes.push(
                `Refresh Token Validity: ` +
                `${formatDuration(
                    oldValue.refreshTokenValidity
                )} → ` +
                `${formatDuration(
                    newValue.refreshTokenValidity
                )}`
            );
        }

        return {
            btpService: "Subaccount Settings",
            eventType: "UPDATE",
            actionPerformed: changes.join("; ")
        };
    }

    return null;
}


/**
 * ---------------------------------------------------------
 * TRUSTED DOMAIN
 * ---------------------------------------------------------
 */
function mapTrustedDomain(attributes) {
    for (const attr of attributes) {
        const name =
            normalizeString(attr?.name)
                .toLowerCase();

        if (name !== "iframedomains") {
            continue;
        }

        const oldValue =
            normalizeString(attr.old);

        const newValue =
            normalizeString(attr.new);

        const operation =
            getAddUpdateRemove(
                oldValue,
                newValue
            );

        if (operation === "ADDED") {
            return {
                btpService: "Subaccount Settings",
                eventType: "UPDATE",
                actionPerformed:
                    `Trusted domain added: ${newValue}`
            };
        }

        if (operation === "REMOVED") {
            return {
                btpService: "Subaccount Settings",
                eventType: "UPDATE",
                actionPerformed:
                    `Trusted domain removed: ${oldValue}`
            };
        }

        if (operation === "UPDATED") {
            return {
                btpService: "Subaccount Settings",
                eventType: "UPDATE",
                actionPerformed:
                    `Trusted domain updated: ` +
                    `${oldValue} → ${newValue}`
            };
        }
    }

    return null;
}


/**
 * ---------------------------------------------------------
 * SIGNING CERTIFICATES / SIGNING KEYS
 * ---------------------------------------------------------
 */
function mapSigningCertificateChange(attributes) {
    for (const attr of attributes) {
        const name =
            normalizeString(attr?.name)
                .toLowerCase();

        // Direct attribute
        if (
            name === "usesigningcertificates" ||
            name === "usesigningcertificate"
        ) {
            const oldValue =
                normalizeString(attr.old)
                    .toLowerCase();

            const newValue =
                normalizeString(attr.new)
                    .toLowerCase();

            if (
                oldValue === "false" &&
                newValue === "true"
            ) {
                return {
                    btpService:
                        "Subaccount Settings",

                    eventType: "UPDATE",

                    actionPerformed:
                        "Signing certificates enabled"
                };
            }

            if (
                oldValue === "true" &&
                newValue === "false"
            ) {
                return {
                    btpService:
                        "Subaccount Settings",

                    eventType: "UPDATE",

                    actionPerformed:
                        "Signing certificates disabled"
                };
            }
        }

        // tenant_configuration/config may contain
        // useSigningCertificates.
        if (
            name !== "tenant_configuration" &&
            name !== "config" &&
            name !== "complete"
        ) {
            continue;
        }

        const oldValue =
            parseJsonValue(attr.old);

        const newValue =
            parseJsonValue(attr.new);

        if (!oldValue || !newValue) {
            continue;
        }

        const oldSetting =
            findNestedValue(
                oldValue,
                "useSigningCertificates"
            );

        const newSetting =
            findNestedValue(
                newValue,
                "useSigningCertificates"
            );

        if (
            oldSetting === undefined ||
            newSetting === undefined ||
            oldSetting === newSetting
        ) {
            continue;
        }

        if (
            oldSetting === false &&
            newSetting === true
        ) {
            return {
                btpService:
                    "Subaccount Settings",

                eventType: "UPDATE",

                actionPerformed:
                    "Signing certificates enabled"
            };
        }

        if (
            oldSetting === true &&
            newSetting === false
        ) {
            return {
                btpService:
                    "Subaccount Settings",

                eventType: "UPDATE",

                actionPerformed:
                    "Signing certificates disabled"
            };
        }
    }

    return null;
}


/**
 * Recursively find a property.
 */
function findNestedValue(
    object,
    targetKey
) {
    if (!object || typeof object !== "object") {
        return undefined;
    }

    if (
        Object.prototype.hasOwnProperty.call(
            object,
            targetKey
        )
    ) {
        return object[targetKey];
    }

    for (const key of Object.keys(object)) {
        const result =
            findNestedValue(
                object[key],
                targetKey
            );

        if (result !== undefined) {
            return result;
        }
    }

    return undefined;
}


/**
 * ---------------------------------------------------------
 * SERVICE SUBSCRIPTION
 * ---------------------------------------------------------
 */
function getServiceAppName(attributes) {
    for (const attr of attributes) {
        const newValue =
            parseJsonValue(attr?.new);

        if (
            newValue &&
            typeof newValue === "object" &&
            newValue.appName
        ) {
            return normalizeString(
                newValue.appName
            );
        }
    }

    return "";
}

function getServiceDetails(attributes) {
    for (const attr of attributes) {
        const newValue =
            parseJsonValue(attr?.new);

        if (
            newValue &&
            typeof newValue === "object"
        ) {
            return newValue;
        }
    }

    return null;
}

function mapSubscription(
    attributes,
    eventType
) {
    const service =
        getServiceDetails(attributes);

    if (!service?.appName) {
        return null;
    }

    const appName =
        normalizeString(
            service.appName
        );

    const stateDetails =
        normalizeString(
            service.stateDetails
        );

    /*
     * 1. Failed subscription
     *
     * This must be checked FIRST because
     * your failed subscription audit event
     * has eventType = DELETE.
     */
    if (
        stateDetails
            .toLowerCase()
            .includes("subscribe failed")
    ) {
        return {
            btpService: "Subscription",
            eventType,
            actionPerformed:
                `Subscription failed: ${appName}`
        };
    }

    /*
     * 2. Deleted subscription
     */
    if (eventType === "DELETE") {
        return {
            btpService: "Subscription",
            eventType,
            actionPerformed:
                `Subscription deleted: ${appName}`
        };
    }

    /*
     * 3. Created subscription
     */
    return {
        btpService: "Subscription",
        eventType,
        actionPerformed:
            `Subscription created: ${appName}`
    };
}

/**
 * ---------------------------------------------------------
 * ROLE ASSIGNMENT
 * ---------------------------------------------------------
 */
function mapRoleAssignment(
    context,
    eventType
) {
    const roleCollection =
        context.roleCollectionName;

    if (!roleCollection) {
        return null;
    }

    if (eventType === "CREATE") {
        return {
            btpService: "Role Assignment",
            eventType: "CREATE",
            userRole: roleCollection,
            actionPerformed:
                `Role assigned: ${roleCollection}`
        };
    }

    if (eventType === "DELETE") {
        return {
            btpService: "Role Assignment",
            eventType: "DELETE",
            userRole: roleCollection,
            actionPerformed:
                `Role removed: ${roleCollection}`
        };
    }

    return {
        btpService: "Role Assignment",
        eventType,
        userRole: roleCollection,
        actionPerformed:
            `Role assignment updated: ${roleCollection}`
    };
}


/**
 * ---------------------------------------------------------
 * DESTINATION
 * ---------------------------------------------------------
 */
function getDestinationName(attributes) {
    for (const attr of attributes) {
        const newValue =
            parseJsonValue(attr?.new);

        if (!newValue) {
            continue;
        }

        if (newValue.Name) {
            return normalizeString(
                newValue.Name
            );
        }

        if (newValue.name) {
            return normalizeString(
                newValue.name
            );
        }
    }

    return "";
}

function getDestinationInfo(attributes) {
    const names = [];
    let isDeployment = false;

    const deploymentDestinationNames = [
        "ui5",
        "srv-api",
        "html5-apps-repo-host",
        "html5-app-repo-host"
    ];

    for (const attr of attributes) {
        const newValue =
            parseJsonValue(attr?.new);

        if (!newValue) {
            continue;
        }

        // ------------------------------------------------
        // Deployment batch
        // ------------------------------------------------
        if (
            Array.isArray(
                newValue.configurations
            )
        ) {
            isDeployment = true;

            for (
                const configuration
                of newValue.configurations
            ) {
                const name =
                    normalizeString(
                        configuration?.Name ||
                        configuration?.name
                    );

                if (name) {
                    names.push(name);
                }
            }

            continue;
        }

        // ------------------------------------------------
        // Normal destination / deployment destination
        // ------------------------------------------------
        const name =
            normalizeString(
                newValue.Name ||
                newValue.name ||
                attr?.name
            );

        if (name) {
            names.push(name);

            /*
             * Deployment destinations can also arrive
             * as a single destination object rather than
             * inside a configurations[] array.
             */
            if (
                deploymentDestinationNames.includes(
                    name.toLowerCase()
                )
            ) {
                isDeployment = true;
            }
        }
    }

    return {
        names: [...new Set(names)],
        isDeployment
    };
}
function mapDestination(
    attributes,
    eventType
) {
    const {
        names: destinationNames,
        isDeployment
    } = getDestinationInfo(attributes);

    if (destinationNames.length === 0) {
        return {
            btpService: "Destination",
            eventType,
            actionPerformed:
                "Destination configuration changed"
        };
    }

    const destinationName =
        destinationNames[0];

    /*
     * --------------------------------------------------
     * DEPLOYMENT DESTINATIONS
     * --------------------------------------------------
     */

    if (isDeployment) {

        const normalizedName =
            destinationName
                .toLowerCase()
                .trim();

        /*
         * UI5 deployment destination
         */
        if (normalizedName === "ui5") {

            if (eventType === "CREATE") {
                return {
                    btpService: "Destination",
                    eventType: "Deployment",
                    actionPerformed:
                        "UI5 deployment destination created"
                };
            }

            if (eventType === "UPDATE") {
                return {
                    btpService: "Destination",
                    eventType: "Deployment",
                    actionPerformed:
                        "UI5 deployment destination configuration updated"
                };
            }
        }


        /*
         * Backend API destination
         */
        if (normalizedName === "srv-api") {

            const destinationConfig =
                getDestinationConfig(
                    attributes,
                    destinationName
                );

            const applicationName =
                getApplicationNameFromUrl(
                    destinationConfig
                );

            if (eventType === "CREATE") {
                return {
                    btpService: "Destination",
                    eventType: "Deployment",
                    actionPerformed:
                        applicationName
                            ? `Backend API destination \`srv-api\` created for \`${applicationName}\``
                            : "Backend API destination `srv-api` created"
                };
            }

            if (eventType === "UPDATE") {
                return {
                    btpService: "Destination",
                    eventType: "Deployment",
                    actionPerformed:
                        applicationName
                            ? `Backend API destination \`srv-api\` configuration updated for \`${applicationName}\``
                            : "Backend API destination `srv-api` configuration updated"
                };
            }
        }


        /*
         * HTML5 App Repository destination
         */
        if (
            normalizedName.includes("html_repo_host") ||
            normalizedName.includes("html5") ||
            normalizedName.includes("html-repo")
        ) {

            const destinationConfig =
                getDestinationConfig(
                    attributes,
                    destinationName
                );

            const applicationName =
                getApplicationNameFromUrl(
                    destinationConfig
                );

            if (eventType === "CREATE") {

                return {
                    btpService: "Destination",
                    eventType: "Deployment",
                    actionPerformed:
                        applicationName
                            ? `HTML5 App Repository destination created for \`${applicationName}\``
                            : "HTML5 App Repository destination created"
                };
            }

            if (eventType === "UPDATE") {

                return {
                    btpService: "Destination",
                    eventType: "Deployment",
                    actionPerformed:
                        applicationName
                            ? `HTML5 App Repository destination configuration updated for \`${applicationName}\``
                            : "HTML5 App Repository destination configuration updated"
                };
            }
        }
    }


    /*
     * --------------------------------------------------
     * NORMAL / USER CREATED DESTINATION
     * --------------------------------------------------
     */

    if (eventType === "CREATE") {

        return {
            btpService: "Destination",
            eventType: "CREATE",
            actionPerformed:
                `Destination created: ${destinationName}`
        };

    }

    if (eventType === "DELETE") {

        return {
            btpService: "Destination",
            eventType: "DELETE",
            actionPerformed:
                `Destination deleted: ${destinationName}`
        };

    }

    return {
        btpService: "Destination",
        eventType: "UPDATE",
        actionPerformed:
            `Destination updated: ${destinationName}`
    };
}
function getDestinationConfig(
    attributes,
    destinationName
) {
    for (const attr of attributes) {

        const newValue =
            parseJsonValue(attr?.new);

        if (!newValue) {
            continue;
        }

        /*
         * Deployment batch
         */
        if (
            Array.isArray(
                newValue.configurations
            )
        ) {
            const configuration =
                newValue.configurations.find(
                    config =>
                        normalizeString(
                            config?.Name ||
                            config?.name
                        ) === destinationName
                );

            if (configuration) {
                return configuration;
            }
        }

        /*
         * Normal destination
         */
        const name =
            normalizeString(
                newValue.Name ||
                newValue.name
            );

        if (
            name === destinationName
        ) {
            return newValue;
        }
    }

    return null;
}
/**
 * ---------------------------------------------------------
 * SERVICE BINDING
 * ---------------------------------------------------------
 */
function getServiceBindingName(attributes) {
    for (const attr of attributes) {
        const newValue =
            parseJsonValue(attr?.new);

        if (
            newValue &&
            newValue.name
        ) {
            return normalizeString(
                newValue.name
            );
        }
    }

    return "";
}


function mapServiceBinding(
    attributes,
    eventType
) {
    const name =
        getServiceBindingName(attributes);

    return {
        btpService: "Service Binding",
        eventType,
        actionPerformed:
            name
                ? `Service binding created: ${name}`
                : "Service binding created"
    };
}


/**
 * ---------------------------------------------------------
 * USER
 * ---------------------------------------------------------
 */
function mapUser(eventType) {
    if (eventType === "CREATE") {
        return {
            btpService: "User Management",
            eventType: "CREATE",
            actionPerformed:
                "User created"
        };
    }

    if (eventType === "DELETE") {
        return {
            btpService: "User Management",
            eventType: "DELETE",
            actionPerformed:
                "User deleted"
        };
    }

    return {
        btpService: "User Management",
        eventType: "UPDATE",
        actionPerformed:
            "User updated"
    };
}


/**
 * ---------------------------------------------------------
 * IDENTITY PROVIDER
 * ---------------------------------------------------------
 */
function getIdentityProviderChanges(attr) {
    const oldValue =
        parseJsonValue(attr?.old);

    const newValue =
        parseJsonValue(attr?.new);

    if (
        !oldValue ||
        !newValue
    ) {
        return {
            trustName:
                normalizeString(
                    newValue?.name ||
                    oldValue?.name
                ),
            changedFields: []
        };
    }

    const changedFields = [];

    /*
     * Top-level fields
     */
    if (
        oldValue.name !==
        newValue.name
    ) {
        changedFields.push("name");
    }

    if (
        oldValue.type !==
        newValue.type
    ) {
        changedFields.push("type");
    }

    /*
     * Configuration fields
     */
    const oldConfig =
        oldValue.config || {};

    const newConfig =
        newValue.config || {};

    if (
        oldConfig.providerDescription !==
        newConfig.providerDescription
    ) {
        changedFields.push(
            "providerDescription"
        );
    }

    if (
        oldConfig.relyingPartyId !==
        newConfig.relyingPartyId
    ) {
        changedFields.push(
            "relyingPartyId"
        );
    }

    if (
        oldConfig.issuer !==
        newConfig.issuer
    ) {
        changedFields.push(
            "issuer"
        );
    }

    if (
        oldConfig.userInfoUrl !==
        newConfig.userInfoUrl
    ) {
        changedFields.push(
            "userInfoUrl"
        );
    }

    if (
        oldConfig.discoveryUrl !==
        newConfig.discoveryUrl
    ) {
        changedFields.push(
            "discoveryUrl"
        );
    }

    if (
        oldConfig.passwordGrantEnabled !==
        newConfig.passwordGrantEnabled
    ) {
        changedFields.push(
            "passwordGrantEnabled"
        );
    }

    if (
        oldConfig.setForwardHeader !==
        newConfig.setForwardHeader
    ) {
        changedFields.push(
            "setForwardHeader"
        );
    }

    /*
     * Additional configuration
     */
    const oldAdditional =
        oldConfig.additionalConfiguration ||
        {};

    const newAdditional =
        newConfig.additionalConfiguration ||
        {};

    if (
        oldAdditional.domain !==
        newAdditional.domain
    ) {
        changedFields.push(
            "domain"
        );
    }

    return {
        trustName:
            normalizeString(
                newValue.name ||
                oldValue.name
            ),

        domain:
            normalizeString(
                newAdditional.domain ||
                oldAdditional.domain
            ),

        changedFields
    };
}
function mapIdentityProvider(
    attributes,
    context,
    eventType,
    identityProviderMap
) {
    const changedAttributes =
        getChangedAttributes(
            attributes
        );

    if (
        changedAttributes.length === 0
    ) {
        return null;
    }

    for (
        const attr
        of changedAttributes
    ) {
        const name =
            normalizeString(
                attr?.name
            ).toLowerCase();

        if (name !== "complete") {
            continue;
        }

        const {
            trustName,
            domain,
            changedFields
        } =
            getIdentityProviderChanges(
                attr
            );

        if (!trustName) {
            return null;
        }

        if (
            changedFields.length > 0
        ) {
            return {
                btpService:
                    "Identity Provider",

                eventType: "UPDATE",

                actionPerformed:
                    `Trust "${trustName}" updated: ` +
                    changedFields.join(", ")
            };
        }
    }

    /*
     * --------------------------------------------------
     * xsidentityproviderid2status
     *
     * This event doesn't contain the trust name.
     *
     * Example:
     *
     * identityproviderid =
     * b219651a-ddf3-42be-85a3-7a4167013c9a
     *
     * Use identityProviderMap to find the name.
     * --------------------------------------------------
     */

    const identityProviderId =
        normalizeString(
            context?.identityproviderid
        );

    const mappedTrustName =
        identityProviderMap?.get(
            identityProviderId
        );

    /*
     * If API didn't return the provider,
     * use the ID as fallback.
     */
    const trustName =
        mappedTrustName ||
        identityProviderId ||
        "Unknown";


    /*
     * --------------------------------------------------
     * Get operation and status
     * --------------------------------------------------
     */

    let operation = "";
    let status = "";

    for (
        const attr
        of changedAttributes
    ) {
        const name =
            normalizeString(
                attr?.name
            ).toLowerCase();

        const newValue =
            normalizeString(
                attr?.new
            ).toLowerCase();

        if (name === "operation") {
            operation = newValue;
        }

        if (name === "status") {
            status = newValue;
        }
    }


    /*
     * --------------------------------------------------
     * FAILED
     * --------------------------------------------------
     */

    if (status === "failed") {

        if (operation === "delete") {
            return {
                btpService:
                    "Identity Provider",

                eventType: "DELETE",

                actionPerformed:
                    `Trust "${trustName}" failed to delete`
            };
        }

        return {
            btpService:
                "Identity Provider",

            eventType,

            actionPerformed:
                `Trust "${trustName}" ` +
                `${operation || "operation"} failed`
        };
    }


    /*
     * --------------------------------------------------
     * DELETE
     * --------------------------------------------------
     */

    if (operation === "delete") {

        return {
            btpService:
                "Identity Provider",

            eventType: "DELETE",

            actionPerformed:
                `Trust "${trustName}" deleted`
        };
    }


    /*
     * --------------------------------------------------
     * CREATE
     * --------------------------------------------------
     */

    if (operation === "create") {

        return {
            btpService:
                "Identity Provider",

            eventType: "CREATE",

            actionPerformed:
                `Trust "${trustName}" created`
        };
    }


    /*
     * --------------------------------------------------
     * UPDATE
     * --------------------------------------------------
     */

    if (operation === "update") {

        return {
            btpService:
                "Identity Provider",

            eventType: "UPDATE",

            actionPerformed:
                `Trust "${trustName}" updated`
        };
    }


    return {
        btpService:
            "Identity Provider",

        eventType,

        actionPerformed:
            `Trust "${trustName}" updated`
    };
}
/**
 * ---------------------------------------------------------
 * TENANT LIFECYCLE
 * ---------------------------------------------------------
 */
function mapTenantLifecycle(
    context
) {
    const type =
        context.type.toLowerCase();

    if (type === "tenant provision") {
        return {
            btpService:
                "Tenant Lifecycle",

            eventType: "CREATE",

            actionPerformed:
                "Tenant provisioned"
        };
    }

    if (
        type === "tenant de-provision" ||
        type === "tenant deprovision"
    ) {
        return {
            btpService:
                "Tenant Lifecycle",

            eventType: "DELETE",

            actionPerformed:
                "Tenant de-provisioned"
        };
    }

    return null;
}


/**
 * ---------------------------------------------------------
 * GENERIC xs_tenant / SUBACCOUNT SETTINGS
 * ---------------------------------------------------------
 */
function mapGenericSubaccountSettings(
    attributes
) {
    const changedAttributes =
        getChangedAttributes(
            attributes
        );

    if (changedAttributes.length === 0) {
        return null;
    }

    /*
     * First check the specific settings.
     */

    const trustedDomain =
        mapTrustedDomain(
            changedAttributes
        );

    if (trustedDomain) {
        return trustedDomain;
    }

    const signingCertificate =
        mapSigningCertificateChange(
            changedAttributes
        );

    if (signingCertificate) {
        return signingCertificate;
    }

    const tokenValidity =
        mapTokenValidity(
            changedAttributes
        );

    if (tokenValidity) {
        return tokenValidity;
    }

    /*
     * Generic fallback.
     */
    const fields =
        changedAttributes
            .map(attr =>
                normalizeString(
                    attr?.name
                )
            )
            .filter(Boolean);

    return {
        btpService:
            "Subaccount Settings",

        eventType: "UPDATE",

        actionPerformed:
            fields.length > 0
                ? `Subaccount settings updated: ${fields.join(", ")}`
                : "Subaccount settings updated"
    };
}


/**
 * ---------------------------------------------------------
 * MAIN SINGLE-LOG MAPPER
 * ---------------------------------------------------------
 *
 * Returns an ARRAY because one raw message can contain
 * multiple logical records.
 */
function mapConfigurationAuditLog(log, identityProviderMap, userMap) {
    if (!log) {
        return [];
    }

    let message;

    try {
        message =
            parseMessage(log.message);
    } catch (error) {
        throw error;
    }

    if (!message) {
        return [];
    }

    const attributes =
        Array.isArray(message.attributes)
            ? message.attributes
            : [];

    const context =
        getObjectContext(message);

    const eventType =
        getEventType(
            context,
            message
        );

    const rawUserId =
        normalizeUserId(
            log.user
        );

    const userId =
        userMap?.get(rawUserId) ||
        rawUserId;

    const timestamp =
        message.time ||
        log.time ||
        null;

    const results = [];

    /*
     * ----------------------------------------------
     * Tenant lifecycle
     * ----------------------------------------------
     */
    const tenantLifecycle =
        mapTenantLifecycle(
            context
        );

    if (tenantLifecycle) {
        results.push({
            system: "BTP",
            userId,
            userRole: "",
            eventType:
                tenantLifecycle.eventType,
            btpService:
                tenantLifecycle.btpService,
            subAccount: null,
            region: null,
            actionPerformed:
                tenantLifecycle.actionPerformed,
            timestamp
        });

        return results;
    }


    /*
     * ----------------------------------------------
     * Role assignment
     * ----------------------------------------------
     */
    const roleAssignment =
        mapRoleAssignment(
            context,
            eventType
        );

    if (
        roleAssignment &&
        (
            context.type.toLowerCase() ===
            "xs_rolecollection2user" ||
            context.tableName.toLowerCase() ===
            "xs_rolecollection2user"
        )
    ) {
        results.push({
            system: "BTP",
            userId,
            userRole:
                roleAssignment.userRole || "",
            eventType:
                roleAssignment.eventType,
            btpService:
                roleAssignment.btpService,
            subAccount: null,
            region: null,
            actionPerformed:
                roleAssignment.actionPerformed,
            timestamp
        });

        return results;
    }


    /*
     * ----------------------------------------------
     * User
     * ----------------------------------------------
     */
    if (
        context.type.toLowerCase() ===
        "users" ||
        context.tableName.toLowerCase() ===
        "users"
    ) {
        const mappedUser =
            mapUser(
                eventType
            );

        results.push({
            system: "BTP",
            userId,
            userRole: "",
            eventType:
                mappedUser.eventType,
            btpService:
                mappedUser.btpService,
            subAccount: null,
            region: null,
            actionPerformed:
                mappedUser.actionPerformed,
            timestamp
        });

        return results;
    }

    /*
 * ----------------------------------------------
 * Application
 * ----------------------------------------------
 */
    const objectTypeLower =
        context.type.toLowerCase();
    if (
        objectTypeLower === "application"
    ) {
        const application =
            mapApplication(
                attributes,
                eventType
            );

        if (application) {
            results.push({
                system: "BTP",
                userId,
                userRole: "",
                eventType:
                    application.eventType,
                btpService:
                    application.btpService,
                subAccount: null,
                region: null,
                actionPerformed:
                    application.actionPerformed,
                timestamp
            });

            return results;
        }
    }



    /*
     * ----------------------------------------------
     * Subscription / Service
     * ----------------------------------------------
     */


    const isSubscription =
        objectTypeLower.includes(
            "subscription"
        ) ||
        attributes.some(attr => {
            const parsed =
                parseJsonValue(
                    attr?.new
                );

            return (
                parsed &&
                typeof parsed === "object" &&
                (
                    parsed.appName ||
                    parsed.stateDetails ||
                    parsed.errorDetails
                )
            );
        });

    if (isSubscription) {
        const subscription =
            mapSubscription(
                attributes,
                eventType
            );

        if (subscription) {
            results.push({
                system: "BTP",
                userId,
                userRole: "",
                eventType:
                    subscription.eventType,
                btpService:
                    subscription.btpService,
                subAccount: null,
                region: null,
                actionPerformed:
                    subscription.actionPerformed,
                timestamp
            });

            return results;
        }
    }


    /*
     * ----------------------------------------------
     * Destination
     * ----------------------------------------------
     */
    const isDestination =
        objectTypeLower === "objectid" ||
        objectTypeLower.includes(
            "destination"
        );

    if (isDestination) {
        const destination =
            mapDestination(
                attributes,
                eventType
            );

        results.push({
            system: "BTP",
            userId,
            userRole: "",
            eventType:
                destination.eventType,
            btpService:
                destination.btpService,
            subAccount: null,
            region: null,
            actionPerformed:
                destination.actionPerformed,
            timestamp
        });

        return results;
    }


    /*
     * ----------------------------------------------
     * Service binding
     * ----------------------------------------------
     */
    if (
        context.type.includes(
            "/v1/service_bindings"
        ) ||
        context.objectId.includes(
            "service_binding"
        )
    ) {
        const serviceBinding =
            mapServiceBinding(
                attributes,
                eventType
            );

        results.push({
            system: "BTP",
            userId,
            userRole: "",
            eventType:
                serviceBinding.eventType,
            btpService:
                serviceBinding.btpService,
            subAccount: null,
            region: null,
            actionPerformed:
                serviceBinding.actionPerformed,
            timestamp
        });

        return results;
    }


    /*
     * ----------------------------------------------
     * Identity Provider
     * ----------------------------------------------
     */
    if (
        objectTypeLower ===
        "identityprovider" ||
        objectTypeLower ===
        "identity provider"
    ) {
        const identityProvider =
            mapIdentityProvider(
                attributes,
                context,
                eventType,
                identityProviderMap
            );

        if (identityProvider) {
            results.push({
                system: "BTP",
                userId,
                userRole: "",
                eventType:
                    identityProvider.eventType,
                btpService:
                    identityProvider.btpService,
                subAccount: null,
                region: null,
                actionPerformed:
                    identityProvider.actionPerformed,
                timestamp
            });
        }

        return results;
    }


    /*
     * ----------------------------------------------
     * token keys
     * ----------------------------------------------
     */
    if (
        objectTypeLower ===
        "token keys"
    ) {
        const tokenValidity =
            mapTokenValidity(
                attributes
            );

        if (tokenValidity) {
            results.push({
                system: "BTP",
                userId,
                userRole: "",
                eventType:
                    tokenValidity.eventType,
                btpService:
                    tokenValidity.btpService,
                subAccount: null,
                region: null,
                actionPerformed:
                    tokenValidity.actionPerformed,
                timestamp
            });
        }

        return results;
    }


    /*
     * ----------------------------------------------
     * xs_tenant / subaccount settings
     * ----------------------------------------------
     */
    if (
        objectTypeLower ===
        "xs_tenant" ||
        context.tableName.toLowerCase() ===
        "xs_tenant"
    ) {
        const settings =
            mapGenericSubaccountSettings(
                attributes
            );

        if (settings) {
            results.push({
                system: "BTP",
                userId,
                userRole: "",
                eventType:
                    settings.eventType,
                btpService:
                    settings.btpService,
                subAccount: null,
                region: null,
                actionPerformed:
                    settings.actionPerformed,
                timestamp
            });
        }

        return results;
    }


    /*
     * ----------------------------------------------
     * Generic fallback
     * ----------------------------------------------
     */
    const changedAttributes =
        getChangedAttributes(
            attributes
        );

    if (
        changedAttributes.length > 0
    ) {
        const fields =
            changedAttributes
                .map(attr =>
                    normalizeString(
                        attr?.name
                    )
                )
                .filter(Boolean);

        results.push({
            system: "BTP",
            userId,
            userRole: "",
            eventType,
            btpService:
                context.type ||
                "Configuration",
            subAccount: null,
            region: null,
            actionPerformed:
                fields.length > 0
                    ? `Configuration updated: ${fields.join(", ")}`
                    : "Configuration updated",
            timestamp
        });
    }

    return results;
}
function consolidateConfigurationEntries(entries) {
    const result = [];

    const tokenEntries = [];
    const otherEntries = [];

    for (const entry of entries) {
        if (
            entry.btpService ===
            "Subaccount Settings" &&
            entry.actionPerformed?.startsWith(
                "Access Token Validity:"
            )
        ) {
            tokenEntries.push(entry);
        } else {
            otherEntries.push(entry);
        }
    }

    /*
     * If token validity generated multiple audit messages
     * for the same timestamp/user/subaccount, keep only
     * one logical reporting row.
     */
    const tokenGroups =
        new Map();

    for (const entry of tokenEntries) {
        const timestamp =
            entry.timestamp instanceof Date
                ? entry.timestamp.getTime()
                : String(entry.timestamp);

        const key = [
            entry.userId,
            entry.subAccount,
            timestamp
        ].join("|");

        if (!tokenGroups.has(key)) {
            tokenGroups.set(
                key,
                entry
            );
        }
    }

    result.push(
        ...otherEntries,
        ...tokenGroups.values()
    );

    return result;
}

/**
 * -------------------------------------------------------
 * De duplicate entries
 * --------------------------------------------------------
 */

function deduplicateConfigurationEntries(entries) {
    const unique = new Map();

    for (const entry of entries) {

        const timestamp =
            getSecondPrecisionTimestamp(
                entry.timestamp
            );

        const key = [
            entry.system || "",
            entry.userId || "",
            entry.userRole || "",
            entry.eventType || "",
            entry.btpService || "",
            entry.subAccount || "",
            entry.region || "",
            entry.actionPerformed || "",
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

/**
 * -------------------------------------------------------
 * Applications
 * --------------------------------------------------------
 */
function getApplicationInfo(attributes) {
    for (const attr of attributes) {
        const name =
            normalizeString(attr?.name)
                .toLowerCase();

        if (name !== "complete") {
            continue;
        }

        const oldValue =
            parseJsonValue(attr.old);

        const newValue =
            normalizeString(attr.new);

        let applicationName = "";

        // ---------------------------------------------
        // Get application name from old complete JSON
        // ---------------------------------------------
        if (
            oldValue &&
            typeof oldValue === "object"
        ) {
            applicationName =
                normalizeString(
                    oldValue.xsappname
                );
        }

        // ---------------------------------------------
        // If xsappname is also present in new value,
        // use it as fallback / confirmation
        // ---------------------------------------------
        if (!applicationName) {
            const match =
                newValue.match(
                    /xsappname:([^,}]+)/i
                );

            if (match) {
                applicationName =
                    normalizeString(
                        match[1]
                    );
            }
        }

        // ---------------------------------------------
        // Detect xs-security.json
        // ---------------------------------------------
        const fileChanged =
            newValue
                .toLowerCase()
                .includes("xs-security.json");

        return {
            applicationName,
            fileChanged
        };
    }

    return null;
}
function mapApplication(
    attributes,
    eventType
) {
    const application =
        getApplicationInfo(attributes);

    if (!application) {
        return null;
    }

    let actionPerformed =
        eventType === "CREATE"
            ? "Application created"
            : eventType === "DELETE"
                ? "Application deleted"
                : "Application updated";

    if (application.applicationName) {
        actionPerformed +=
            `: ${application.applicationName}`;
    }

    if (
        application.fileChanged
    ) {
        actionPerformed +=
            "; File: xs-security.json";
    }

    return {
        btpService: "Application",
        eventType,
        actionPerformed
    };
}
function getApplicationNameFromUrl(
    destinationConfig
) {
    if (!destinationConfig?.URL) {
        return null;
    }

    try {
        const hostname =
            new URL(
                destinationConfig.URL
            ).hostname;

        const appPart =
            hostname.split(".cfapps.")[0];

        /*
         * Example:
         *
         * 510027cetrial-dev-auditloggingandreporting-srv
         *
         * Remove subaccount/space prefix.
         */
        const marker =
            "-dev-";

        const index =
            appPart.indexOf(marker);

        if (index === -1) {
            return null;
        }

        const applicationPart =
            appPart.substring(
                index + marker.length
            );

        /*
         * Remove "-srv" suffix.
         */
        return applicationPart
            .replace(/-srv$/i, "");

    } catch {
        return null;
    }
}

/**
 * -------------------------------------------------------
 * Filter
 * --------------------------------------------------------
 */
function filterConfigurationEntries(entries) {

    const excludedServices = new Set([
        "User Management",
        "Role Assignment",
        "xsrole",
        "xsrolecollections",
        "xsrolecollection2role",
        "Tenant Lifecycle"
    ]);

    return entries.filter(entry => {
        const service =
            normalizeString(
                entry.btpService
            );

        return !excludedServices.has(service);
    });
}

module.exports = {
    mapConfigurationAuditLog,
    parseMessage,
    parseJsonValue,
    getChangedAttributes,
    formatDuration,
    fetchConfigurationAuditLogs,
    deduplicateConfigurationEntries,
    consolidateConfigurationEntries,
    filterConfigurationEntries
};