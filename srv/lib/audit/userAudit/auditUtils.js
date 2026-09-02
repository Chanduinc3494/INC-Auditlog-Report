function safeJsonParse(value) {
    if (!value || typeof value === "object") {
        return value || null;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
}

function toStringValue(value) {
    if (value === null || value === undefined) {
        return null;
    }

    const result = String(value).trim();

    return result || null;
}

function truncate(value, maxLength = 200) {
    const result = toStringValue(value);

    if (!result) {
        return null;
    }

    return result.length > maxLength
        ? result.substring(0, maxLength)
        : result;
}

function findPropertyRecursive(object, propertyNames) {
    if (!object || typeof object !== "object") {
        return null;
    }

    if (Array.isArray(object)) {
        for (const item of object) {
            const result = findPropertyRecursive(
                item,
                propertyNames
            );

            if (
                result !== null &&
                result !== undefined
            ) {
                return result;
            }
        }

        return null;
    }

    for (const propertyName of propertyNames) {
        if (
            Object.prototype.hasOwnProperty.call(
                object,
                propertyName
            )
        ) {
            const value = object[propertyName];

            if (
                value !== null &&
                value !== undefined &&
                value !== ""
            ) {
                return value;
            }
        }
    }

    for (const key of Object.keys(object)) {
        const result = findPropertyRecursive(
            object[key],
            propertyNames
        );

        if (
            result !== null &&
            result !== undefined
        ) {
            return result;
        }
    }

    return null;
}

function extractTextValue(text, labels) {
    if (!text) {
        return null;
    }

    const source = String(text);

    for (const label of labels) {
        const escapedLabel = label.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        const regex = new RegExp(
            escapedLabel +
            "\\s*[:=]\\s*([^,\\n\\r\\)\\}\\]]+)",
            "i"
        );

        const match = source.match(regex);

        if (
            match &&
            match[1]
        ) {
            const value = match[1]
                .trim()
                .replace(/^["']|["']$/g, "");

            if (value) {
                return value;
            }
        }
    }

    return null;
}

module.exports = {
    safeJsonParse,
    toStringValue,
    truncate,
    findPropertyRecursive,
    extractTextValue
};