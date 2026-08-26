async function fetchInstanceMapForSubaccount(
    BTPConnection,
    subaccountId,
    failedConnections,
    fetchServiceInstances,
    buildInstanceMap,
    oAuthManager
) {
    const instanceMap = new Map();

    try {
        const serviceManagerConnections =
            await SELECT.from(BTPConnection).where({
                serviceType: "SERVICE_MANAGER",
                active: true,
                subaccountId
            });

        if (
            !serviceManagerConnections ||
            serviceManagerConnections.length === 0
        ) {
            return instanceMap;
        }

        for (const smConnection of serviceManagerConnections) {
            try {
                const token =
                    await oAuthManager.getToken(
                        smConnection
                    );

                if (!token) {
                    throw new Error(
                        "Service Manager OAuth token was not returned."
                    );
                }

                const instances =
                    await fetchServiceInstances(
                        smConnection.apiBaseUrl,
                        token
                    );

                const connectionInstanceMap =
                    buildInstanceMap(instances);

                for (
                    const [
                        instanceId,
                        instanceName
                    ] of connectionInstanceMap
                ) {
                    instanceMap.set(
                        instanceId,
                        instanceName
                    );
                }

            } catch (err) {
                failedConnections.push({
                    api: "SERVICE_MANAGER",
                    operation: "GET_SERVICE_INSTANCES",
                    subaccountId,
                    connectionId: smConnection.ID,
                    error: err.message
                });
            }
        }

    } catch (err) {
        failedConnections.push({
            api: "SERVICE_MANAGER",
            operation: "GET_CONNECTIONS",
            subaccountId,
            error: err.message
        });
    }

    return instanceMap;
}

module.exports={
    fetchInstanceMapForSubaccount
}