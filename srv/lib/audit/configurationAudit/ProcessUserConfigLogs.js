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

            userName: createdUserName,

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
 * USER UPDATE
 * -------------------------------------------------------
 */
    if (
        obj.tableName === "users" &&
        obj.crudType === "UPDATE"
    ) {
        console.log("user update logs",log);
        let oldUser = {};
        let newUser = {};
        if (completeAttribute?.old) {
            try {
                oldUser =
                    typeof completeAttribute.old === "string"
                        ? JSON.parse(completeAttribute.old)
                        : completeAttribute.old;
            } catch (error) {
                console.error(
                    "Failed to parse old user data:",
                    error
                );
            }
        }

        if (completeAttribute?.new) {
            try {
                newUser =
                    typeof completeAttribute.new === "string"
                        ? JSON.parse(completeAttribute.new)
                        : completeAttribute.new;
            } catch (error) {
                console.error(
                    "Failed to parse new user data:",
                    error
                );
            }
        }

        /*
         * Extract target user information
         */
        const userId =
            newUser?.id ||
            oldUser?.id ||
            "";

        const userName =
            newUser?.userName ||
            oldUser?.userName ||
            newUser?.name?.formatted ||
            oldUser?.name?.formatted ||
            "";

        const userEmail =
            Array.isArray(newUser?.emails) &&
                newUser.emails.length > 0
                ? newUser.emails.find(
                    email => email?.primary === true
                )?.value ||
                newUser.emails[0]?.value ||
                ""
                : Array.isArray(oldUser?.emails) &&
                    oldUser.emails.length > 0
                    ? oldUser.emails.find(
                        email => email?.primary === true
                    )?.value ||
                    oldUser.emails[0]?.value ||
                    ""
                    : "";
        const fieldsToCheck = [
            {
                field: "User Name",
                key: "userName"
            },
            {
                field: "External ID",
                key: "externalId"
            },
            {
                field: "Active",
                key: "active"
            },
            {
                field: "Verified",
                key: "verified"
            },
            {
                field: "Password Last Modified",
                key: "passwordLastModified"
            },
            {
                field: "Previous Logon Time",
                key: "previousLogonTime"
            },
            {
                field: "Last Logon Time",
                key: "lastLogonTime"
            }
        ];

        /*
         * Compare old vs new
         */
        for (const fieldConfig of fieldsToCheck) {

            const oldValue =
                oldUser?.[fieldConfig.key];

            const newValue =
                newUser?.[fieldConfig.key];

            /*
             * Only create an audit record when
             * the value actually changed.
             */
            if (
                JSON.stringify(oldValue) !==
                JSON.stringify(newValue)
            ) {

                entries.push({
                    system: "BTP",
                    timestamp: message.time,
                    eventType: "User Management",
                    event: "User Updated",
                    userId: userEmail || userId,
                    userName: userName,
                    userType: "",
                    roleCollection: "",
                    fieldChanged: fieldConfig.field,
                    oldValue: oldValue ?? "-",
                    newValue: newValue ?? "-",
                    performedBy: performedBy,
                    userRole: "",
                    status: status,
                    subaccount: subaccountName
                });
            }
        }


        const oldEmail =
            Array.isArray(oldUser?.emails) &&
                oldUser.emails.length > 0
                ? oldUser.emails.find(
                    email => email?.primary === true
                )?.value ||
                oldUser.emails[0]?.value ||
                ""
                : "";

        const newEmail =
            Array.isArray(newUser?.emails) &&
                newUser.emails.length > 0
                ? newUser.emails.find(
                    email => email?.primary === true
                )?.value ||
                newUser.emails[0]?.value ||
                ""
                : "";

        if (oldEmail !== newEmail) {
            entries.push({
                system: "BTP",
                timestamp: message.time,
                eventType: "User Management",
                event: "User Updated",
                userId: newEmail || userId,
                userName: userName,
                userType: "",
                roleCollection: "",
                fieldChanged: "Email",
                oldValue: oldEmail || "-",
                newValue: newEmail || "-",
                performedBy: performedBy,
                userRole: "",
                status: status,
                subaccount: subaccountName
            });
        }

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