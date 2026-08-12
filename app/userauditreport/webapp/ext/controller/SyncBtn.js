sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function(MessageToast,MessageBox) {
    'use strict';

    return {
        /**
         * Generated event handler.
         *
         * @param oContext the context of the page on which the event was fired. `undefined` for list report page.
         * @param aSelectedContexts the selected contexts of the table rows.
         */
        SyncBtnFunction: async function(oContext, aSelectedContexts) {
              try {

                // --------------------------------------------------
                // 1. Get the List Report page
                // --------------------------------------------------

                const oPage = sap.ui.getCore().byId(
                      "userauditreport::UserAuditReportsList"
                );

                if (!oPage) {
                    throw new Error(
                        "User Audit Report page not found."
                    );
                }

                // --------------------------------------------------
                // 2. Get the OData V4 model
                // --------------------------------------------------

                const oModel = oPage.getModel();

                if (!oModel) {
                    throw new Error(
                        "OData V4 model not found."
                    );
                }
                // --------------------------------------------------
                // 3. Create operation binding for unbound action
                // --------------------------------------------------

                const oOperation = oModel.bindContext(
                    "/syncUserAuditLogs(...)"
                );

                // --------------------------------------------------
                // 4. Execute CAP action
                // --------------------------------------------------

                await oOperation.execute();

                // --------------------------------------------------
                // 5. Read action response
                // --------------------------------------------------

                const oResult =
                    oOperation.getBoundContext().getObject();

                MessageToast.show(
                    oResult?.value ||
                    "User Logs synchronization completed successfully."
                );

                // --------------------------------------------------
                // 6. Refresh List Report
                // --------------------------------------------------

                oModel.refresh("$auto");

            } catch (err) {

                console.error(
                    "syncUserAuditLogs failed:",
                    err
                );

                MessageBox.error(
                    err.message ||
                    "User Audit synchronization failed."
                );
            }
        }
    };
});
