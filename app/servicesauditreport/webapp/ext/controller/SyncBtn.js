// sap.ui.define([
//     "sap/m/MessageToast",
//     "sap/m/MessageBox"
// ], function (MessageToast, MessageBox) {
//     "use strict";

//     return {

//         SyncServiceLogs: async function (oContext, aSelectedContexts) {

//             try {

//                 // --------------------------------------------------
//                 // 1. Call CAP action
//                 // --------------------------------------------------

//                 const response = await fetch(
//                     "/odata/v4/audit-logging-and-reporting/syncServiceLogs",
//                     {
//                         method: "POST",
//                         headers: {
//                             "Content-Type": "application/json"
//                         },
//                         body: JSON.stringify({})
//                     }
//                 );

//                 if (!response.ok) {
//                     const errorText = await response.text();
//                     throw new Error(
//                         errorText || "Synchronization failed."
//                     );
//                 }

//                 // --------------------------------------------------
//                 // 2. Read response
//                 // --------------------------------------------------

//                 const result = await response.json();

//                 MessageToast.show(
//                     result.value ||
//                     "Synchronization completed successfully."
//                 );

//                 // --------------------------------------------------
//                 // 3. Refresh Fiori Elements List Report
//                 // --------------------------------------------------

//                 const oPage = sap.ui.getCore().byId(
//                     "servicesauditreport::ServiceAuditReportsList"
//                 );

//                 if (!oPage) {
//                     console.error(
//                         "Service Audit List Report page not found."
//                     );
//                     return;
//                 }

//                 const oModel = oPage.getModel();

//                 if (oModel) {
//                     oModel.refresh("$auto");
//                 }

//             } catch (err) {

//                 console.error(
//                     "Synchronization error:",
//                     err
//                 );

//                 MessageBox.error(
//                     err.message ||
//                     "Synchronization failed."
//                 );
//             }
//         }
//     };
// });
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
    "use strict";

    return {

        SyncServiceLogs: async function (oContext, aSelectedContexts) {

            try {

                // --------------------------------------------------
                // 1. Get the List Report page
                // --------------------------------------------------

                const oPage = sap.ui.getCore().byId(
                    "servicesauditreport::ServiceAuditReportsList"
                );

                if (!oPage) {
                    throw new Error(
                        "Service Audit List Report page not found."
                    );
                }

                // --------------------------------------------------
                // 2. Get OData V4 model
                // --------------------------------------------------

                const oModel = oPage.getModel();

                if (!oModel) {
                    throw new Error(
                        "OData V4 model not found."
                    );
                }

                // --------------------------------------------------
                // 3. Call unbound CAP action
                // --------------------------------------------------

                const oOperation = oModel.bindContext(
                    "/syncServiceLogs(...)"
                );

                await oOperation.execute();

                // --------------------------------------------------
                // 4. Read response
                // --------------------------------------------------

                const result =
                    oOperation.getBoundContext().getObject();

                // --------------------------------------------------
                // 5. Show success message
                // --------------------------------------------------

                MessageToast.show(
                    result?.value ||
                    "Service synchronization completed successfully."
                );

                // --------------------------------------------------
                // 6. Refresh List Report
                // --------------------------------------------------

                oModel.refresh("$auto");

            } catch (err) {

                MessageBox.error(
                    err.message ||
                    "Synchronization failed."
                );

            }
        }
    };
});