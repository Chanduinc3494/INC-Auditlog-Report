// Normalizing the user audit enteries and adding subaccount name 

function normalizeUserAuditEntries(
    entries,
    subaccountName
) {
    const validEntries = [];

    for (const entry of entries || []) {

        const userId =
            entry.userId?.trim();

        const normalizedUserId =
            userId?.toLowerCase();

        if (
            !normalizedUserId ||
            normalizedUserId === "anonymous" ||
            normalizedUserId === "unknown_user" ||
            normalizedUserId.includes(
                "cn=com.sap.ca.ids"
            )
        ) {
            continue;
        }

        validEntries.push({
            ...entry,
            subaccount: subaccountName,
            ID: entry.ID || cds.utils.uuid()
        });
    }

    return validEntries;
}
module.exports={
    normalizeUserAuditEntries
}