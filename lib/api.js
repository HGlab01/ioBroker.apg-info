'use strict';

/**
 * Makes an API call with retry logic.
 *
 * @param {any} adapter The adapter instance.
 * @param {string} uri The URI to call.
 * @param {string} methodName The name of the calling method for logging.
 * @param {(response: any) => any} processResponse A function to process the successful response.
 * @param {'GET' | 'POST'} httpMethod The HTTP method to use.
 * @param {any} data The data to send with a POST request.
 * @param {object | null} headers Optional headers for the request.
 * @param {number | null} timeout Optional specific timeout.
 * @returns {Promise<any>} The processed response or null on final server error.
 */
async function apiCallWithRetry(adapter, uri, methodName, processResponse, httpMethod = 'GET', data = null, headers = null, timeout = null) {
    const MAX_ATTEMPTS = 5;
    let delay = 5 * 1000; // 5 seconds
    let attempts = 0;
    let response;
    let config = {};
    if (headers) {
        config.headers = headers;
    }
    config.timeout = timeout ?? adapter.axiosInstance.defaults.timeout;

    while (attempts < MAX_ATTEMPTS) {
        try {
            if (attempts > 0) {
                adapter.log.info(`Retry ${methodName}...`);
            }
            if (httpMethod.toUpperCase() === 'POST') {
                response = await adapter.axiosInstance.post(uri, data, config);
            } else {
                response = await adapter.axiosInstance.get(uri, config);
            }
            if (response?.data == null) {
                throw new Error(`Respone empty for URL ${uri} with status code ${response.status}`);
            }
            adapter.log.debug(`Response in ${methodName}(): [${response.status}] ${JSON.stringify(response.data)}`);
            console.log(`Response in ${methodName}(): [${response.status}] ${JSON.stringify(response.data)}`);
            return processResponse(response);
        } catch (error) {
            attempts++;
            if (attempts >= MAX_ATTEMPTS) {
                // @ts-expect-error error type
                const errorMessage = error.response?.data ? `with response ${JSON.stringify(error.response.data)}` : '';
                adapter.log.error(`Error in ${methodName}() attempt ${attempts}/${MAX_ATTEMPTS}: ${error} ${errorMessage}`);
                console.error(`Error in ${methodName}() attempt ${attempts}/${MAX_ATTEMPTS}: ${error} ${errorMessage}`);
                // @ts-expect-error error type
                if (error.response?.status >= 500) {
                    return null; // On final attempt for server errors, resolve with null
                }
                return null; // Otherwise as of now also return null
            }
            // @ts-expect-error error type
            const errorMessage = error.response?.data ? `with response ${JSON.stringify(error.response.data)}` : '';
            adapter.log.debug(`Error in ${methodName}() attempt ${attempts}/${MAX_ATTEMPTS}: ${error} ${errorMessage}`);
            adapter.log.info(`Retrying in ${delay / 1000}s for ${methodName}...`);
            await adapter.jsonExplorer.sleep(delay);
            delay *= 2; // Exponential backoff (5, 10, 20s)
        }
    }
}

module.exports = { apiCallWithRetry };
