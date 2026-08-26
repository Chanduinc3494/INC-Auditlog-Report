async function fetchSubaccountsData({
    connections,
    accountsConnection,
    oAuthManager,
    fetchSubaccount,
    failedConnections
}) {


     // Get all subaccount IDs from Audit Log connections
    
    const subaccountIds = [
        ...new Set(
            connections
                .map(connection => connection.subaccountId)
                .filter(Boolean)
        )
    ];

  
    // Fallback map.
    const subaccountMap = new Map();
    for (const subaccountId of subaccountIds) {
        subaccountMap.set(
            subaccountId,
            subaccountId
        );
    }

    
    if (!accountsConnection) {
        return subaccountMap;
    }

    try {

        
        //Get Accounts API token
         
        const accountsToken =
            await oAuthManager.getToken(
                accountsConnection
            );

        
        // Fetch actual subaccount information
         
        const {
            subaccountMap: fetchedMap,
            failures: accountFailures
        } = await fetchSubaccount(
            accountsConnection.apiBaseUrl,
            accountsToken,
            subaccountIds
        );

        /*
         * Replace fallback IDs with
         * actual subaccount names.
         */
        for (
            const [subaccountId, subaccountDetails]
            of fetchedMap
        ) {

            subaccountMap.set(
                subaccountId,
                subaccountDetails.subdomain
            );
        }

       
        failedConnections.push(
            ...(accountFailures || [])
        );

    } catch (err) {

        failedConnections.push({
            api: "ACCOUNTS",
            operation: "OAUTH",
            subaccountId: null,
            error: err.message
        });

        console.warn(
            "Could not fetch subaccount names. Using subaccount IDs instead.",
            err.message
        );
    }

    return subaccountMap;
}


module.exports = {
    fetchSubaccountsData
};