const axios = require("axios");

async function fetchServiceInstances(baseUrl, token) {

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
}
module.exports = {
    fetchServiceInstances,
    fetchServiceOfferings,
    fetchServicePlans
};