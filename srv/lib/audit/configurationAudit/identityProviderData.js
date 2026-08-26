async function fetchIdentityProviderMapForSubaccount({
    BTPConnection,
    subaccountId,
    oAuthManager,
    fetchIdentityProviders,
    failedConnections,
    SELECT
}) {

    const identityProviderMap =
        new Map();

    try {

        const identityProviderConnection =
            await SELECT.one
                .from(BTPConnection)
                .where({
                    serviceType: "XSUAA",
                    active: true,
                    subaccountId
                });

        /*
         * XSUAA connection is optional.
         */
        if (!identityProviderConnection) {
            return identityProviderMap;
        }

        const token =
            await oAuthManager.getToken(
                identityProviderConnection
            );

        if (!token) {
            return identityProviderMap;
        }

        const {
            identityProviderMap:
                fetchedIdentityProviderMap,
            failures
        } = await fetchIdentityProviders(
            identityProviderConnection.apiBaseUrl,
            token
        );

        /*
         * Copy fetched map into our map.
         */
        for (
            const [
                id,
                identityProvider
            ] of fetchedIdentityProviderMap
        ) {

            identityProviderMap.set(
                id,
                identityProvider
            );
        }

        failedConnections.push(
            ...(failures || [])
        );

    } catch (err) {

        failedConnections.push({
            api: "IDENTITY_PROVIDER",
            operation: "GET_IDENTITY_PROVIDERS",
            subaccountId,
            error: err.message
        });
    }

    return identityProviderMap;
}
module.exports={
    fetchIdentityProviderMapForSubaccount
}