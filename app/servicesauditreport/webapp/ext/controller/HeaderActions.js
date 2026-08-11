// sap.ui.define([
//     "sap/m/MessageBox"
// ], function (MessageBox) {

//     "use strict";

//     return {

//         onLastSyncPress: async function () {

//             try {

//                 const response = await fetch(
//                     "/odata/v4/audit-logging-and-reporting/getServiceAuditStatus()"
//                 );

//                 if (!response.ok) {
//                     throw new Error("Unable to fetch synchronization status.");
//                 }

//                 const data = await response.json();

//                 const status = data.lastSyncStatus || "-";
//                 const lastSync = data.lastSyncAt || "-";
              
//                 const message = data.message || "-";
//                 let formattedLastSync = "-";

//                 if (data.lastSyncAt) {

//                     const date = new Date(data.lastSyncAt);

//                     formattedLastSync =
//                         new Intl.DateTimeFormat(
//                             undefined,
//                             {
//                                 day: "2-digit",
//                                 month: "short",
//                                 year: "numeric",
//                                 hour: "2-digit",
//                                 minute: "2-digit",
//                                 second: "2-digit",
//                                 hour12: false
//                             }
//                         ).format(date);
//                 }

//                 MessageBox.information(

//                     "Status : " + status +
//                     "\n\nLast Sync : " + formattedLastSync +
//                     "\n\nMessage : " + message,

//                     {
//                         title: "Service Audit Synchronization"
//                     }

//                 );

//             } catch (err) {

//                 MessageBox.error(err.message);

//             }

//         }

//     };

// });

sap.ui.define([
    "sap/m/MessageBox"
], function (MessageBox) {
    "use strict";

    return {

        onLastSyncPress: async function () {

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
                // 3. Call unbound OData V4 function
                // --------------------------------------------------

                const oOperation = oModel.bindContext(
                    "/getServiceAuditStatus(...)"
                );

                await oOperation.execute();

                // --------------------------------------------------
                // 4. Read function result
                // --------------------------------------------------

                const data =
                    oOperation.getBoundContext().getObject();

                // --------------------------------------------------
                // 5. Extract status information
                // --------------------------------------------------

                const status =
                    data?.lastSyncStatus || "-";

                const message =
                    data?.message || "-";

                let formattedLastSync = "-";

                if (data?.lastSyncAt) {

                    const date =
                        new Date(data.lastSyncAt);

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

                // --------------------------------------------------
                // 6. Show synchronization status
                // --------------------------------------------------

                MessageBox.information(

                    "Status : " + status +
                    "\n\nLast Sync : " + formattedLastSync +
                    "\n\nMessage : " + message,

                    {
                        title: "Service Audit Synchronization"
                    }
                );

            } catch (err) {

                MessageBox.error(
                    err.message ||
                    "Unable to fetch synchronization status."
                );

            }

        }

    };

});