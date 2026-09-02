const {
    safeJsonParse,
    toStringValue,
    truncate,
    findPropertyRecursive,
    extractTextValue
} = require("./auditUtils");

const {
    resolveTechnicalUser
} = require("./technicalUser");

function extractTokenData(auditMessage) {
    if (!auditMessage) {
        return {};
    }

    const message =
        String(auditMessage);

    const patterns = [
        /TokenIssuedEvent\s*:\s*['"]?(\{[\s\S]*\})/i,
        /TokenIssuedEvent\s*=\s*['"]?(\{[\s\S]*\})/i,
        /TokenIssuedEvent\s*\(\s*['"]?(\{[\s\S]*?\})['"]?\s*\)/i,
        /TokenIssuedEvent\s*\(\s*['"]?(\[[\s\S]*?\])['"]?\s*\)/i
    ];

    for (const regex of patterns) {
        const match =
            message.match(regex);

        if (
            !match ||
            !match[1]
        ) {
            continue;
        }

        let tokenText =
            match[1].trim();

        let tokenData =
            safeJsonParse(tokenText);

        if (tokenData) {
            return tokenData;
        }

        tokenText =
            tokenText
                .replace(/\\"/g, '"')
                .replace(/\\'/g, "'");

        tokenData =
            safeJsonParse(tokenText);

        if (tokenData) {
            return tokenData;
        }
    }

    return {};
}

function extractRoleCollections(
    tokenData,
    innerData,
    outerMessage,
    auditMessage
) {
    let roles =
        findPropertyRecursive(
            tokenData,
            [
                "xs.rolecollections",
                "rolecollections"
            ]
        );

    if (!roles) {
        roles =
            findPropertyRecursive(
                innerData,
                [
                    "xs.rolecollections",
                    "rolecollections"
                ]
            );
    }

    if (!roles) {
        roles =
            findPropertyRecursive(
                outerMessage,
                [
                    "xs.rolecollections",
                    "rolecollections"
                ]
            );
    }

    if (Array.isArray(roles)) {
        return roles
            .map(role =>
                toStringValue(role)
            )
            .filter(Boolean);
    }

    if (typeof roles === "string") {
        return roles
            .split(",")
            .map(role => role.trim())
            .filter(Boolean);
    }

    if (roles) {
        return [
            String(roles).trim()
        ];
    }

    if (auditMessage) {
        const roleMatch =
            String(auditMessage).match(
                /xs\.rolecollections\s*[:=]\s*\[([^\]]*)\]/i
            );

        if (
            roleMatch &&
            roleMatch[1]
        ) {
            return roleMatch[1]
                .split(",")
                .map(role =>
                    role
                        .trim()
                        .replace(
                            /^["']|["']$/g,
                            ""
                        )
                )
                .filter(Boolean);
        }
    }

    return [];
}

function extractUserId(
    tokenData,
    innerData,
    outerMessage,
    log,
    auditMessage,
    instanceMap
) {
    const rawLogUser =
        toStringValue(
            log && log.user
        );

    if (rawLogUser) {
        const technicalIdentity =
            resolveTechnicalUser(
                rawLogUser,
                instanceMap
            );

        if (technicalIdentity) {
            return technicalIdentity;
        }
    }

    let rawUserId =
        extractTextValue(
            auditMessage,
            [
                "JWT User",
                "started_by",
                "startedBy",
                "user_id",
                "userId",
                "user",
                "username"
            ]
        );

    if (!rawUserId) {
        rawUserId =
            findPropertyRecursive(
                tokenData,
                [
                    "JWT User",
                    "jwt_user",
                    "jwtUser",
                    "User",
                    "user",
                    "user_id",
                    "userId",
                    "username"
                ]
            );
    }

    if (!rawUserId) {
        rawUserId =
            findPropertyRecursive(
                innerData,
                [
                    "User",
                    "user",
                    "started_by",
                    "startedBy",
                    "userId",
                    "username"
                ]
            );
    }

    if (!rawUserId) {
        rawUserId =
            outerMessage &&
            (
                outerMessage.User ||
                outerMessage.user
            );
    }

    if (!rawUserId) {
        rawUserId =
            log && log.user;
    }

    return truncate(
        rawUserId,
        200
    );
}

function extractUserName(
    tokenData,
    innerData,
    outerMessage,
    userId,
    auditMessage
) {
    const givenName =
        findPropertyRecursive(
            tokenData,
            ["given_name"]
        ) ||
        findPropertyRecursive(
            innerData,
            ["given_name"]
        ) ||
        findPropertyRecursive(
            outerMessage,
            ["given_name"]
        ) ||
        extractTextValue(
            auditMessage,
            [
                "given_name",
                "given name"
            ]
        );

    const familyName =
        findPropertyRecursive(
            tokenData,
            ["family_name"]
        ) ||
        findPropertyRecursive(
            innerData,
            ["family_name"]
        ) ||
        findPropertyRecursive(
            outerMessage,
            ["family_name"]
        ) ||
        extractTextValue(
            auditMessage,
            [
                "family_name",
                "family name"
            ]
        );

    const first =
        toStringValue(givenName) || "";

    const last =
        toStringValue(familyName) || "";

    const fullName =
        `${first} ${last}`.trim();

    return truncate(
        fullName || userId,
        200
    );
}

function extractCategory(
    innerData,
    outerMessage,
    auditMessage
) {
    let category =
        findPropertyRecursive(
            innerData,
            [
                "category",
                "Category"
            ]
        ) ||
        findPropertyRecursive(
            outerMessage,
            [
                "category",
                "Category"
            ]
        );

    if (
        !category &&
        auditMessage
    ) {
        category =
            extractTextValue(
                auditMessage,
                [
                    "Category",
                    "category"
                ]
            );
    }

    if (category) {
        const catStr =
            String(category)
                .toLowerCase()
                .replace(
                    /^audit\./i,
                    ""
                )
                .trim();

        if (
            catStr.includes("data-access") ||
            catStr.includes("data_access") ||
            catStr.includes("data access")
        ) {
            return "Data Access";
        }

        if (
            catStr.includes("data-modification") ||
            catStr.includes("data_modification") ||
            catStr.includes("data modification")
        ) {
            return "Data Modification";
        }

        if (
            catStr.includes("configuration") ||
            catStr.includes("config")
        ) {
            return "Configuration";
        }

        if (
            catStr.includes("security") ||
            catStr.includes("security-events")
        ) {
            return "Security Events";
        }

        const formatted =
            catStr
                .replace(/[._-]/g, " ")
                .split(/\s+/)
                .filter(Boolean)
                .map(word =>
                    word.charAt(0).toUpperCase() +
                    word.slice(1)
                )
                .join(" ");

        return truncate(
            formatted,
            200
        );
    }

    return "Security Events";
}

function extractOrigin(
    innerData,
    outerMessage,
    auditMessage
) {
    let origin =
        findPropertyRecursive(
            innerData,
            [
                "origin",
                "Origin"
            ]
        ) ||
        findPropertyRecursive(
            outerMessage,
            [
                "origin",
                "Origin"
            ]
        );

    if (
        !origin &&
        auditMessage
    ) {
        const originMatch =
            String(auditMessage).match(
                /["']?origin["']?\s*[:=]\s*["']?([^,"'\s}\]]+)/i
            );

        if (
            originMatch &&
            originMatch[1]
        ) {
            origin =
                originMatch[1];
        }
    }

    return truncate(
        origin,
        100
    );
}

function extractUserInformation(
    log,
    instanceMap
) {
    const outerMessage =
        safeJsonParse(
            log && log.message
        ) || {};

    const innerData =
        safeJsonParse(
            outerMessage &&
            outerMessage.data
        ) || {};

    const auditMessage =
        String(
            (innerData &&
                innerData.message) ||
            (outerMessage &&
                outerMessage.message) ||
            (log && log.message) ||
            ""
        );

    const category =
        extractCategory(
            innerData,
            outerMessage,
            auditMessage
        );

    const tokenData =
        extractTokenData(
            auditMessage
        );

    const userId =
        extractUserId(
            tokenData,
            innerData,
            outerMessage,
            log,
            auditMessage,
            instanceMap
        );

    const userName =
        extractUserName(
            tokenData,
            innerData,
            outerMessage,
            userId,
            auditMessage
        );

    const roleCollections =
        extractRoleCollections(
            tokenData,
            innerData,
            outerMessage,
            auditMessage
        );

    const origin =
        extractOrigin(
            innerData,
            outerMessage,
            auditMessage
        );

    const subaccount =
        truncate(
            log && log.tenant,
            200
        );

    return {
        userId,
        userName,
        roleCollections,
        category,
        origin,
        subaccount,
        auditMessage,
        tokenData,
        innerData,
        outerMessage
    };
}

module.exports = {
    extractTokenData,
    extractRoleCollections,
    extractUserId,
    extractUserName,
    extractCategory,
    extractOrigin,
    extractUserInformation
};