sap.ui.define([
    "sap/m/MessageBox"
], function (MessageBox) {

    "use strict";

    return {

        onLastSyncPress: async function () {

            try {

                const response = await fetch(
                    "/odata/v4/audit-logging-and-reporting/getServiceAuditStatus()"
                );

                if (!response.ok) {
                    throw new Error("Unable to fetch synchronization status.");
                }

                const data = await response.json();

                const status = data.lastSyncStatus || "-";
                const lastSync = data.lastSyncAt || "-";
              
                const message = data.message || "-";
                let formattedLastSync = "-";

                if (data.lastSyncAt) {

                    const date = new Date(data.lastSyncAt);

                    formattedLastSync =
                        new Intl.DateTimeFormat(
                            undefined,
                            {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false
                            }
                        ).format(date);
                }

                MessageBox.information(

                    "Status : " + status +
                    "\n\nLast Sync : " + formattedLastSync +
                    "\n\nMessage : " + message,

                    {
                        title: "Service Audit Synchronization"
                    }

                );

            } catch (err) {

                MessageBox.error(err.message);

            }

        }

    };

});