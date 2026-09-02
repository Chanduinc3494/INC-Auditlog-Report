const {
    truncate
} = require("./auditUtils");

const {
    extractUserInformation
} = require("./userExtraction");

const {
    determineEvent,
    extractEventName
} = require("./eventExtraction");

function mapAuditLog(
    log,
    connection,
    subaccountName,
    instanceMap
) {
    const userInfo =
        extractUserInformation(
            log,
            instanceMap
        );

    const eventInfo =
        determineEvent(
            userInfo
        );

    if (!eventInfo) {
        return null;
    }

    const eventName =
        extractEventName(
            userInfo.auditMessage
        );

    const roleCollectionStr =
        userInfo.roleCollections.length > 0
            ? userInfo.roleCollections.join(", ")
            : null;

    const region =
        truncate(
            (connection &&
                connection.region) ||
            (log &&
                log.region) ||
            null,
            50
        );

    return {
        system: "SAP BTP",

        userId:
            userInfo.userId,

        userName:
            userInfo.userName,

        userType:
            userInfo.origin ||
            "Standard",

        roleCollection:
            truncate(
                roleCollectionStr,
                1000
            ),

        eventType:
            truncate(
                userInfo.category,
                200
            ),

        event:
            eventName ||
            "Audit Event",

        fieldChanged:
            eventInfo.fieldChanged,

        oldValue:
            eventInfo.oldValue,

        newValue:
            eventInfo.newValue,

        performedBy:
            userInfo.userId,

        userRole:
            truncate(
                roleCollectionStr,
                1000
            ),

        subaccount:
            subaccountName ||
            userInfo.subaccount,

        region,

        timestamp:
            log && log.time
                ? new Date(log.time)
                : null,

        status:
            eventInfo.status
    };
}

module.exports = {
    mapAuditLog
};