using auditLoggingAndReportingService as service from '../../srv/service';
annotate service.BTPConnection with @(
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : '{i18n>SubaccountId}',
                Value : subaccountId,
            },
            {
                $Type : 'UI.DataField',
                Label : '{i18n>Subaccountname}',
                Value : subaccountName,
            },
            {
                $Type : 'UI.DataField',
                Label : '{i18n>Tokenurl}',
                Value : tokenUrl,
            },
            {
                $Type : 'UI.DataField',
                Label : '{i18n>Apibaseurl}',
                Value : apiBaseUrl,
            },
            {
                $Type : 'UI.DataField',
                Label : '{i18n>ClientId}',
                Value : clientId,
            },
            {
                $Type : 'UI.DataField',
                Label : '{i18n>ClientSecret}',
                Value : clientSecret,
            },
            {
                $Type : 'UI.DataField',
                Value : username,
                Label : '{i18n>CfUsername}',
            },
            {
                $Type : 'UI.DataField',
                Value : password,
                Label : '{i18n>CfPassword}',
            },
            {
                $Type : 'UI.DataField',
                Label : '{i18n>Servicetype}',
                Value : serviceType,
            },
            {
                $Type : 'UI.DataField',
                Label : '{i18n>Active}',
                Value : active,
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
            Label : '{i18n>Subaccountname}',
            Value : subaccountName,
        },
        {
            $Type : 'UI.DataField',
            Label : '{i18n>Servicetype}',
            Value : serviceType,
        },
        {
            $Type : 'UI.DataField',
            Label : '{i18n>Tokenurl}',
            Value : tokenUrl,
        },
        {
            $Type : 'UI.DataField',
            Label : '{i18n>Apibaseurl}',
            Value : apiBaseUrl,
        },
    ],
    UI.SelectionFields : [
        subaccountName,
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

