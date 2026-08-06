sap.ui.define([
     "sap/m/MessageToast",
    "sap/m/MessageBox"
], function(MessageToast) {
    'use strict';

    return {
        /**
         * Generated event handler.
         *
         * @param oContext the context of the page on which the event was fired. `undefined` for list report page.
         * @param aSelectedContexts the selected contexts of the table rows.
         */
        SyncServiceLogs: async function(oContext, aSelectedContexts) {
            try {

                const response = await fetch(
                    "/odata/v4/audit-logging-and-reporting/syncServiceLogs",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({})
                    }
                );

                if (!response.ok) {
                    throw new Error("Synchronization failed.");
                }

                const result = await response.json();

                MessageToast.show(result.value);

            } catch (err) {

                MessageBox.error(err.message);

            }

        
        }
    };
});
