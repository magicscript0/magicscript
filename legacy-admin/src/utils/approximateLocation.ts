/**
 * Approximate country resolution — fully local, zero network.
 *
 * The monitoring center records ONLY an approximate ISO 3166-1 alpha-2
 * country code, and it is derived from the IANA timezone the browser
 * already exposes to every website (`Intl.DateTimeFormat().resolvedOptions()`).
 *
 * Why not Geo-IP?
 *   - The repository's static write audit forbids ad-hoc network calls from
 *     production source (an existing architectural guard we must not
 *     weaken), and no third-party geo service may receive visitor IPs.
 *   - A timezone-derived country needs no IP address anywhere in the
 *     system: nothing to minimize, nothing to leak, nothing to store.
 *
 * The result is approximate by design ( travellers/VPN users may map
 * elsewhere) and null whenever the timezone is missing or unmapped — the
 * dashboard then simply shows no location. The timezone itself is NEVER
 * stored or transmitted; only the coarse country code is.
 */

import { normalizeCountryCode } from './deviceMeta'

/**
 * Primary IANA zones → country. Kept to well-known primary/alias zones;
 * anything unmapped resolves to null instead of guessing.
 */
const TIMEZONE_COUNTRY_MAP: Record<string, string> = {
  'Africa/Abidjan': 'CI', 'Africa/Accra': 'GH', 'Africa/Addis_Ababa': 'ET', 'Africa/Algiers': 'DZ',
  'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Harare': 'ZW', 'Africa/Johannesburg': 'ZA',
  'Africa/Kampala': 'UG', 'Africa/Khartoum': 'SD', 'Africa/Kinshasa': 'CD', 'Africa/Lagos': 'NG',
  'Africa/Luanda': 'AO', 'Africa/Maputo': 'MZ', 'Africa/Nairobi': 'KE', 'Africa/Tunis': 'TN',
  'Africa/Tripoli': 'LY', 'America/Argentina/Buenos_Aires': 'AR', 'America/Asuncion': 'PY',
  'America/Bahia_Banderas': 'MX', 'America/Belem': 'BR', 'America/Belize': 'BZ', 'America/Bogota': 'CO',
  'America/Cancun': 'MX', 'America/Caracas': 'VE', 'America/Chicago': 'US', 'America/Chihuahua': 'MX',
  'America/Costa_Rica': 'CR', 'America/Denver': 'US', 'America/Detroit': 'US', 'America/Edmonton': 'CA',
  'America/El_Salvador': 'SV', 'America/Fortaleza': 'BR', 'America/Guatemala': 'GT', 'America/Guayaquil': 'EC',
  'America/Halifax': 'CA', 'America/Havana': 'CU', 'America/Hermosillo': 'MX', 'America/Indiana/Indianapolis': 'US',
  'America/Indianapolis': 'US', 'America/Jamaica': 'JM', 'America/Juneau': 'US', 'America/Kentucky/Louisville': 'US',
  'America/La_Paz': 'BO', 'America/Lima': 'PE', 'America/Los_Angeles': 'US', 'America/Managua': 'NI',
  'America/Manaus': 'BR', 'America/Mazatlan': 'MX', 'America/Merida': 'MX', 'America/Mexico_City': 'MX',
  'America/Monterrey': 'MX', 'America/Montevideo': 'UY', 'America/New_York': 'US', 'America/Nome': 'US',
  'America/Panama': 'PA', 'America/Phoenix': 'US', 'America/Port-au-Prince': 'HT', 'America/Puerto_Rico': 'PR',
  'America/Recife': 'BR', 'America/Regina': 'CA', 'America/Rio_Branco': 'BR', 'America/Santiago': 'CL',
  'America/Santo_Domingo': 'DO', 'America/Sao_Paulo': 'BR', 'America/St_Johns': 'CA', 'America/Tegucigalpa': 'HN',
  'America/Tijuana': 'MX', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Winnipeg': 'CA',
  'Asia/Almaty': 'KZ', 'Asia/Amman': 'JO', 'Asia/Aqtau': 'KZ', 'Asia/Aqtobe': 'KZ', 'Asia/Ashgabat': 'TM',
  'Asia/Baghdad': 'IQ', 'Asia/Bahrain': 'BH', 'Asia/Baku': 'AZ', 'Asia/Bangkok': 'TH', 'Asia/Beirut': 'LB',
  'Asia/Bishkek': 'KG', 'Asia/Brunei': 'BN', 'Asia/Calcutta': 'IN', 'Asia/Chongqing': 'CN', 'Asia/Colombo': 'LK',
  'Asia/Damascus': 'SY', 'Asia/Dhaka': 'BD', 'Asia/Dili': 'TL', 'Asia/Dubai': 'AE', 'Asia/Dushanbe': 'TJ',
  'Asia/Harbin': 'CN', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Hong_Kong': 'HK', 'Asia/Irkutsk': 'RU', 'Asia/Jakarta': 'ID',
  'Asia/Jayapura': 'ID', 'Asia/Jerusalem': 'IL', 'Asia/Kabul': 'AF', 'Asia/Kamchatka': 'RU', 'Asia/Karachi': 'PK',
  'Asia/Kashgar': 'CN', 'Asia/Kathmandu': 'NP', 'Asia/Katmandu': 'NP', 'Asia/Kolkata': 'IN', 'Asia/Krasnoyarsk': 'RU',
  'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY', 'Asia/Kuwait': 'KW', 'Asia/Macau': 'MO', 'Asia/Magadan': 'RU',
  'Asia/Makassar': 'ID', 'Asia/Manila': 'PH', 'Asia/Muscat': 'OM', 'Asia/Nicosia': 'CY', 'Asia/Novosibirsk': 'RU',
  'Asia/Omsk': 'RU', 'Asia/Oral': 'KZ', 'Asia/Pontianak': 'ID', 'Asia/Qatar': 'QA', 'Asia/Qostanay': 'KZ',
  'Asia/Qyzylorda': 'KZ', 'Asia/Rangoon': 'MM', 'Asia/Riyadh': 'SA', 'Asia/Saigon': 'VN', 'Asia/Sakhalin': 'RU',
  'Asia/Samarkand': 'UZ', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Singapore': 'SG', 'Asia/Taipei': 'TW',
  'Asia/Tashkent': 'UZ', 'Asia/Tbilisi': 'GE', 'Asia/Tehran': 'IR', 'Asia/Thimphu': 'BT', 'Asia/Tokyo': 'JP',
  'Asia/Ulaanbaatar': 'MN', 'Asia/Urumqi': 'CN', 'Asia/Vladivostok': 'RU', 'Asia/Yakutsk': 'RU',
  'Asia/Yekaterinburg': 'RU', 'Asia/Yerevan': 'AM', 'Atlantic/Azores': 'PT', 'Atlantic/Canary': 'ES',
  'Atlantic/Cape_Verde': 'CV', 'Atlantic/Madeira': 'PT', 'Atlantic/Reykjavik': 'IS', 'Australia/Adelaide': 'AU',
  'Australia/Brisbane': 'AU', 'Australia/Canberra': 'AU', 'Australia/Darwin': 'AU', 'Australia/Hobart': 'AU',
  'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU', 'Australia/Sydney': 'AU', 'Europe/Amsterdam': 'NL',
  'Europe/Andorra': 'AD', 'Europe/Athens': 'GR', 'Europe/Belgrade': 'RS', 'Europe/Berlin': 'DE',
  'Europe/Bratislava': 'SK', 'Europe/Brussels': 'BE', 'Europe/Bucharest': 'RO', 'Europe/Budapest': 'HU',
  'Europe/Busingen': 'DE', 'Europe/Chisinau': 'MD', 'Europe/Copenhagen': 'DK', 'Europe/Dublin': 'IE',
  'Europe/Famagusta': 'CY', 'Europe/Helsinki': 'FI', 'Europe/Istanbul': 'TR', 'Europe/Kaliningrad': 'RU',
  'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Lisbon': 'PT', 'Europe/Ljubljana': 'SI', 'Europe/London': 'GB',
  'Europe/Luxembourg': 'LU', 'Europe/Madrid': 'ES', 'Europe/Malta': 'MT', 'Europe/Minsk': 'BY', 'Europe/Monaco': 'MC',
  'Europe/Moscow': 'RU', 'Europe/Oslo': 'NO', 'Europe/Paris': 'FR', 'Europe/Podgorica': 'ME', 'Europe/Prague': 'CZ',
  'Europe/Riga': 'LV', 'Europe/Rome': 'IT', 'Europe/Samara': 'RU', 'Europe/Sarajevo': 'BA', 'Europe/Skopje': 'MK',
  'Europe/Sofia': 'BG', 'Europe/Stockholm': 'SE', 'Europe/Tallinn': 'EE', 'Europe/Tirane': 'AL', 'Europe/Vienna': 'AT',
  'Europe/Vilnius': 'LT', 'Europe/Volgograd': 'RU', 'Europe/Warsaw': 'PL', 'Europe/Zagreb': 'HR', 'Europe/Zurich': 'CH',
  'Indian/Antananarivo': 'MG', 'Indian/Maldives': 'MV', 'Indian/Mauritius': 'MU', 'Indian/Reunion': 'RE',
  'Pacific/Auckland': 'NZ', 'Pacific/Chatham': 'NZ', 'Pacific/Fiji': 'FJ', 'Pacific/Galapagos': 'EC',
  'Pacific/Guadalcanal': 'SB', 'Pacific/Guam': 'GU', 'Pacific/Honolulu': 'US', 'Pacific/Noumea': 'NC',
  'Pacific/Pago_Pago': 'WS', 'Pacific/Palau': 'PW', 'Pacific/Port_Moresby': 'PG', 'Pacific/Tahiti': 'PF',
  'Pacific/Tongatapu': 'TO', 'Pacific/Wellington': 'NZ',
}

/** Maps an IANA timezone name to an approximate ISO-2 country (or null). */
export function approximateCountryFromTimezone(timeZone: string | null | undefined): string | null {
  if (typeof timeZone !== 'string') return null
  const mapped = TIMEZONE_COUNTRY_MAP[timeZone]
  return mapped ? normalizeCountryCode(mapped) : null
}

/**
 * Resolves the visitor's approximate country from the browser timezone.
 * Synchronous, offline, and fail-safe: any problem yields null (no
 * location shown) rather than an error or a guess.
 */
export function resolveApproximateCountry(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return approximateCountryFromTimezone(timeZone)
  } catch {
    return null
  }
}
