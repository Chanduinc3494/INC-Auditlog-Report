const axios = require("axios");

async function getToken(connection) {
    try {
        const tokenUrl =
            connection.tokenUrl.endsWith("/oauth/token")
                ? connection.tokenUrl
                : `${connection.tokenUrl.replace(/\/$/, "")}/oauth/token`;
        const response = await axios.post(
            tokenUrl,
            new URLSearchParams({
                grant_type: "password",
                username: connection.username,
                password: connection.password,
                response_type: "token"
            }).toString(),
            {
                auth: {
                    username: "cf",
                    password: ""
                },
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                }
            }
        );

        return response.data.access_token;
    }catch (err) {
        const status = err.response?.status;
        const data = err.response?.data;

        if (status === 401) {
            throw new Error(
                `Authentication failed for subaccount ` +
                `${connection.subaccountId}. ` +
                `Please check the username and password.`
            );
        }

        if (status === 403) {
            throw new Error(
                `Authorization failed for subaccount ` +
                `${connection.subaccountId}.`
            );
        }

        throw new Error(
            `Unable to obtain OAuth token for subaccount ` +
            `${connection.subaccountId}. ` +
            `${data?.error_description || data?.error || err.message}`
        );
    }
}

module.exports = {
    getToken
};