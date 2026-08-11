const axios = require("axios");

async function getToken(connection) {
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
                username: connection.clientId || "cf",
                password: connection.clientSecret || ""
            },
            headers: {
                "Content-Type":
                    "application/x-www-form-urlencoded"
            }
        }
    );

    return response.data.access_token;
}

module.exports = {
    getToken
};