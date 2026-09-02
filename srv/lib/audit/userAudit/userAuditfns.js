const {
    fetchUserAuditLogs,
    fetchUserConfigLogs
} = require("./auditLogFetcher");

const {
    deduplicateUserAuditEntries,
    consolidateUserPersonaRecords
} = require("./deduplication");

const {
    extractNormalizedCloneId,
    normalizeUuid,
    resolveTechnicalUser
} = require("./technicalUser");

module.exports = {
    fetchUserConfigLogs,
    fetchUserAuditLogs,
    deduplicateUserAuditEntries,
    consolidateUserPersonaRecords,
    extractNormalizedCloneId,
    normalizeUuid,
    resolveTechnicalUser
};