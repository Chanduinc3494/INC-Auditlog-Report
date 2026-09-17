const {formatAuditTimestamp} = require("./utils");
const AUDIT_CHUNK_DAYS = 8;

function getAuditTimeChunks(timeFrom, timeTo) {
    const chunks = [];
    let currentFrom = new Date(timeFrom);
    const finalTo = new Date(timeTo);

    while (currentFrom < finalTo) {
        let currentTo = new Date(currentFrom);
        currentTo.setUTCDate(
            currentTo.getUTCDate() + AUDIT_CHUNK_DAYS
        );

        if (currentTo > finalTo) {
            currentTo = new Date(finalTo);
        }

        chunks.push({
            timeFrom: formatAuditTimestamp(currentFrom),
            timeTo: formatAuditTimestamp(currentTo)
        });

        currentFrom = currentTo;
    }

    return chunks;
}

module.exports={
    getAuditTimeChunks
}