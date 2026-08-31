const {fetchUserMapUserAudit} = require("./userDataMap");
const {fetchUserConfigLogs,fetchUserAuditLogs} = require('../../userAuditfns');
const {normalizeUserAuditEntries} = require("./normalizedUserData");
const {getErrorMessage} = require("../../processing/errorMessage");
// multiple connections
async function processUserAuditConnections({
    connections,
    subaccountMap,
    timeFrom,
    timeTo,
    failedConnections,
    BTPConnection,oAuthManager
}) {
    const entries = [];

    for (const connection of connections) {

        const connectionEntries =
            await processUserAuditConnection({
                connection,
                subaccountMap,
                timeFrom,
                timeTo,
                failedConnections,
                BTPConnection,oAuthManager
            });

        entries.push(
            ...(connectionEntries || [])
        );
    }

    return entries;
}

// process single connections
async function processUserAuditConnection({
    connection,
    subaccountMap,
    timeFrom,
    timeTo,
    failedConnections,
    BTPConnection,
    oAuthManager
}) {
    const cleanSubaccountId =
        connection.subaccountId?.trim();

    const subaccountName =
        subaccountMap.get(cleanSubaccountId) ||
        cleanSubaccountId;

    // User mapping
    const userMap = await fetchUserMapUserAudit({
        BTPConnection,
        oAuthManager,
        connection,
        failedConnections
    });

    try {
        const token =
            await oAuthManager.getToken(
                connection
            );

        if (!token) {
            throw new Error(
                "Audit Log OAuth token was not returned."
            );
        }

        const connectionEntries = [];

        const configEntries =
            await fetchUserConfigLogs(
                connection,
                token,
                timeFrom,
                timeTo,
                userMap
            );

        connectionEntries.push(
            ...(configEntries || [])
        );

        const securityEntries =
            await fetchUserAuditLogs(
                connection,
                token,
                timeFrom,
                timeTo
            );

        connectionEntries.push(
            ...(securityEntries || [])
        );

        return normalizeUserAuditEntries(
            connectionEntries,
            subaccountName
        );

    } catch (connectionError) {

        failedConnections.push({
            api: "AUDIT_LOG",
            operation: "GET_USER_AUDIT_LOGS",
            subaccountId: cleanSubaccountId,
            error: getErrorMessage(
                connectionError
            )
        });

        return [];
    }
}

module.exports={
    processUserAuditConnections
}