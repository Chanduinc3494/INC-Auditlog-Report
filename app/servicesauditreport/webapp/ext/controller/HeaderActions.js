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
    "sap/m/MessageBox",
    "sap/m/BusyDialog"
], function (MessageBox,BusyDialog) {
    "use strict";

    return {

        onLastSyncPress: async function () {
            const oBusyDialog = new BusyDialog({
                title: "Loading",
                text: "Fetching synchronization status..."
            });

            try {
                oBusyDialog.open();
                const oPage = sap.ui.getCore().byId(
                    "servicesauditreport::ServiceAuditReportsList"
                );

                if (!oPage) {
                    throw new Error(
                        "Service Audit List Report page not found."
                    );
                }
                const oModel = oPage.getModel();

                if (!oModel) {
                    throw new Error(
                        "OData V4 model not found."
                    );
                }
                const oOperation = oModel.bindContext(
                    "/getServiceAuditStatus(...)"
                );

                await oOperation.execute();
                const data =
                    oOperation.getBoundContext().getObject();
                const status =
                    data?.lastSyncStatus || "-";

                const message =
                    data?.message || "-";

                let formattedLastRun = "-";
                if (data?.lastRunAt) {
                    const date =
                        new Date(data.lastRunAt);

                    formattedLastRun =
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
                        ).format(date);}
                        
                   MessageBox.information(
                    "Status : " + status +
                    "\n\nLast Run : " + formattedLastRun +
                    "\n\nLast Successful Sync : " +
                    formattedLastSync +
                    "\n\nMessage : " + message,
                    {
                        title:"Service Audit Synchronization"
                    }
                );

            } catch (err) {

                MessageBox.error(
                    err.message ||
                    "Unable to fetch synchronization status."
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