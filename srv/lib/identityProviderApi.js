const axios = require("axios");

async function fetchIdentityProviders(baseUrl,token) {

    const identityProviderMap = new Map();
    const failures = [];

    try {

        const response = await axios.get(
            `${baseUrl}/sap/rest/identity-providers`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const providers =
            Array.isArray(response.data)
                ? response.data
                : [];

        for (const provider of providers) {

            const id =
                provider?.id;

            const name =
                provider?.name;

            if (!id) {
                continue;
            }

            identityProviderMap.set(
                id,
                {
                    name: name || id
                }
            );
        }

    } catch (err) {

        const data =
            err.response?.data;

        const errorMessage =
            typeof data === "string"
                ? data
                : data?.message ||
                  data?.error_description ||
                  data?.error ||
                  err.message;

        failures.push({
            api: "IDENTITY_PROVIDER",
            operation: "GET_IDENTITY_PROVIDERS",
            error: errorMessage
        });
    }

    return {
        identityProviderMap,
        failures
    };
}

module.exports = {
    fetchIdentityProviders
};