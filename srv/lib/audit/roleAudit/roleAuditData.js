async function fetchAndMapRoleLogs({
    connection,
    token,
    timeFrom,
    timeTo,
    subaccountName,
    fetchRoleLogs
}) {

    const entries = [];


    //Fetch raw role audit logs
     
    const roleLogs = await fetchRoleLogs(
        connection.apiBaseUrl,
        token,
        timeFrom,
        timeTo
    );

    
     // Map every raw log to RoleAuditReport format
     
    for (const log of roleLogs) {

        const message =
            typeof log.message === "string"
                ? JSON.parse(log.message)
                : log.message;

        
        // Ignore invalid logs which is not related to role collections
        
        if (
            !message ||
            !message.object ||
            !message.object.id
        ) {
            continue;
        }

        const obj = message.object.id;

        const changedByUserId = log.user
            ? log.user.split("/").pop()
            : "";

        /*
         * ------------------------------------------
         * ROLE COLLECTION CREATED
         * ------------------------------------------
         */
        if (
            obj.tableName === "xsrolecollections" &&
            obj.crudType === "CREATE"
        ) {

            entries.push({
                system: "BTP",

                roleCollection: obj.name,

                event: "Create",

                timestamp: message.time,

                changedByUserId,

                userRole: "",

                fieldChanged: "Role Collection",

                oldValue: "Not Exists",

                newValue: obj.name,

                status:
                    message.success
                        ? "Success"
                        : "Failure",

                subaccountName
            });

            continue;
        }

        /*
         * ------------------------------------------
         * ROLE COLLECTION DELETED
         * ------------------------------------------
         */
        if (
            obj.tableName === "xsrolecollections" &&
            obj.crudType === "DELETE"
        ) {

            entries.push({
                system: "BTP",

                roleCollection: obj.name,

                event: "Delete",

                timestamp: message.time,

                changedByUserId,

                userRole: "",

                fieldChanged: "Role Collection",

                oldValue: obj.name,

                newValue: "Deleted",

                status:
                    message.success
                        ? "Success"
                        : "Failure",

                subaccountName
            });

            continue;
        }

        /*
         * ------------------------------------------
         * ROLE ASSIGNED
         * ------------------------------------------
         */
        if (
            obj.tableName === "xsrolecollection2role" &&
            obj.crudType === "CREATE"
        ) {

            entries.push({
                system: "BTP",

                roleCollection:
                    obj.rolecollection_name,

                event: "Assign",

                timestamp: message.time,

                changedByUserId,

                userRole: "",

                fieldChanged: "Role Assignment",

                oldValue: "Not Assigned",

                newValue:
                    `Assigned (${obj.role_name})`,

                status:
                    message.success
                        ? "Success"
                        : "Failure",

                subaccountName
            });

            continue;
        }

        /*
         * ------------------------------------------
         * ROLE REMOVED
         * ------------------------------------------
         */
        if (
            obj.tableName === "xsrolecollection2role" &&
            obj.crudType === "DELETE"
        ) {

            entries.push({
                system: "BTP",

                roleCollection:
                    obj.rolecollection_name,

                event: "Remove",

                timestamp: message.time,

                changedByUserId,

                userRole: "",

                fieldChanged: "Role Assignment",

                oldValue:
                    `Assigned (${obj.role_name})`,

                newValue: "Not Assigned",

                status:
                    message.success
                        ? "Success"
                        : "Failure",

                subaccountName
            });

            continue;
        }

        /*
         * ------------------------------------------
         * ROLE COLLECTION UPDATED
         * ------------------------------------------
         */
        if (
            obj.tableName === "xsrolecollections" &&
            obj.crudType === "UPDATE"
        ) {

            for (const attr of message.attributes || []) {

                /*
                 * Ignore unchanged attributes
                 */
                if (attr.old === attr.new) {
                    continue;
                }

                entries.push({
                    system: "BTP",

                    roleCollection: obj.name,

                    event: "Update",

                    timestamp: message.time,

                    changedByUserId,

                    userRole: "",

                    fieldChanged: attr.name,

                    oldValue: attr.old || "",

                    newValue: attr.new || "",

                    status:
                        message.success
                            ? "Success"
                            : "Failure",

                    subaccountName
                });
            }

            continue;
        }
    }

    return entries;
}


module.exports = {
    fetchAndMapRoleLogs
};