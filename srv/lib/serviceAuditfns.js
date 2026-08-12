const axios = require("axios");

async function fetchServiceInstances(baseUrl, token) {
    try {
        const response = await axios.get(

            baseUrl + "/v1/service_instances",

            {

                headers: {

                    Authorization:
                        `Bearer ${token}`

                }

            }

        );

        return response.data;
    } catch (err) {

        throw new Error(
            `Failed to fetch service instances: ` +
            `${err.response?.data?.message ||
            err.response?.data?.error ||
            err.message}`
        );
    }

}

// async function fetchServicePlans(baseUrl, token, environment) {

//     const response = await axios.get(

//         `${baseUrl}/v1/service_plans`,

//         {
//             headers: {
//                 Authorization: `Bearer ${token}`
//             },
//             params: {
//                 environment,
//                 max_items: 100
//             }
//         }

//     );

//     return response.data;
// }

async function fetchServicePlans(baseUrl, token, environment) {

    const allPlans = [];
    let nextToken = null;
    try {

        do {

            const response = await axios.get(
                `${baseUrl}/v1/service_plans`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    params: {
                        environment,
                        max_items: 100,
                        ...(nextToken ? { token: nextToken } : {})
                    }
                }
            );

            allPlans.push(...response.data.items);

            nextToken = response.data.token;

        } while (nextToken);

        return allPlans;
    } catch (err) {

        throw new Error(
            `Failed to fetch ${environment} service plans: ` +
            `${err.response?.data?.message ||
            err.response?.data?.error ||
            err.message}`
        );
    }
}
// async function fetchServiceOfferings(baseUrl, token,environment) {

//     const response = await axios.get(

//         baseUrl + "/v1/service_offerings",

//         {

//             headers: {

//                 Authorization:
//                 `Bearer ${token}`

//             }

//         }

//     );

//     return response.data;

// }

async function fetchServiceOfferings(baseUrl, token, environment) {

    const allOfferings = [];
    let nextToken = null;
    try {
        do {

            const response = await axios.get(
                `${baseUrl}/v1/service_offerings`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    params: {
                        environment,
                        max_items: 100,
                        ...(nextToken ? { token: nextToken } : {})
                    }
                }
            );

            allOfferings.push(...response.data.items);

            nextToken = response.data.token;

        } while (nextToken);

        return allOfferings;
    } catch (err) {

        throw new Error(
            `Failed to fetch ${environment} service Offerings: ` +
            `${err.response?.data?.message ||
            err.response?.data?.error ||
            err.message}`
        );
    }
}
module.exports = {
    fetchServiceInstances,
    fetchServiceOfferings,
    fetchServicePlans
};