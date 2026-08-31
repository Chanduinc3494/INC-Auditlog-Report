const {fetchIdentityUsers} = require("../../api/identity/identityProviderApi");
const {getErrorMessage} = require("../../processing/errorMessage");
async function fetchUserMapUserAudit({
    BTPConnection,
    oAuthManager,
    connection,
    failedConnections
}) {
    let userMap = new Map();

    try {
        // fetching XSUAA credentials
        const userConnection = await SELECT.one
            .from(BTPConnection)
            .where({
                subaccountId:
                    connection.subaccountId?.trim(),
                serviceType: "XSUAA",
                active: true
            });

        if (!userConnection) {
            throw new Error(
                `XSUAA connection not found for subaccount ${connection.subaccountId}`
            );
        }

        // Generating Oauth token
        const userToken =
            await oAuthManager.getToken(
                userConnection
            );

        if (!userToken) {
            throw new Error(
                "XSUAA OAuth token was not returned."
            );
        }


        const {
            userMapping,
            failures: identityFailures
        } = await fetchIdentityUsers(
            userConnection.apiBaseUrl,
            userToken
        );

        userMap = userMapping;

        failedConnections.push(
            ...(identityFailures || [])
        );

    } catch (err) {
        failedConnections.push({
            api: "IDENTITY_USERS",
            operation: "GET_IDENTITY_USERS",
            subaccountId:
                connection.subaccountId,
            error: getErrorMessage(err)
        });
    }

    return userMap;
}

module.exports={
    fetchUserMapUserAudit
}