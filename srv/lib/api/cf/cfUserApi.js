// const axios = require("axios");
// async function fetchUsersPage(
//     connection,
//     token,
//     userGuids,
//     page = 1,
//     perPage = 500
// ) {

//     const params = {
//         page,
//         per_page: perPage
//     };

//     if (userGuids && userGuids.length > 0) {
//         params.guids = userGuids.join(",");
//     }
//     try {
//         const response = await axios.get(
//             `${connection.apiBaseUrl}/v3/users`,
//             {
//                 headers: {
//                     Authorization: `Bearer ${token}`
//                 },
//                 params
//             }
//         );

//         return response.data;
//     } catch (err) {

//         const status =
//             err.response?.status;

//         const data =
//             err.response?.data;

//         let details;

//         if (typeof data === "string") {
//             details = data;
//         } else if (data?.message) {
//             details = data.message;
//         } else if (data?.error_description) {
//             details = data.error_description;
//         } else if (data?.error) {
//             details = data.error;
//         } else {
//             details = err.message;
//         }

//         throw new Error(
//             `Failed to fetch CF users (page ${page})` +
//             `${status ? ` (HTTP ${status})` : ""}: ` +
//             `${details}`
//         );
//     }
// }


// async function fetchUsers(
//     connection,
//     token,
//     userGuids
// ) {

//     if (!userGuids || userGuids.length === 0) {
//         return [];
//     }
//     const allUsers = [];
//     const chunkSize = 500;
//     try {

//         for (
//             let i = 0;
//             i < userGuids.length;
//             i += chunkSize
//         ) {

//             const guidChunk =
//                 userGuids.slice(
//                     i,
//                     i + chunkSize
//                 );

//             let page = 1;
//             let totalPages = 1;

//             do {

//                 const data =
//                     await fetchUsersPage(
//                         connection,
//                         token,
//                         guidChunk,
//                         page,
//                         5000
//                     );

//                 allUsers.push(
//                     ...(data.resources || [])
//                 );

//                 totalPages =
//                     data.pagination?.total_pages || 1;

//                 page++;

//             } while (page <= totalPages);
//         }
       
//         return allUsers;
//     } catch (err) {

//         throw new Error(
//             `Failed to fetch CF users for subaccount ` +
//             `${connection.subaccountId}: ` +
//             `${err.message}`
//         );
//     }
// }



// module.exports = {
//     fetchUsersPage,
//     fetchUsers
// };

const axios = require("axios");


/**
 * Fetch one page of CF users.
 */
async function fetchUsersPage(
    connection,
    token,
    userGuids = null,
    page = 1,
    perPage = 50
) {

    const params = {
        page,
        per_page: perPage
    };

    // If GUIDs are provided, fetch only those users
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


/**
 * ============================================================
 * Fetching User
 * ===========================================================
 * userGuids = [
 *   "guid-1",
 *   "guid-2",
 *   "guid-3"
 * ]
 *
 */
async function fetchUsers(
    connection,
    token,
    userGuids
) {

    if (
        !userGuids ||
        userGuids.length === 0
    ) {
        return [];
    }

    const allUsers = [];

    // Keep the GUID request in manageable chunks
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
                        50
                    );

                allUsers.push(
                    ...(data.resources || [])
                );

                totalPages =
                    data.pagination?.total_pages || 1;

                page++;

            } while (
                page <= totalPages
            );
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


/**
 * ============================================================
 * fetching all the user
 * ============================================================
 * */
async function fetchAllUsers(
    connection,
    token
) {

    const allUsers = [];

    let page = 1;
    let totalPages = 1;

    try {

        do {

            const data =
                await fetchUsersPage(
                    connection,
                    token,
                    null,
                    page,
                    50
                );

            const users =
                data.resources || [];

            allUsers.push(
                ...users
            );

            totalPages =
                data.pagination?.total_pages || 1;

            page++;

        } while (
            page <= totalPages
        );

        return allUsers;

    } catch (err) {

        throw new Error(
            `Failed to fetch all CF users for subaccount ` +
            `${connection.subaccountId}: ` +
            `${err.message}`
        );
    }
}


module.exports = {
    fetchUsers,
    fetchAllUsers
};