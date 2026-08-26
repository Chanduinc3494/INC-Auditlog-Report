function formatAuditTimestamp(date) {
    return new Date(date)
        .toISOString()
        .replace(/\.\d{3}Z$/, "");
}
module.exports={
    formatAuditTimestamp
}