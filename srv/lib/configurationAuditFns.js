// const axios = require("axios");


// /**
//  * ============================================================
//  * FETCH CONFIGURATION AUDIT LOGS
//  * ============================================================
//  *
//  * @param {string} apiBaseUrl
//  * @param {string} token
//  * @param {string} timeFrom
//  * @param {string} timeTo
//  *
//  * @returns {Array}
//  * ============================================================
//  */

// async function fetchConfigurationAuditLogs(
//     apiBaseUrl,
//     token,
//     timeFrom,
//     timeTo
// ) {


//     if (!apiBaseUrl) {
//         throw new Error(
//             "Audit Log API base URL is missing."
//         );
//     }


//     if (!token) {
//         throw new Error(
//             "Audit Log access token is missing."
//         );
//     }

//     const baseUrl =
//         String(apiBaseUrl)
//             .replace(/\/+$/, "");


//     const url =
//         `${baseUrl}/auditlog/v2/auditlogrecords`;

//     const allLogs = [];
//     let page = 1;
//     let handle = null;


//     try {

//         while (true) {
//             const params = {};

//             if (timeFrom) {
//                 params.time_from =
//                     timeFrom;
//             }
//             if (timeTo) {

//                 params.time_to =
//                     timeTo;
//             }
//             params.category =
//                 "audit.configuration";

//             if (handle) {

//                 params.handle =
//                     handle;
//             }


//             console.log(
//                 "Request params:",
//                 params
//             );


//             /*
//              * ====================================================
//              * API CALL
//              * ====================================================
//              */

//             const response =
//                 await axios.get(
//                     url,
//                     {

//                         params,

//                         headers: {

//                             Authorization:
//                                 `Bearer ${token}`,

//                             Accept:
//                                 "application/json"

//                         }
//                     }
//                 );


//             /*
//              * ====================================================
//              * RESPONSE
//              * ====================================================
//              */

//             const data =
//                 response.data;



//             console.log(
//                 `Configuration Audit API status: ${response.status}`
//             );


//             /*
//              * ====================================================
//              * NORMALIZE RESPONSE
//              * ====================================================
//              */

//             let records = [];


//             if (
//                 Array.isArray(data)
//             ) {

//                 records =
//                     data;

//             } else if (
//                 Array.isArray(
//                     data?.value
//                 )
//             ) {

//                 records =
//                     data.value;

//             } else if (
//                 Array.isArray(
//                     data?.results
//                 )
//             ) {

//                 records =
//                     data.results;

//             } else if (
//                 Array.isArray(
//                     data?.auditLogRecords
//                 )
//             ) {

//                 records =
//                     data.auditLogRecords;
//             }


//             console.log(
//                 `Records received on page ${page}: ${records.length}`
//             );


//             /*
//              * ====================================================
//              * MAP RECORDS
//              * ====================================================
//              */

//             for (
//                 const log
//                 of records
//             ) {

//                 const entry =
//                     mapConfigurationAuditLog(
//                         log
//                     );


//                 if (
//                     entry
//                 ) {

//                     allLogs.push(
//                         entry
//                     );
//                 }
//             }


//             /*
//              * ====================================================
//              * PAGINATION HANDLE
//              * ====================================================
//              *
//              * SAP Audit Log Retrieval API can return a handle
//              * for the next chunk.
//              * ====================================================
//              */

//             const nextHandle =
//                 response.headers?.handle ||
//                 response.headers?.["x-handle"] ||
//                 data?.handle;


//             if (
//                 !nextHandle ||
//                 records.length === 0
//             ) {

//                 break;
//             }


//             handle =
//                 nextHandle;

//             page++;
//         }


//     } catch (error) {

//         console.error(
//             "================================================="
//         );

//         console.error(
//             "CONFIGURATION AUDIT API ERROR"
//         );

//         console.error(
//             "================================================="
//         );


//         console.error(
//             "HTTP status:",
//             error.response?.status
//         );


//         console.error(
//             "Response:",
//             JSON.stringify(
//                 error.response?.data
//             )
//         );


//         console.error(
//             "Error:",
//             error.message
//         );


//         throw error;
//     }


//     console.log(
//         "================================================="
//     );

//     console.log(
//         `TOTAL CONFIGURATION AUDIT LOGS: ${allLogs.length}`
//     );

//     console.log(
//         "================================================="
//     );


//     return allLogs;
// }


// /**
//  * ============================================================
//  * MAP CONFIGURATION AUDIT LOG
//  * ============================================================
//  */
// function getBtpService(object) {
//     const tableName = String(
//         object.tableName ||
//         object.type ||
//         object.table ||
//         ""
//     ).toLowerCase();

//     if (tableName === "xsrolecollections") {
//         return "Role Collection";
//     }

//     if (tableName === "xsrolecollection2role") {
//         return "Role Assignment";
//     }

//     if (tableName === "xs_rolecollection2user") {
//         return "User Role Assignment";
//     }

//     if (tableName === "users") {
//         return "User";
//     }

//     if (
//         tableName === "tenant provision" ||
//         tableName === "tenant de-provision"
//     ) {
//         return "Tenant";
//     }

//     if (
//         tableName.includes("rootsubscritpioncustomauditingentitylistener") ||
//         tableName.includes("rootsubscriptioncustomauditingentitylistener")
//     ) {
//         return "Subscription";
//     }

//     return object.tableName ||
//         object.type ||
//         object.table ||
//         "Configuration";
// }

// function mapConfigurationAuditLog(log) {
//     if (!log) return [];

//     let message = log.message;

//     try {
//         if (typeof message === "string") {
//             message = JSON.parse(message);
//         }
//     } catch {
//         return [];
//     }

//     if (!message) return [];

//     const object = message.object?.id || message.object || {};
//     const attributes = Array.isArray(message.attributes)
//         ? message.attributes
//         : [];

//     const userId = log.user
//         ? String(log.user).split("/").pop()
//         : "";

//     const btpService = getBtpService(object);

//     const crudType = String(
//         object.crudType ||
//         object.operation ||
//         ""
//     ).toUpperCase();

//     const timestamp =
//         message.time ||
//         log.time ||
//         null;

//     const base = {
//         system: "BTP",
//         userId,
//         userRole: "",
//         btpService,
//         timestamp
//     };

//     if (crudType === "CREATE") {
//         return [{
//             ...base,
//             eventType: "CREATE",
//             actionPerformed:
//                 `Created ${btpService}`
//         }];
//     }

//     if (crudType === "DELETE") {
//         return [{
//             ...base,
//             eventType: "DELETE",
//             actionPerformed:
//                 `Deleted ${btpService}`
//         }];
//     }

//     if (crudType === "UPDATE") {
//         const entries = [];

//         for (const attr of attributes) {
//             if (!attr) continue;

//             const oldValue = attr.old ?? "";
//             const newValue = attr.new ?? "";

//             if (
//                 String(oldValue) ===
//                 String(newValue)
//             ) {
//                 continue;
//             }

//             entries.push({
//                 ...base,
//                 eventType: "UPDATE",
//                 actionPerformed:
//                     `${attr.name}: ${oldValue} → ${newValue}`
//             });
//         }

//         return entries;
//     }

//     if (btpService === "Tenant") {
//         const eventType =
//             String(object.type || "").toLowerCase()
//                 .includes("de-provision")
//                 ? "DE-PROVISION"
//                 : "PROVISION";

//         return [{
//             ...base,
//             eventType,
//             actionPerformed:
//                 eventType === "PROVISION"
//                     ? "Tenant provisioned"
//                     : "Tenant de-provisioned"
//         }];
//     }

//     if (attributes.length > 0) {
//         return attributes.map(attr => ({
//             ...base,
//             eventType: btpService,
//             actionPerformed:
//                 `${attr.name}: ${attr.old ?? ""} → ${attr.new ?? ""}`
//         }));
//     }

//     return [{
//         ...base,
//         eventType: btpService,
//         actionPerformed: `${btpService} changed`
//     }];
// }


// module.exports = {

//     fetchConfigurationAuditLogs

// };
const axios = require("axios");

async function fetchConfigurationAuditLogs(
    apiBaseUrl,
    token,
    timeFrom,
    timeTo
) {
    if (!apiBaseUrl) {
        throw new Error("Audit Log API base URL is missing.");
    }

    if (!token) {
        throw new Error("Audit Log access token is missing.");
    }

    const baseUrl = String(apiBaseUrl).replace(/\/+$/, "");
    const url = `${baseUrl}/auditlog/v2/auditlogrecords`;

    const allLogs = [];
    let page = 1;
    let handle = null;

    try {
        while (true) {
            const params = {
                category: "audit.configuration"
            };

            if (timeFrom) {
                params.time_from = timeFrom;
            }

            if (timeTo) {
                params.time_to = timeTo;
            }

            if (handle) {
                params.handle = handle;
            }

            const response = await axios.get(url, {
                params,
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                }
            });

            const data = response.data;
            let records = [];

            if (Array.isArray(data)) {
                records = data;
            } else if (Array.isArray(data?.value)) {
                records = data.value;
            } else if (Array.isArray(data?.results)) {
                records = data.results;
            } else if (Array.isArray(data?.auditLogRecords)) {
                records = data.auditLogRecords;
            }

            allLogs.push(...records);

            const nextHandle =
                response.headers?.handle ||
                response.headers?.["x-handle"] ||
                data?.handle;

            if (!nextHandle || records.length === 0) {
                break;
            }

            handle = nextHandle;
            page++;
        }

        return allLogs;

    } catch (error) {
        console.error(
            "Configuration Audit API Error:",
            error.response?.data || error.message
        );

        throw error;
    }
}
function getBtpService(object) {
    const tableName = String(
        object.tableName ||
        object.type ||
        object.table ||
        ""
    ).toLowerCase();

    if (tableName === "xsrolecollections") {
        return "Role Collection";
    }

    if (tableName === "xsrolecollection2role") {
        return "Role Assignment";
    }

    if (tableName === "xs_rolecollection2user") {
        return "User Role Assignment";
    }

    if (tableName === "users") {
        return "User";
    }

    if (
        tableName === "tenant provision" ||
        tableName === "tenant de-provision"
    ) {
        return "Tenant";
    }

    if (
        tableName.includes("rootsubscritpioncustomauditingentitylistener") ||
        tableName.includes("rootsubscriptioncustomauditingentitylistener")
    ) {
        return "Subscription";
    }

    return (
        object.tableName ||
        object.type ||
        object.table ||
        "Configuration"
    );
}

function getActionPerformed(
    btpService,
    crudType,
    attr,
    object
) {
    const field = String(
        attr?.name || ""
    ).toLowerCase();

    if (btpService === "Role Collection") {

        const roleCollection =
            object?.name ||
            "Unknown Role Collection";

        if (crudType === "CREATE") {
            return `Role Collection "${roleCollection}" created`;
        }

        if (crudType === "DELETE") {
            return `Role Collection "${roleCollection}" deleted`;
        }

        if (crudType === "UPDATE") {

            if (field === "description") {
                return `Role Collection "${roleCollection}" description updated`;
            }

            if (field === "creation_type") {
                return `Role Collection "${roleCollection}" creation type updated`;
            }

            return `Role Collection "${roleCollection}" ${field || "configuration"} updated`;
        }
    }

    if (btpService === "Role Assignment") {

        const role =
            object?.role_name ||
            "Unknown Role";

        const roleCollection =
            object?.rolecollection_name ||
            "Unknown Role Collection";

        if (crudType === "CREATE") {
            return `Role "${role}" assigned to Role Collection "${roleCollection}"`;
        }

        if (crudType === "DELETE") {
            return `Role "${role}" removed from Role Collection "${roleCollection}"`;
        }

        if (crudType === "UPDATE") {
            return `Role "${role}" assignment updated in Role Collection "${roleCollection}"`;
        }
    }

    if (btpService === "User Role Assignment") {

        const roleCollection =
            object?.rolecollection_name ||
            "Unknown Role Collection";

        const user =
            object?.user_name ||
            object?.user ||
            "User";

        if (crudType === "CREATE") {
            return `${user} added to Role Collection "${roleCollection}"`;
        }

        if (crudType === "DELETE") {
            return `${user} removed from Role Collection "${roleCollection}"`;
        }

        if (crudType === "UPDATE") {
            return `${user} role assignment updated in Role Collection "${roleCollection}"`;
        }
    }

    if (btpService === "User") {

        if (crudType === "CREATE") {
            return "User created";
        }

        if (crudType === "DELETE") {
            return "User deleted";
        }

        if (crudType === "UPDATE") {

            if (field === "email") {
                return "User email updated";
            }

            if (field === "username") {
                return "Username updated";
            }

            if (field === "first_name") {
                return "User first name updated";
            }

            if (field === "last_name") {
                return "User last name updated";
            }

            return `User ${field || "details"} updated`;
        }
    }

    if (btpService === "Subscription") {

        if (crudType === "CREATE") {
            return "Subscription created";
        }

        if (crudType === "DELETE") {
            return "Subscription deleted";
        }

        if (crudType === "UPDATE") {
            return "Subscription updated";
        }
    }

    if (btpService === "Tenant") {

        if (crudType === "PROVISION") {
            return "Tenant provisioned";
        }

        if (crudType === "DE-PROVISION") {
            return "Tenant de-provisioned";
        }
    }

    if (crudType === "CREATE") {
        return `${btpService} created`;
    }

    if (crudType === "DELETE") {
        return `${btpService} deleted`;
    }

    if (crudType === "UPDATE") {
        return `${btpService} ${field || "configuration"} updated`;
    }

    return `${btpService} configuration changed`;
}

function mapConfigurationAuditLog(log) {
    if (!log) {
        return [];
    }

    let message = log.message;

    try {
        if (typeof message === "string") {
            message = JSON.parse(message);
        }
    } catch {
        return [];
    }

    if (!message) {
        return [];
    }

    const object =
        message.object?.id ||
        message.object ||
        {};

    const attributes =
        Array.isArray(message.attributes)
            ? message.attributes
            : [];

    const userId =
        log.user
            ? String(log.user)
                .split("/")
                .pop()
            : "";

    const btpService =
        getBtpService(object);

    const crudType =
        String(
            object.crudType ||
            object.operation ||
            ""
        ).toUpperCase();

    const timestamp =
        message.time ||
        log.time ||
        null;

    const base = {
        system: "BTP",
        userId,
        userRole: "",
        btpService,
        timestamp
    };

    if (crudType === "CREATE") {

        return [{
            ...base,

            eventType: "CREATE",

            actionPerformed:
                getActionPerformed(
                    btpService,
                    "CREATE",
                    null,
                    object
                )
        }];
    }

    if (crudType === "DELETE") {

        return [{
            ...base,

            eventType: "DELETE",

            actionPerformed:
                getActionPerformed(
                    btpService,
                    "DELETE",
                    null,
                    object
                )
        }];
    }

    if (crudType === "UPDATE") {

        const entries = [];

        for (const attr of attributes) {

            if (!attr) {
                continue;
            }

            const oldValue =
                attr.old ?? "";

            const newValue =
                attr.new ?? "";

            if (
                String(oldValue) ===
                String(newValue)
            ) {
                continue;
            }

            entries.push({

                ...base,

                eventType: "UPDATE",

                actionPerformed:
                    getActionPerformed(
                        btpService,
                        "UPDATE",
                        attr,
                        object
                    )
            });
        }

        return entries;
    }

    if (btpService === "Tenant") {

        const isDeProvision =
            String(
                object.type || ""
            )
                .toLowerCase()
                .includes("de-provision");

        return [{

            ...base,

            eventType:
                isDeProvision
                    ? "DE-PROVISION"
                    : "PROVISION",

            actionPerformed:
                isDeProvision
                    ? "Tenant de-provisioned"
                    : "Tenant provisioned"
        }];
    }

    return [{

        ...base,

        eventType:
            crudType || "CHANGE",

        actionPerformed:
            getActionPerformed(
                btpService,
                crudType || "CHANGE",
                null,
                object
            )
    }];
}


module.exports = {
    fetchConfigurationAuditLogs,
    mapConfigurationAuditLog
};