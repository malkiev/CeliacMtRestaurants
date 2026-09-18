// Council/locality names: https://address.gov.mt/localities/
// Existing directory areas (Armier and Mġarr, Gozo) are retained as choices.
export const LOCALITIES: Record<'Malta' | 'Gozo', string[]> = {
  Malta: [
    'Attard',
    'Balzan',
    'Birgu',
    'Birkirkara',
    'Birżebbuġa',
    'Bormla',
    'Dingli',
    'Fgura',
    'Floriana',
    'Għargħur',
    'Għaxaq',
    'Gudja',
    'Gżira',
    'Ħamrun',
    'Iklin',
    'Kalkara',
    'Kirkop',
    'Lija',
    'Luqa',
    'Marsa',
    'Marsaskala',
    'Marsaxlokk',
    'Mdina',
    'Mellieħa',
    'Mġarr',
    'Mosta',
    'Mqabba',
    'Msida',
    'Mtarfa',
    'Naxxar',
    'Paola',
    'Pembroke',
    'Pietà',
    'Qormi',
    'Qrendi',
    'Rabat',
    'Safi',
    'San Ġiljan',
    'San Ġwann',
    'San Pawl il-Baħar',
    'Santa Luċija',
    'Santa Venera',
    'Senglea',
    'Siġġiewi',
    'Sliema',
    'Swieqi',
    "Ta' Xbiex",
    'Tarxien',
    'Valletta',
    'Xgħajra',
    'Żabbar',
    'Żebbuġ',
    'Żejtun',
    'Żurrieq',
    'Armier',
    'Baħar iċ-Ċagħaq',
    'Bubaqra',
    'Burmarrad',
    'Fleur-de-Lys',
    'Gwardamanġa',
    'Ħal Farruġ',
    'Baħrija',
    'Swatar',
    'Kappara',
    'Madliena',
    'Paceville',
    "St Peter's",
    'Tal-Virtù',
  ],
  Gozo: [
    'Fontana',
    'Għajnsielem',
    'Għarb',
    'Għasri',
    'Kerċem',
    'Munxar',
    'Nadur',
    'Qala',
    'San Lawrenz',
    'Sannat',
    'Victoria (Rabat)',
    'Xagħra',
    'Xewkija',
    'Żebbuġ',
    'Marsalforn',
    'Xlendi',
    'Santa Luċija',
    'Mġarr',
  ],
};
for (const values of Object.values(LOCALITIES)) values.sort((a, b) => a.localeCompare(b, 'en'));
const key = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ħ/gi, 'h')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .trim();
export function normaliseLocality(value: string, island: 'Malta' | 'Gozo') {
  const aliases: Record<string, string> = {
    'st julians': 'San Ġiljan',
    'st julian': 'San Ġiljan',
    'san pawl': 'San Pawl il-Baħar',
    marsascala: 'Marsaskala',
    'l-armier': 'Armier',
  };
  if (island === 'Gozo' && ['rabat', 'victoria'].includes(key(value))) return 'Victoria (Rabat)';
  return (
    LOCALITIES[island].find((locality) => key(locality) === key(value)) ||
    aliases[key(value)] ||
    value.trim()
  );
}
export function localityLabel(value: string) {
  return value === 'San Ġiljan'
    ? "St Julian's (San Ġiljan)"
    : value === 'San Pawl il-Baħar'
      ? "St Paul's Bay (San Pawl il-Baħar)"
      : value;
}
export const MENU_OPTIONS = [
  { value: 'dedicated_menu', label: 'Dedicated gluten-free menu' },
  { value: 'clearly_marked', label: 'Gluten is clearly marked on the menu' },
  { value: 'on_request', label: 'Items can be made gluten-free on request' },
  { value: 'unknown', label: "I don't know" },
] as const;
