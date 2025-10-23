'use strict';

const { addDays, cleanDate, pad, xml2js } = require('./helpers.js');
const { apiCallWithRetry } = require('./api.js');
const cheerio = require('cheerio');
const axios = require('axios');

/**
 * Retrieves marketdata from REST-API from Exaa
 *
 * @param {any} adapter adapter instance
 * @param {string} country country of the market
 */
async function getDataExaa1015(adapter, country) {
    country = country.toUpperCase();
    const day = addDays(cleanDate(new Date()), 1);

    const dateStringToday = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
    const uri = `https://www.exaa.at/data/market-results?delivery_day=${dateStringToday}&market=${country}&auction=1015`;
    adapter.log.debug(`API-Call ${uri}`);
    console.log(`API-Call ${uri}`);

    return apiCallWithRetry(adapter, adapter.axiosInstance, uri, 'getDataExaa1015', response => {
        if (country === 'AT') {
            return response?.data?.AT?.price ?? null;
        }
        return response?.data?.DE?.price ?? null;
    });
}

/**
 * Retrieves marketdata from REST-API from Exaa
 *
 * @param {any} adapter adapter instance
 * @param {boolean} tomorrow true means it is the next day, false means today
 * @param {string} country country of the market
 */
async function getDataExaa(adapter, tomorrow, country) {
    await getDataEpex(adapter, tomorrow, country);
    let day = cleanDate(new Date());
    if (tomorrow) {
        day = addDays(day, 1);
    }

    const dateStringToday = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
    const uri = `https://www.exaa.at/data/trading-results?delivery_day=${dateStringToday}&market=${country}&auction=market_coupling`;
    adapter.log.debug(`API-Call ${uri}`);
    console.log(`API-Call ${uri}`);

    return apiCallWithRetry(adapter, adapter.axiosInstance, uri, 'getDataExaa', response => response?.data?.data ?? null);
}

/**
 * Retrieves marketdata from REST-API from Awattar
 *
 * @param {any} adapter adapter instance
 * @param {boolean} tomorrow true means it is the next day, false means today
 * @param {string} country country of the market
 */
async function getDataAwattar(adapter, tomorrow, country) {
    const day0 = cleanDate(new Date());
    let start = 0;
    let end = 0;
    if (tomorrow) {
        const day1 = addDays(day0, 1);
        start = day1.getTime();
        day1.setHours(23, 59, 59);
        end = day1.getTime() + 2000;
    } else {
        start = day0.getTime();
        day0.setHours(23, 59, 59);
        end = day0.getTime() + 2000;
    }
    let uri = '';
    if (country == 'at') {
        uri = `https://api.awattar.at/v1/marketdata?start=${start}&end=${end}`;
    } else {
        uri = `https://api.awattar.de/v1/marketdata?start=${start}&end=${end}`;
    }
    adapter.log.debug(`API-Call ${uri}`);
    console.log(`API-Call ${uri}`);
    return apiCallWithRetry(adapter, adapter.axiosInstance, uri, 'getDataAwattar', response => response.data);
}

/**
 * Retrieves peak hours from REST-API
 *
 * @param {any} adapter adapter instance
 */
async function getDataPeakHours(adapter) {
    const uri = `https://awareness.cloud.apg.at/api/v1/PeakHourStatus`;
    adapter.log.debug(`API-Call ${uri}`);
    console.log(`API-Call ${uri}`);
    return apiCallWithRetry(adapter, adapter.axiosInstance, uri, 'getDataPeakHours', response => response?.data ?? null);
}

/**
 * Retrieves marketdata from REST-API from entsoe
 *
 * @param {any} adapter adapter instance
 * @param {boolean} tomorrow means it is the next day, false means today
 * @param {string} country country of the market
 */
async function getDataEntsoe(adapter, tomorrow, country) {
    const url = 'https://web-api.tp.entsoe.eu/api?documentType=A44';
    const securityToken = adapter.token;

    let day = cleanDate(new Date());
    if (tomorrow) {
        day = addDays(day, 1);
    }
    const dayPlus = addDays(day, 1);

    const datebegin = day.getFullYear() + pad(day.getMonth() + 1, 2) + pad(day.getDate(), 2);
    const dateend = dayPlus.getFullYear() + pad(dayPlus.getMonth() + 1, 2) + pad(dayPlus.getDate(), 2);

    let domain = '';

    switch (country) {
        case 'ch':
            domain = '10YCH-SWISSGRIDZ';
            break;
        case 'at':
            domain = '10YAT-APG------L';
            break;
        case 'de':
            domain = '10Y1001A1001A82H';
            break;
        default:
            adapter.log.error('Country not found in definitions');
    }

    const uri = `${url}&securityToken=${securityToken}&periodStart=${datebegin}0000&periodEnd=${dateend}0000&in_Domain=${domain}&Out_Domain=${domain}`;
    adapter.log.debug(`API-Call ${uri}`);
    console.log(`API-Call ${uri}`);

    return apiCallWithRetry(adapter, adapter.axiosInstance, uri, 'getDataEntsoe', response => {
        const result = response?.data == null ? null : xml2js(response.data);
        return result?.Publication_MarketDocument ?? null;
    });
}

/**
 * Retrieves marketdata from REST-API from entsoe
 *
 * @param {any} adapter adapter instance
 * @param {boolean} tomorrow means it is the next day, false means today
 * @param {string} country country of the market
 */
async function getDataEpex(adapter, tomorrow, country) {
    let day = cleanDate(new Date());
    if (tomorrow) {
        day = addDays(day, 1);
        return;
    }
    const dayString = `${day.getFullYear()}-${pad(day.getMonth() + 1, 2)}-${pad(day.getDate(), 2)}`;

    const baseUrl = 'https://www.epexspot.com/en/market-results';
    const params = {
        market_area: country.toUpperCase(),
        auction: 'MRC',
        delivery_date: dayString,
        modality: 'Auction',
        sub_modality: 'DayAhead',
        data_mode: 'table',
        product: '15',
    };

    const client = axios.create({
        baseURL: 'https://www.epexspot.com',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
            'Accept-Encoding': 'identity', // wichtig in ioBroker (kein gzip!)
            Connection: 'keep-alive',
            Referer: baseUrl,
        },
        withCredentials: true,
        responseType: 'text',
    });

    // === 1️⃣ Disclaimer-Seite laden ===
    //const { data: html1 } = await client.get(baseUrl, { params });

    let header = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
        'Accept-Encoding': 'identity', // wichtig in ioBroker (kein gzip!)
        Connection: 'keep-alive',
        Referer: baseUrl,
    };

    const query = new URLSearchParams(params).toString();
    const uri = `${baseUrl}?${query}`;
    adapter.log.info('🌐 EPEX URL: ' + uri);

    adapter.axiosInstance.defaults.headers.common = header;
    const html1 = await apiCallWithRetry(adapter, adapter.axiosInstance, uri, 'getDataPeakHours', response => response?.data ?? null);
    adapter.axiosInstance.defaults.headers.common = {};

    const $1 = cheerio.load(html1);

    const form = $1('form#data-disclaimer-acceptation-form');
    const formBuildId = form.find("input[name='form_build_id']").val();
    const formId = form.find("input[name='form_id']").val();
    const op = form.find("button[name='op']").val();
    const action = form.attr('action') || baseUrl; // ✅ NEU

    if (!formBuildId) throw new Error('❌ form_build_id nicht gefunden (Disclaimer fehlt?)');

    // === 2️⃣ POST absenden, um Zugriff zu bekommen ===
    const formData = new URLSearchParams({
        form_build_id: formBuildId,
        form_id: formId,
        op: op,
    });

    await client.post(action, formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    // === 3️⃣ Danach die freigeschaltete Seite erneut abrufen === ✅ NEU
    const { data: html2 } = await client.get(baseUrl, { params });
    const $ = cheerio.load(html2);

    // === 4️⃣ Datum auslesen ===
    const h2Text = $('div.table-container h2').first().text().trim();
    adapter.log.info('📅 Datumstitel: ' + h2Text);

    // === 5️⃣ Zeiten extrahieren ===
    const timeList = [];
    $('div.custom-tables.\\31 5min .js-table-times ul li a').each((i, el) => {
        const text = $(el).text().trim();
        const [start, end] = text.split(' - ');
        timeList.push({ index: i + 1, start, end });
    });

    adapter.log.info(`⏱️ ${timeList.length} Zeitabschnitte gefunden.`);

    // === 6️⃣ Werte extrahieren ===
    const headers = [];
    $('div.js-table-values table thead tr:last-child th').each((i, th) => {
        headers.push($(th).text().replace(/\s+/g, ' ').trim());
    });

    const rows = [];
    $('div.js-table-values table tbody tr.child').each((i, tr) => {
        const cells = $(tr).find('td');
        const row = { index: i + 1 };
        headers.forEach((header, j) => {
            row[header] = $(cells[j]).text().trim() || null;
        });
        rows.push(row);
    });

    // === 7️⃣ Zeit + Werte kombinieren ===
    const combined = timeList.map((t, i) => ({
        ...t,
        ...(rows[i] || {}),
    }));

    // === 8️⃣ Ergebnisobjekt ===
    const result = {
        meta: {
            sourceUrl: `${baseUrl}?${new URLSearchParams(params).toString()}`,
            extractedAt: new Date().toISOString(),
            deliveryDateText: h2Text,
            entries: combined.length,
        },
        data: combined,
    };

    adapter.log.info('✅ EPEX Data fetched: ' + JSON.stringify(result));
    return result;
}

module.exports = {
    getDataExaa1015,
    getDataExaa,
    getDataAwattar,
    getDataEntsoe,
    getDataEpex,
    getDataPeakHours,
};
