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
    "sap/m/MessageBox",
     "sap/m/BusyDialog"
], function (MessageToast, MessageBox,BusyDialog) {
    "use strict";

    return {

        SyncServiceLogs: async function (oContext, aSelectedContexts) {
            const oBusyDialog = new BusyDialog({
                title: "Loading",
                text: "Fetching data..."
            });
            try {
                  oBusyDialog.open();
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
                 if (
                    result?.failures &&
                    result.failures.length > 0
                ) {

                    console.error(
                        "Service synchronization failures:",
                        result.failures
                    );

                    result.failures.forEach(function (failure) {

                        console.error(
                            `[${failure.api || "UNKNOWN API"}] ` +
                            `[${failure.operation || "UNKNOWN OPERATION"}] ` +
                            `${
                                failure.environment
                                    ? `[${failure.environment}] `
                                    : ""
                            }` +
                            `Subaccount: ${
                                failure.subaccountId || "N/A"
                            } ` +
                            `Error: ${
                                failure.error || "Unknown error"
                            }`
                        );

                    });
                }
                if (
                    result?.status === "PARTIAL_SUCCESS"
                ) {

                    MessageBox.warning(
                        result?.message ||
                        "Service synchronization completed with some failures.",
                        {
                            title:
                                "Service Synchronization Completed with Warnings"
                        }
                    );

                } else {

                    MessageToast.show(
                        result?.message ||
                        "Service synchronization completed successfully."
                    );
                }
                

                // --------------------------------------------------
                // 6. Refresh List Report
                // --------------------------------------------------

                oModel.refresh("$auto");

            } catch (err) {

                MessageBox.error(
                    err.message ||
                    "Synchronization failed."
                );

            }finally {

                // Always close BusyDialog
                oBusyDialog.close();

                // Destroy it after use
                oBusyDialog.destroy();
            }
        }
    };
});