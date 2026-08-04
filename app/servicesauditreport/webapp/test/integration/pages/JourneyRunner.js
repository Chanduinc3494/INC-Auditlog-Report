sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"servicesauditreport/test/integration/pages/ServiceAuditReportsList",
	"servicesauditreport/test/integration/pages/ServiceAuditReportsObjectPage"
], function (JourneyRunner, ServiceAuditReportsList, ServiceAuditReportsObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('servicesauditreport') + '/test/flpSandbox.html#servicesauditreport-tile',
        pages: {
			onTheServiceAuditReportsList: ServiceAuditReportsList,
			onTheServiceAuditReportsObjectPage: ServiceAuditReportsObjectPage
        },
        async: true
    });

    return runner;
});

