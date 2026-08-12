function getErrorMessage(err) {

    if (err.response) {

        const status = err.response.status;

        const data = err.response.data;

        let details = "";

        if (typeof data === "string") {
            details = data;
        } else if (data?.message) {
            details = data.message;
        } else if (data?.error_description) {
            details = data.error_description;
        } else if (data?.error) {
            details = data.error;
        } else {
            details = JSON.stringify(data);
        }

        return `HTTP ${status}: ${details}`;
    }

    if (err.request) {
        return "No response received from the remote service.";
    }

    return err.message || "Unknown error occurred.";
}

module.exports={
    getErrorMessage
}