async function fetchUserMapForSubaccount({
    BTPConnection,
    subaccountId,
    cfAuth,
    fetchAllUsers,
    failedConnections,
    SELECT
}) {

    const userMap = new Map();

    try {

        const cfConnection =
            await SELECT.one
                .from(BTPConnection)
                .where({
                    serviceType: "CLOUD_FOUNDRY",
                    active: true,
                    subaccountId
                });

        if (!cfConnection) {
            return userMap;
        }

        const cfToken =
            await cfAuth.getToken(
                cfConnection
            );

        if (!cfToken) {
            return userMap;
        }

        const users =
            await fetchAllUsers(
                cfConnection,
                cfToken
            );

        for (const user of users || []) {

            if (!user?.guid) {
                continue;
            }

            userMap.set(
                user.guid,
                user.username ||
                user.presentation_name ||
                user.guid
            );
        }

    } catch (err) {

        failedConnections.push({
            api: "CLOUD_FOUNDRY",
            operation: "GET_USERS",
            subaccountId,
            error: err.message
        });
    }

    return userMap;
}

module.exports={
    fetchUserMapForSubaccount
}