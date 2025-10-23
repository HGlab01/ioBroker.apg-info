'use strict';

const { sleep } = require('iobroker-jsonexplorer');

/**
 * Makes an API call with retry logic.
 *
 * @param {any} adapter The adapter instance.
 * @param {import('axios').AxiosInstance} axiosInstance The axios instance for making requests.
 * @param {string} uri The URI to call.
 * @param {string} methodName The name of the calling method for logging.
 * @param {(response: any) => any} processResponse A function to process the successful response.
 * @returns {Promise<any>} The processed response or null on final server error.
 */
async function apiCallWithRetry(adapter, axiosInstance, uri, methodName, processResponse) {
    let attempts = 0;
    const MAX_ATTEMPTS = 1;
    let delay = 10 * 1000; // 10 seconds

    while (attempts < MAX_ATTEMPTS) {
        try {
            const response = await adapter.axiosInstance.get(uri);
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
                throw error; // Otherwise rethrow
            }
            adapter.log.info(`Retrying in ${delay / 1000}s for ${methodName}...`);
            await sleep(delay);
            delay *= 2; // Exponential backoff (10s, 20s)
        }
    }
}

module.exports = { apiCallWithRetry };
