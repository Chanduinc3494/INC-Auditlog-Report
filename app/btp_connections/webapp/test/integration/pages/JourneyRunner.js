sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"btpconnections/test/integration/pages/BTPConnectionList.gen",
	"btpconnections/test/integration/pages/BTPConnectionObjectPage.gen"
], function (JourneyRunner, BTPConnectionListGenerated, BTPConnectionObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('btpconnections') + '/test/flp.html#app-preview',
        pages: {
			onTheBTPConnectionListGenerated: BTPConnectionListGenerated,
			onTheBTPConnectionObjectPageGenerated: BTPConnectionObjectPageGenerated
        },
        async: true
    });

    return runner;
});

