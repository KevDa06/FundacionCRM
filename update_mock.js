const fs = require('fs');
let content = fs.readFileSync('src/services/mockSupabaseClient.js', 'utf8');

const initialDestinaciones = `
const INITIAL_DESTINACIONES = [
  { id: 'dest-001', nombre: 'General' },
  { id: 'dest-002', nombre: 'Apadrinamiento' },
  { id: 'dest-003', nombre: 'Fondo de Emergencia' },
  { id: 'dest-004', nombre: 'Educación y Becas' }
];
`;

content = content.replace('const INITIAL_DONANTES', initialDestinaciones + '\nconst INITIAL_DONANTES');

content = content.replace(
  'recordatorios_donacion: INITIAL_RECORDATORIOS',
  'recordatorios_donacion: INITIAL_RECORDATORIOS,\n    destinaciones: INITIAL_DESTINACIONES'
);

fs.writeFileSync('src/services/mockSupabaseClient.js', content);
