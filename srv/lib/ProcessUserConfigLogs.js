function processUserConfigLog(
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
     * log.user = user who performed the action
     * -------------------------------------------------------
     */
    const performedBy = log.user || "";
    const completeAttribute =
        Array.isArray(message.attributes)
            ? message.attributes.find(
                attr =>
                    attr?.name === "complete"
            )
            : null;

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

        let createdUser = {};
        if (completeAttribute?.new) {

            try {

                createdUser =
                    typeof completeAttribute.new === "string"
                        ? JSON.parse(
                            completeAttribute.new
                        )
                        : completeAttribute.new;

            } catch (error) {

                console.error(
                    "Failed to parse created user data:",
                    error
                );

                createdUser = {};
            }
        }
        // email
        const createdUserEmail =
            Array.isArray(createdUser?.emails) &&
                createdUser.emails.length > 0
                ? createdUser.emails.find(
                    email =>
                        email?.primary === true
                )?.value ||
                createdUser.emails[0]?.value ||
                ""
                : "";


        /*
         * Extract username
         */
        const createdUserName =
            createdUser?.userName || "";


        entries.push({

            system:
                "BTP",

            timestamp:
                message.time,

            eventType:
                "User Management",

            event:
                "User Creation",

            userId: createdUserEmail,

            userName:createdUserName,

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
module.exports = {
    processUserConfigLog,
}