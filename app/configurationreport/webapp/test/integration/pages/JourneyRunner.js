sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"configurationreport/test/integration/pages/ConfigurationReportList",
	"configurationreport/test/integration/pages/ConfigurationReportObjectPage"
], function (JourneyRunner, ConfigurationReportList, ConfigurationReportObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('configurationreport') + '/test/flpSandbox.html#configurationreport-tile',
        pages: {
			onTheConfigurationReportList: ConfigurationReportList,
			onTheConfigurationReportObjectPage: ConfigurationReportObjectPage
        },
        async: true
    });

    return runner;
});

