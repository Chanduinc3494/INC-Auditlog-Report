const axios = require("axios");

async function fetchUserLogs(baseUrl, token, timeFrom, timeTo) {
    const allLogs = [];
    let handle = null;
    let page = 0;

    try {
        while (true) {
            page++;

            const url = handle
                ? `${baseUrl}/auditlog/v2/auditlogrecords?handle=${encodeURIComponent(handle)}`
                : `${baseUrl}/auditlog/v2/auditlogrecords` +
                  `?category=audit.configuration` +
                  `&time_from=${encodeURIComponent(timeFrom)}` +
                  `&time_to=${encodeURIComponent(timeTo)}`;

            const start = Date.now();

            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                timeout: 30000
            });

            const duration = Date.now() - start;

            allLogs.push(...response.data);

            handle = extractHandle(response.headers["paging"]);
            if (!handle) {
                break;
            }
        }
        return allLogs;

    } catch (err) {
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

        throw new Error(
            `Failed to fetch role audit logs` +
            `${status ? ` (HTTP ${status})` : ""}: ` +
            `${details}`
        );
    }
}

function extractHandle(pagingHeader) {
    if (!pagingHeader) {
        return null;
    }

    const match = pagingHeader.match(/handle=([^;]+)/);
    return match ? match[1] : null;
}



// function processUserAuditLog(
//     log,
//     userMapping,
//     subaccountName
// ) {

//     const message =
//         typeof log.message === "string"
//             ? JSON.parse(log.message)
//             : log.message;

//     if (
//         !message ||
//         !message.object ||
//         !message.object.id
//     ) {
//         return [];
//     }

//     const obj =
//         message.object.id;

//     const entries = [];

//     const status =
//         message.success
//             ? "Success"
//             : "Failure";

//     /*
//      * -------------------------------------------------------
//      * USER CREATION
//      * -------------------------------------------------------
//      */
//     if (
//         obj.tableName === "users" &&
//         obj.crudType === "CREATE"
//     ) {

//         const onBehalfOf =
//             obj.onBehalfOf || "";

//         let userName = "";

//         /*
//          * Example:
//          * user/sap.default/aniketkumar.singh@incture.com
//          */
//         if (onBehalfOf.startsWith("user/")) {

//             userName =
//                 onBehalfOf
//                     .split("/")
//                     .pop() || "";
//         }

//         entries.push({

//             system: "BTP",

//             timestamp:
//                 message.time,

//             eventType:
//                 "User Management",

//             event:
//                 "User Creation",

//             userId:
//                 "",

//             userName:
//                 "",

//             userType:
//                 "",

//             roleCollection:
//                 "",

//             fieldChanged:
//                 "User Status",

//             oldValue:
//                 "-",

//             newValue:
//                 "User Created",

//             performedBy:
//                 userName,

//             userRole:
//                 "",

//             status:
//                 status,

//             subaccount:
//                 subaccountName
//         });

//         return entries;
//     }


//     /*
//      * -------------------------------------------------------
//      * USER DELETION
//      * -------------------------------------------------------
//      */
//     if (
//         obj.tableName === "users" &&
//         obj.crudType === "DELETE"
//     ) {

//         const completeAttribute =
//             (message.attributes || [])
//                 .find(
//                     attr =>
//                         attr?.name === "complete"
//                 );

//         let deletedUser = {};

//         if (completeAttribute?.old) {

//             try {

//                 deletedUser =
//                     typeof completeAttribute.old === "string"
//                         ? JSON.parse(
//                             completeAttribute.old
//                         )
//                         : completeAttribute.old;

//             } catch (error) {

//                 console.error(
//                     "Failed to parse deleted user data:",
//                     error
//                 );
//             }
//         }

//         const deletedUserId =
//             deletedUser?.id || "";

//         const deletedUserName =
//             deletedUser?.userName ||
//             deletedUser?.name?.formatted ||
//             "";

//         const deletedUserEmail =
//             deletedUser?.emails?.find(
//                 email => email?.primary === true
//             )?.value ||
//             deletedUser?.emails?.[0]?.value ||
//             "";

//         entries.push({

//             system: "BTP",

//             timestamp:
//                 message.time,

//             eventType:
//                 "User Management",

//             event:
//                 "User Deletion",

//             userId:
//                 deletedUserId,

//             userName:
//                 deletedUserName,

//             userType:
//                 "",

//             roleCollection:
//                 "",

//             fieldChanged:
//                 "User Status",

//             oldValue:
//                 deletedUser?.active === true
//                     ? "Active"
//                     : "Inactive",

//             newValue:
//                 "Deleted",

//             performedBy:
//                 deletedUserEmail ||
//                 obj.onBehalfOf ||
//                 "",

//             userRole:
//                 "",

//             status:
//                 status,

//             subaccount:
//                 subaccountName
//         });

//         return entries;
//     }


//     /*
//      * -------------------------------------------------------
//      * ROLE ASSIGNED TO USER
//      * -------------------------------------------------------
//      */
//     if (
//         obj.tableName ===
//             "xs_rolecollection2user" &&
//         obj.crudType === "CREATE"
//     ) {

//         const targetUser =
//             userMapping.get(
//                 obj.user_id
//             ) || {};

//         entries.push({

//             system: "BTP",

//             timestamp:
//                 message.time,

//             eventType:
//                 "Role Assignment",

//             event:
//                 "Role Assigned",

//             userId:
//                 obj.user_id || "",

//             userName:
//                 targetUser.userName ||
//                 targetUser.email ||
//                 "",

//             userType:
//                 "",

//             roleCollection:
//                 obj.rolecollection_name ||
//                 "",

//             fieldChanged:
//                 "Role Assignment",

//             oldValue:
//                 "-",

//             newValue:
//                 "Assigned",

//             performedBy:
//                 obj.onBehalfOf || "",

//             userRole:
//                 obj.rolecollection_name ||
//                 "",

//             status:
//                 status,

//             subaccount:
//                 subaccountName
//         });

//         return entries;
//     }


//     /*
//      * -------------------------------------------------------
//      * ROLE REMOVED FROM USER
//      * -------------------------------------------------------
//      */
//     if (
//         obj.tableName ===
//             "xs_rolecollection2user" &&
//         obj.crudType === "DELETE"
//     ) {

//         const targetUser =
//             userMapping.get(
//                 obj.user_id
//             ) || {};

//         entries.push({

//             system: "BTP",

//             timestamp:
//                 message.time,

//             eventType:
//                 "Role Assignment",

//             event:
//                 "Role Removed",

//             userId:
//                 obj.user_id || "",

//             userName:
//                 targetUser.userName ||
//                 targetUser.email ||
//                 "",

//             userType:
//                 "",

//             roleCollection:
//                 obj.rolecollection_name ||
//                 "",

//             fieldChanged:
//                 "Role Assignment",

//             oldValue:
//                 "Assigned",

//             newValue:
//                 "Removed",

//             performedBy:
//                 obj.onBehalfOf || "",

//             userRole:
//                 obj.rolecollection_name ||
//                 "",

//             status:
//                 status,

//             subaccount:
//                 subaccountName
//         });

//         return entries;
//     }


//     return entries;
// }
function processUserAuditLog(
    log,
    userMapping,
    subaccountName
) {

    const message =
        typeof log.message === "string"
            ? JSON.parse(log.message)
            : log.message;

    if (
        !message ||
        !message.object ||
        !message.object.id
    ) {
        return [];
    }

    const obj =
        message.object.id;

    const entries = [];

    const status =
        message.success
            ? "Success"
            : "Failure";

    /*
     * -------------------------------------------------------
     * PERFORMED BY
     *
     * log.user = user who performed the action
     *
     * Example:
     * user/sap.default/aniketkumar.singh@incture.com
     *
     * We intentionally do NOT use onBehalfOf.
     * -------------------------------------------------------
     */
    const performedBy =
        log.user || "";


    /*
     * -------------------------------------------------------
     * USER CREATION
     * -------------------------------------------------------
     *
     * For CREATE, the audit event does not contain
     * the newly created user's details.
     *
     * Therefore:
     * userId   = ""
     * userName = ""
     *
     * Only the performer is populated.
     */
    if (
        obj.tableName === "users" &&
        obj.crudType === "CREATE"
    ) {

        entries.push({

            system:
                "BTP",

            timestamp:
                message.time,

            eventType:
                "User Management",

            event:
                "User Creation",

            userId:
                "",

            userName:
                "",

            userType:
                "",

            roleCollection:
                "",

            fieldChanged:
                "User Status",

            oldValue:
                "-",

            newValue:
                "User Created",

            performedBy:
                performedBy,

            userRole:
                "",

            status:
                status,

            subaccount:
                subaccountName
        });

        return entries;
    }


    /*
     * -------------------------------------------------------
     * USER DELETION
     * -------------------------------------------------------
     *
     * Target user information comes from:
     *
     * attributes[].name = "complete"
     * attributes[].old  = complete user JSON
     */
    if (
        obj.tableName === "users" &&
        obj.crudType === "DELETE"
    ) {
        
const completeAttribute =
        Array.isArray(message.attributes)
            ? message.attributes.find(
                attr =>
                    attr?.name === "complete"
            )
            : null;

    let deletedUser = {};

    /*
     * -------------------------------------------------------
     * Parse complete.old
     * -------------------------------------------------------
     */
    if (completeAttribute?.old) {

        try {

            deletedUser =
                typeof completeAttribute.old === "string"
                    ? JSON.parse(
                        completeAttribute.old
                    )
                    : completeAttribute.old;

        } catch (error) {

            console.error(
                "Failed to parse deleted user data:",
                error
            );

            /*
             * Do not stop the complete audit synchronization
             * because one user record could not be parsed.
             */
            deletedUser = {};
        }
    }

    /*
     * -------------------------------------------------------
     * Extract deleted user information safely
     * -------------------------------------------------------
     */

    const deletedUserId =
        deletedUser?.id || "";

    const deletedUserName =
        deletedUser?.userName ||
        deletedUser?.name?.formatted ||
        "";

    const deletedUserEmail =
        Array.isArray(deletedUser?.emails) &&
        deletedUser.emails.length > 0
            ? deletedUser.emails.find(
                email =>
                    email?.primary === true
            )?.value ||
              deletedUser.emails[0]?.value ||
              ""
            : "";

             


        entries.push({

            system:
                "BTP",

            timestamp:
                message.time,

            eventType:
                "User Management",

            event:
                "User Deletion",

            userId:
                deletedUserEmail || deletedUserId,

            userName:
                deletedUserName,

            userType:
                "",

            roleCollection:
                "",

            fieldChanged:
                "User Status",

            oldValue:
                deletedUser?.active === true
                    ? "Active"
                    : "Inactive",

            newValue:
                "Deleted",

            performedBy:
                performedBy,

            userRole:
                "",

            status:
                status,

            subaccount:
                subaccountName
        });

        return entries;
    }


    /*
     * -------------------------------------------------------
     * ROLE ASSIGNED TO USER
     * -------------------------------------------------------
     *
     * obj.user_id = USER ON WHOM THE ACTION WAS PERFORMED
     *
     * log.user = USER WHO PERFORMED THE ACTION
     */
    if (
        obj.tableName ===
            "xs_rolecollection2user" &&
        obj.crudType === "CREATE"
    ) {

        const targetUser =
            userMapping.get(
                obj.user_id
            ) || {};

        entries.push({

            system:
                "BTP",

            timestamp:
                message.time,

            eventType:
                "Role Assignment",

            event:
                "Role Assigned",

            userId:
                targetUser.email || obj.user_id,

            userName:
                targetUser.userName ||
                "",

            userType:
                "",

            roleCollection:
                obj.rolecollection_name ||
                "",

            fieldChanged:
                "Role Assignment",

            oldValue:
                "-",

            newValue:
                "Assigned",

            performedBy:
                performedBy,

            userRole:
                obj.rolecollection_name ||
                "",

            status:
                status,

            subaccount:
                subaccountName
        });

        return entries;
    }


    /*
     * -------------------------------------------------------
     * ROLE REMOVED FROM USER
     * -------------------------------------------------------
     *
     * obj.user_id = USER ON WHOM THE ACTION WAS PERFORMED
     *
     * log.user = USER WHO PERFORMED THE ACTION
     */
    if (
        obj.tableName ===
            "xs_rolecollection2user" &&
        obj.crudType === "DELETE"
    ) {

        const targetUser =
            userMapping.get(
                obj.user_id
            ) || {};

        entries.push({

            system:
                "BTP",

            timestamp:
                message.time,

            eventType:
                "Role Assignment",

            event:
                "Role Removed",

            userId:
                targetUser.email || obj.user_id,

            userName:
                targetUser.userName ||
                "",

            userType:
                "",

            roleCollection:
                obj.rolecollection_name ||
                "",

            fieldChanged:
                "Role Assignment",

            oldValue:
                "Assigned",

            newValue:
                "Removed",

            performedBy:
                performedBy,

            userRole:
                obj.rolecollection_name ||
                "",

            status:
                status,

            subaccount:
                subaccountName
        });

        return entries;
    }


    return entries;
}
module.exports={
    processUserAuditLog,
    fetchUserLogs
}