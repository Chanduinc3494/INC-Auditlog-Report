async function fetchInstanceUsers(
    connection,
    instances,
    failedConnections,
    cfAuth,
    fetchUsers,
    BTPConnection,
    SELECT
) {

    const userGuids = [
        ...new Set(
            (instances?.items || [])
                .map(instance => instance.created_by)
                .filter(Boolean)
        )
    ];

    const userMap = new Map();

    if (userGuids.length === 0) {
        return userMap;
    }

    const cfConnection = await SELECT
        .one
        .from(BTPConnection)
        .where({
            subaccountId: connection.subaccountId,
            serviceType: "CLOUD_FOUNDRY",
            active: true
        });

    if (!cfConnection) {
        return userMap;
    }

    try {

        const cfToken = await cfAuth.getToken(cfConnection);

        const users = await fetchUsers(
            cfConnection,
            cfToken,
            userGuids
        );

        for (const user of users) {
            userMap.set(user.guid, user);
        }

    } catch (err) {

        failedConnections.push({
            api: "CLOUD_FOUNDRY",
            operation: "GET_USERS",
            subaccountId: connection.subaccountId,
            error: err.message
        });
    }

    return userMap;
}


module.exports = {
    fetchInstanceUsers
};