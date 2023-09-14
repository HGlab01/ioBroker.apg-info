/**
 * ************************************************************
 * *************** state attribute template  ******************
 * *** state attribute template by HGlab01 & DutchmanNL ***
 * ************************************************************
 * Object definitions can contain these elements to be called by stateSetCreate function, if not set default values are used
 'Cancel current printing': {			// id of state (name) submitted by stateSetCreate function
		root: '_Info',						// {default: NotUsed} Upper channel root
		rootName: 'Device Info channel,		// {default: NotUsed} Upper channel name
		name: 'Name of state',				// {default: same as id} Name definition for object
		type: >typeof (value)<,				// {default: typeof (value)} type of value automatically detected
		read: true,							// {default: true} Name defition for object
		write: true,						// {default: false} Name defition for object
		role: 'indicator.info',				// {default: state} Role as defined by https://github.com/ioBroker/ioBroker/blob/main/doc/STATE_ROLES.md
		modify: ''							// {default: ''} see below
	},
 */

/**
 * Defines supported methods for element modify which can be used in stateAttr.js
 * In addition: 'cumstom: YOUR CALCULATION' allows any calculation, where 'value' is the input parameter.
 * Example: 
 * modify: 'custom: value + 1' --> add 1 to the json-input
 * 
 *  * supported methods (as string): 
 *  - round(count_digits as {number})  //integer only
 * 	- multiply(factor as {number})
 *  - divide(factor as {number})
 *  - add(number {number})
 *  - substract(number {number})
 *  - upperCase
 *  - lowerCase
 *  - ucFirst
 * 
 * Examples for usage of embeded methods:
 * modify: ['multiply(3.6)', 'round(2)'] --> defined as array --> multiplied by 3.6 and then the result is rounded by 2 digits
 * modify: 'upperCase' --> no array needed as there is only one action; this uppercases the string
 * 
 */

/**
 * state attribute definitions
 */

const stateAttrb = {
	'00': {
		name: `0 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'01': {
		name: `1 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'02': {
		name: `2 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'03': {
		name: `3 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'04': {
		name: `4 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'05': {
		name: `5 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'06': {
		name: `6 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'07': {
		name: `7 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'08': {
		name: `8 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'09': {
		name: `9 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'10': {
		name: `10 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'11': {
		name: `11 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'12': {
		name: `12 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'13': {
		name: `13 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'14': {
		name: `14 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'15': {
		name: `15 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'16': {
		name: `16 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'17': {
		name: `17 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'18': {
		name: `18 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'19': {
		name: `19 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'20': {
		name: `20 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'21': {
		name: `21 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'22': {
		name: `22 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'23': {
		name: `23 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'24': {
		name: `24 o'clock`,
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 01': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 02': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 03': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 04': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 05': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 06': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 07': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 08': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 09': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 10': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 11': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 12': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 13': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 14': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 15': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 16': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 17': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 18': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 19': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'item 20': {
		name: '',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'00_to_01': {
		name: '00.00 to 01.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'01_to_02': {
		name: '01.00 to 02.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'02_to_03': {
		name: '02.00 to 03.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'03_to_04': {
		name: '03.00 to 04.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'04_to_05': {
		name: '04.00 to 05.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'05_to_06': {
		name: '05.00 to 06.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'06_to_07': {
		name: '06.00 to 07.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'07_to_08': {
		name: '07.00 to 08.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'08_to_09': {
		name: '08.00 to 09.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'09_to_10': {
		name: '09.00 to 10.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'10_to_11': {
		name: '10.00 to 11.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'11_to_12': {
		name: '11.00 to 12.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'12_to_13': {
		name: '12.00 to 13.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'13_to_14': {
		name: '13.00 to 14.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'14_to_15': {
		name: '14.00 to 15.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'15_to_16': {
		name: '15.00 to 16.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'16_to_17': {
		name: '16.00 to 17.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'17_to_18': {
		name: '17.00 to 18.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'18_to_19': {
		name: '18.00 to 19.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'19_to_20': {
		name: '19.00 to 20.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'20_to_21': {
		name: '20.00 to 21.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'21_to_22': {
		name: '21.00 to 22.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'22_to_23': {
		name: '22.00 to 23.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'23_to_24': {
		name: '23.00 to 24.00',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
		unit: '€ct/kWh'
	},
	'end_timestamp': {
		name: 'End timestamp',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'start_timestamp': {
		name: 'Start timestamp',
		type: 'number',
		read: true,
		write: false,
		role: 'value.time'
	},
	'marketprice': {
		name: 'Marketprice',
		type: 'number',
		read: true,
		write: false,
		role: 'value',
	},
	'numberOfHours': {
		name: 'Number of Hours',
		type: 'number',
		read: true,
		write: false,
		role: 'info',
	},
	'unit': {
		name: 'Unit',
		type: 'string',
		read: true,
		write: false,
		role: 'info',
	},
	'online': {
		name: 'online',
		type: 'boolean',
		read: true,
		write: false,
		role: 'indicator'
	},
};

module.exports = stateAttrb;