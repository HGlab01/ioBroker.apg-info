'use strict';

const convert = require('xml-js');

/**
 * sets time to 00:00:00.00000
 *
 * @param {Date} date date to be changed
 */
function cleanDate(date) {
    date.setHours(0, 0, 0, 0);
    return date;
}

/**
 * adds days to a date
 *
 * @param {Date} date origin date
 * @param {number} numberOfDays number of days which origin date shall be added (positive and negative allowes)
 */
function addDays(date, numberOfDays) {
    let newDate = new Date(date.getTime());
    newDate.setDate(newDate.getDate() + numberOfDays);
    return cleanDate(newDate);
}
/**
 * @param {number} hour hour of the day (0-23)
 * @param {boolean} tomorrow if true, calculates for tomorrow, otherwise for today
 * @returns {number} returns timestamp for given hour of the day
 */
function calcDate(hour, tomorrow = false) {
    let date = cleanDate(new Date());
    if (tomorrow) {
        date = addDays(date, 1);
    }
    date.setHours(hour);
    return date.getTime();
}

/**
 * @param {any[]} a first array
 * @param {any[]} b second array
 * @returns {number} comparison result of second column of both arrays
 */
function compareSecondColumn(a, b) {
    if (a[1] === b[1]) {
        return 0;
    }
    return a[1] < b[1] ? -1 : 1;
}

/**
 * @param {number} num number
 * @param {number} length length
 * @returns {string} returns a string with leading zeros based on given number
 */
function pad(num, length) {
    if (num == null) {
        num = 0;
    }
    let l = Math.floor(length);
    let sn = String(num);
    let snl = sn.length;
    if (snl >= l) {
        return sn;
    }
    return '0'.repeat(l - snl) + sn;
}

/**
 * @param {string} xmlString XML string to be converted
 * @returns {object} returns JSON object converted from XML string
 */
function xml2js(xmlString) {
    // @ts-expect-error replaceAll is a valid method
    xmlString = xmlString.replaceAll(`price.amount`, `price_amount`);
    const jsonResult = JSON.parse(
        convert.xml2json(xmlString, {
            compact: true,
        }),
    );
    return jsonResult;
}

module.exports = {
    addDays,
    cleanDate,
    calcDate,
    pad,
    compareSecondColumn,
    xml2js,
};
