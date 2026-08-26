async function fetchSubaccountMapConfig({
    connections,
    accountsConnection,
    oAuthManager,
    fetchSubaccount,
    failedConnections
}) {

    const subaccountIds = [
        ...new Set(
            connections
                .map(connection => connection.subaccountId)
                .filter(Boolean)
        )
    ];

    const subaccountMap = new Map();

    /*
     * Fallback
     * subaccountId -> {
     *     subdomain: subaccountId,
     *     region: null
     * }
     */
    for (const subaccountId of subaccountIds) {

        subaccountMap.set(
            subaccountId,
            {
                subdomain: subaccountId,
                region: null
            }
        );
    }

    if (!accountsConnection) {
        return subaccountMap;
    }

    try {

        const accountsToken =
            await oAuthManager.getToken(
                accountsConnection
            );

        const {
            subaccountMap: fetchedMap,
            failures
        } = await fetchSubaccount(
            accountsConnection.apiBaseUrl,
            accountsToken,
            subaccountIds
        );

        for (
            const [
                subaccountId,
                subaccountDetails
            ] of fetchedMap
        ) {

            subaccountMap.set(
                subaccountId,
                {
                    subdomain:
                        subaccountDetails.subdomain ||
                        subaccountId,

                    region:
                        subaccountDetails.region || null
                }
            );
        }

        failedConnections.push(
            ...(failures || [])
        );

    } catch (err) {

        failedConnections.push({
            api: "ACCOUNTS",
            operation: "GET_SUBACCOUNTS",
            subaccountId:
                accountsConnection.subaccountId || null,
            error: err.message
        });
    }

    return subaccountMap;
}
module.exports={
    fetchSubaccountMapConfig
}