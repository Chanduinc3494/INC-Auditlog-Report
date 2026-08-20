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


async function fetchIdentityUsers(baseUrl, token) {

    const userMapping = new Map();
    const failures = [];

    try {

        const response = await axios.get(
            `${baseUrl}/Users`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const users =
            Array.isArray(response.data?.resources)
                ? response.data.resources
                : [];

        for (const user of users) {

            const id =
                user?.id;

            if (!id) {
                continue;
            }

            const userName =
                user?.name.givenName || user.userName;

            const email =user.emails[0].value;

            userMapping.set(
                id,
                {
                    userName,
                    email
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
            api: "IDENTITY_USERS",
            operation: "GET_IDENTITY_USERS",
            error: errorMessage
        });
    }

    return {
        userMapping,
        failures
    };
}

module.exports = {
    fetchIdentityProviders,
    fetchIdentityUsers
};