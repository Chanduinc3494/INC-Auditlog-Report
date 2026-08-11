using auditLoggingAndReportingService as service from '../../srv/service';
annotate service.BTPConnection with @(
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'Subaccount Id',
                Value : subaccountId,
            },
            {
                $Type : 'UI.DataField',
                Label : 'Subaccount Name',
                Value : subaccountName,
            },
            {
                $Type : 'UI.DataField',
                Label : 'Service Type',
                Value : serviceType,
            },
            {
                $Type : 'UI.DataField',
                Label : 'Token Url',
                Value : tokenUrl,
            },
            {
                $Type : 'UI.DataField',
                Label : 'ApiBase Url',
                Value : apiBaseUrl,
            },
            {
                $Type : 'UI.DataField',
                Label : 'Client Id',
                Value : clientId,
            },
            {
                $Type : 'UI.DataField',
                Label : 'Client Secret',
                Value : clientSecret,
            },
            {
                $Type : 'UI.DataField',
                Label : 'Region',
                Value : region,
            },
            {
                $Type : 'UI.DataField',
                Label : 'Active',
                Value : active,
            },
            {
                $Type : 'UI.DataField',
                Value : username,
                Label : 'CF username',
            },
            {
                $Type : 'UI.DataField',
                Value : password,
                Label : 'CF password',
            },
            {
                $Type : 'UI.DataField',
                Value : orgName,
                Label : 'CF orgName',
            },
            {
                $Type : 'UI.DataField',
                Value : orgId,
                Label : 'CF orgId',
            },
        ],
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'GeneratedFacet1',
            Label : 'General Information',
            Target : '@UI.FieldGroup#GeneratedGroup',
        },
    ],
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Label : 'subaccountName',
            Value : subaccountName,
        },
        {
            $Type : 'UI.DataField',
            Label : 'serviceType',
            Value : serviceType,
        },
        {
            $Type : 'UI.DataField',
            Label : 'tokenUrl',
            Value : tokenUrl,
        },
        {
            $Type : 'UI.DataField',
            Label : 'apiBaseUrl',
            Value : apiBaseUrl,
        },
        {
            $Type : 'UI.DataField',
            Value : region,
        },
    ],
    UI.SelectionFields : [
        subaccountName,
        region,
        serviceType,
    ],
    UI.HeaderInfo : {
        TypeName : '',
        TypeNamePlural : '',
        Title : {
            $Type : 'UI.DataField',
            Value : subaccountName,
        },
        TypeImageUrl : 'sap-icon://accounting-document-verification',
    },
    UI.DataPoint #subaccountName : {
        $Type : 'UI.DataPointType',
        Value : subaccountName,
        Title : 'Subaccount Name',
    },
    UI.DataPoint #region : {
        $Type : 'UI.DataPointType',
        Value : region,
        Title : 'Region',
    },
    UI.DataPoint #serviceType : {
        $Type : 'UI.DataPointType',
        Value : serviceType,
        Title : 'Service Type',
    },
    UI.HeaderFacets : [
        
    ],
);

annotate service.BTPConnection with {
    subaccountName @(
        Common.Label : 'Subaacount Name',
        Common.ValueList : {
            $Type : 'Common.ValueListType',
            CollectionPath : 'BTPSubaccountVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : subaccountName,
                    ValueListProperty : 'subaccountName',
                },
            ],
            Label : 'Subaccount ',
        },
        Common.ValueListWithFixedValues : false,
    )
};

annotate service.BTPConnection with {
    subaccountId @Common.Label : 'Subaccount Id'
};

annotate service.BTPConnection with {
    serviceType @(
        Common.Label : 'Service Type',
        Common.ValueList : {
            $Type : 'Common.ValueListType',
            CollectionPath : 'BTPServiceTypeVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : BTP,
                    ValueListProperty : 'code',
                },
            ],
            Label : 'Service Type',
        },
        Common.ValueListWithFixedValues : true,
        )
};

annotate service.BTPConnection with {
    region @(
        Common.Label : 'region',
        Common.ValueList : {
            $Type : 'Common.ValueListType',
            CollectionPath : 'BTPRegionVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : region,
                    ValueListProperty : 'region',
                },
            ],
            Label : 'Region',
        },
        Common.ValueListWithFixedValues : true,
    )
};

