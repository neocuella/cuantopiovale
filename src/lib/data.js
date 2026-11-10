// Los CSV de data/ entran al bundle en el build (no hay cifras en el código).
import caso from '../../data/caso.csv?raw';
import casoFuentes from '../../data/caso_fuentes.csv?raw';
import tipoDeCambio from '../../data/tipo_de_cambio.csv?raw';
import items from '../../data/items.csv?raw';
import precios from '../../data/precios.csv?raw';
import referencias from '../../data/referencias.csv?raw';
import hitos from '../../data/hitos.csv?raw';
import { parseCsv } from './csv.js';
import { buildModel } from './model.js';

export const DATA_FILES = [
  ['caso.csv', 'Componentes de la cifra'],
  ['caso_fuentes.csv', 'Notas de prensa de la cifra'],
  ['tipo_de_cambio.csv', 'Tipo de cambio'],
  ['items.csv', 'Cosas para comparar'],
  ['precios.csv', 'Precios y fuentes'],
  ['referencias.csv', 'Datos de escala'],
  ['hitos.csv', 'Hitos de la línea de tiempo'],
  ['README.md', 'Cómo se calcula'],
];

export const tables = {
  caso: parseCsv(caso),
  caso_fuentes: parseCsv(casoFuentes),
  tipo_de_cambio: parseCsv(tipoDeCambio),
  items: parseCsv(items),
  precios: parseCsv(precios),
  referencias: parseCsv(referencias),
  hitos: parseCsv(hitos),
};

export const model = buildModel(tables);
