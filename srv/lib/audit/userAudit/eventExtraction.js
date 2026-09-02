const {
    truncate
} = require("./auditUtils");

/*Extract event name from audit message.*/
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
        const match =
            message.match(regex);

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

function determineEvent(userInfo) {
    const message =
        String(
            userInfo.auditMessage || ""
        ).toLowerCase();

    const innerData =
        userInfo.innerData || {};

    const outerMessage =
        userInfo.outerMessage || {};

    const attributes =
        innerData.attributes ||
        outerMessage.attributes ||
        [];

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
            newValue:
                userInfo.userId ||
                "Created",
            status: "Success"
        };
    }

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
            oldValue:
                userInfo.userId ||
                "Active",
            newValue: "Deleted",
            status: "Success"
        };
    }

    if (
        message.includes("user updated") ||
        message.includes("update user") ||
        message.includes("updateuser") ||
        message.includes("userupdate")
    ) {
        return {
            fieldChanged: "User Account",
            oldValue: "Updated",
            newValue:
                userInfo.userId ||
                "Modified",
            status: "Success"
        };
    }

    if (
        message.includes("rolecollection") ||
        message.includes("role_collection") ||
        message.includes("role collection")
    ) {
        const roles =
            userInfo.roleCollections.length > 0
                ? userInfo.roleCollections.join(", ")
                : "Role Collection";

        if (
            message.includes("assign") ||
            message.includes("add")
        ) {
            return {
                fieldChanged:
                    "Role Collection",
                oldValue: "-",
                newValue:
                    truncate(
                        roles,
                        255
                    ),
                status: "Success"
            };
        }

        if (
            message.includes("unassign") ||
            message.includes("remove") ||
            message.includes("delete")
        ) {
            return {
                fieldChanged:
                    "Role Collection",
                oldValue:
                    truncate(
                        roles,
                        255
                    ),
                newValue: "Removed",
                status: "Success"
            };
        }
    }

    if (
        Array.isArray(attributes) &&
        attributes.length > 0
    ) {
        const fieldNames = [];
        const oldVals = [];
        const newVals = [];

        for (const attr of attributes) {
            if (!attr) {
                continue;
            }

            const name =
                attr.name ||
                attr.attribute ||
                attr.key;

            if (!name) {
                continue;
            }

            const oldVal =
                attr.old !== undefined &&
                attr.old !== null
                    ? String(attr.old)
                    : "-";

            const newVal =
                attr.new !== undefined &&
                attr.new !== null
                    ? String(attr.new)
                    : "-";

            fieldNames.push(name);
            oldVals.push(oldVal);
            newVals.push(newVal);
        }

        if (fieldNames.length > 0) {
            return {
                fieldChanged:
                    truncate(
                        fieldNames.join(", "),
                        100
                    ),

                oldValue:
                    truncate(
                        oldVals.join(", "),
                        255
                    ),

                newValue:
                    truncate(
                        newVals.join(", "),
                        255
                    ),

                status: "Success"
            };
        }
    }

    return null;
}

module.exports = {
    extractEventName,
    determineEvent
};