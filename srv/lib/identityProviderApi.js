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
        const count = 100;
        let startIndex = 1;
        let totalResults = Infinity;

        while (startIndex <= totalResults) {
            const response = await axios.get(
                `${baseUrl}/Users`,
                {
                    params: {
                        startIndex,
                        count
                    },
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = response.data;

            const users =
                Array.isArray(data?.resources)
                    ? data.resources
                    : [];

            totalResults =
                Number(data?.totalResults) || 0;

            for (const user of users) {
                const id = user?.id;

                if (!id) {
                    continue;
                }

                const userName =
                    user?.userName ||
                    user?.name?.givenName ||
                    "";

                const email =
                    Array.isArray(user?.emails) &&
                    user.emails.length > 0
                        ? user.emails.find(
                            email => email?.primary === true
                        )?.value ||
                          user.emails[0]?.value ||
                          ""
                        : "";

                userMapping.set(id, {
                    userName,
                    email
                });
            }

            // Prevent infinite loops if the API returns
            // an unexpected/empty response.
            if (users.length === 0) {
                break;
            }

            startIndex += users.length;
        }

    } catch (err) {
        const data = err.response?.data;

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