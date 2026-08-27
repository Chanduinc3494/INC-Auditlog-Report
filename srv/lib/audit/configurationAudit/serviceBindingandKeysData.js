function mapServiceBindingAndKeyAuditLogs(
    logs,
    {
        connection,
        instanceMap,
        userMap
    }
) {
    const entries = [];

    for (const log of logs || []) {

        const type =
            String(
                log?.type || ""
            ).toLowerCase();

        const eventType =
            type.endsWith(".create")
                ? "CREATE"
                : type.endsWith(".delete")
                    ? "DELETE"
                    : null;

        if (!eventType) {
            continue;
        }

        const isBinding =
            type.includes(
                "service_binding"
            );

        const isServiceKey =
            type.includes(
                "service_key"
            );

        if (
            !isBinding &&
            !isServiceKey
        ) {
            continue;
        }

        
         // USER
         

        const rawUserId =
            log?.actor?.guid ||
            log?.actor?.name ||
            "";

        const userId =
            userMap?.get(rawUserId) ||
            rawUserId;


       
         // SERVICE INSTANCE
         

        const serviceInstanceGuid =
            log?.data?.request
                ?.relationships
                ?.service_instance
                ?.data
                ?.guid ||
            log?.data?.request
                ?.service_instance_guid ||
            null;

       
        const serviceInstance =
            serviceInstanceGuid
                ? instanceMap?.get(
                    serviceInstanceGuid
                )
                : null;

        const serviceInstanceName =
            typeof serviceInstance === "string"
                ? serviceInstance
                : serviceInstance?.name ||
                  serviceInstanceGuid ||
                  "";


        /*
         * ---------------------------------------------------------
         * OBJECT NAME
         * ---------------------------------------------------------
         */

        let objectName = "";

        if (isServiceKey) {

            objectName =
                log?.target?.name ||
                "";

        } else if (isBinding) {

            objectName =
                log?.data?.request
                    ?.relationships
                    ?.app
                    ?.data
                    ?.guid ||

                log?.data?.request
                    ?.app_guid ||

                "";
        }


        /*
         * ---------------------------------------------------------
         * ACTION
         * ---------------------------------------------------------
         */

        let actionPerformed;

        if (isBinding) {

            actionPerformed =
                eventType === "CREATE"
                    ? `Service binding created`
                    : `Service binding deleted`;

        } else {

            actionPerformed =
                eventType === "CREATE"
                    ? `Service key created`
                    : `Service key deleted`;
        }


        /*
         * Add useful service-instance context.
         */
        if (serviceInstanceName) {

            actionPerformed +=
                `: ${serviceInstanceName}`;
        }

        /*
         * Add key name when available.
         */
        if (
            isServiceKey &&
            objectName
        ) {

            actionPerformed +=
                ` (${objectName})`;
        }


        entries.push({

            system: "BTP",

            userId,

            userRole: "",

            btpService:
                isBinding
                    ? "Service Binding"
                    : "Service Key",

            eventType,

            actionPerformed,

            subAccount:
                connection?.subaccountName ||
                connection?.subaccountId ||
                "",

            region:
                connection?.region ||
                "",

            timestamp:
                log?.created_at ||
                null
        });
    }

    console.log("Enteries",entries);
    return entries;
}

module.exports={
    mapServiceBindingAndKeyAuditLogs
}