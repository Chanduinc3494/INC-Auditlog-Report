const axios = require("axios");


/**
 * Fetch one page of CF users.
 *
 * @param {Object} connection
 * @param {String} token
 * @param {Array} userGuids
 * @param {Number} page
 * @param {Number} perPage
 */
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
}


/**
 * Fetch all users for the supplied GUIDs.
 *
 * GUIDs are processed in chunks so that the URL
 * does not become unnecessarily large.
 */
async function fetchUsers(
    connection,
    token,
    userGuids
) {

    if (!userGuids || userGuids.length === 0) {
        return [];
    }

    const allUsers = [];

    // Process maximum 500 GUIDs per request.
    const chunkSize = 500;

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
    console.log(allUsers);
    return allUsers;
}


module.exports = {
    fetchUsersPage,
    fetchUsers
};