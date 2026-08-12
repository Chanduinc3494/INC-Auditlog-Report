const axios = require("axios");
async function fetchUsersPage(
    connection,
    token,
    userGuids,
    page = 1,
    perPage = 5000
) {

    const params = {
        page,
        per_page: perPage
    };

    if (userGuids && userGuids.length > 0) {
        params.guids = userGuids.join(",");
    }
    try {
        const response = await axios.get(
            `${connection.apiBaseUrl}/v3/users`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                params
            }
        );

        return response.data;
    } catch (err) {

        const status =
            err.response?.status;

        const data =
            err.response?.data;

        let details;

        if (typeof data === "string") {
            details = data;
        } else if (data?.message) {
            details = data.message;
        } else if (data?.error_description) {
            details = data.error_description;
        } else if (data?.error) {
            details = data.error;
        } else {
            details = err.message;
        }

        throw new Error(
            `Failed to fetch CF users (page ${page})` +
            `${status ? ` (HTTP ${status})` : ""}: ` +
            `${details}`
        );
    }
}


async function fetchUsers(
    connection,
    token,
    userGuids
) {

    if (!userGuids || userGuids.length === 0) {
        return [];
    }
    const allUsers = [];
    const chunkSize = 500;
    try {

        for (
            let i = 0;
            i < userGuids.length;
            i += chunkSize
        ) {

            const guidChunk =
                userGuids.slice(
                    i,
                    i + chunkSize
                );

            let page = 1;
            let totalPages = 1;

            do {

                const data =
                    await fetchUsersPage(
                        connection,
                        token,
                        guidChunk,
                        page,
                        5000
                    );

                allUsers.push(
                    ...(data.resources || [])
                );

                totalPages =
                    data.pagination?.total_pages || 1;

                page++;

            } while (page <= totalPages);
        }

        return allUsers;
    } catch (err) {

        throw new Error(
            `Failed to fetch CF users for subaccount ` +
            `${connection.subaccountId}: ` +
            `${err.message}`
        );
    }
}


module.exports = {
    fetchUsersPage,
    fetchUsers
};