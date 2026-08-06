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
                const records = data.recordsSynced || 0;
                const message = data.message || "-";

                MessageBox.information(

                    "Status : " + status +
                    "\n\nLast Sync : " + lastSync +
                    "\n\nRecords Synced : " + records +
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