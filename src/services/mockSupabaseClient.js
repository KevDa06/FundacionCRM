/**
 * Mock Supabase Client
 * Provee persistencia local (localStorage) y emulación completa de las operaciones de Supabase
 * EXCLUSIVAMENTE para entornos de desarrollo (NODE_ENV=development) o cuando VITE_ENABLE_MOCK=true.
 * 
 * Este cliente está desacoplado y NUNCA se inicializa en producción.
 */

const memoryStorage = new Map();

function getStorageItem(key, defaultValue) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(key);
      if (stored) return JSON.parse(stored);
    }
  } catch (_e) { /* ignore */ }
  if (memoryStorage.has(key)) return memoryStorage.get(key);
  return defaultValue;
}

function setStorageItem(key, value) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (_e) { /* ignore */ }
  memoryStorage.set(key, value);
}

const INITIAL_PROFILES = [
  {
    id: 'admin-001',
    email: 'admin@fundacion.local',
    documento: 'admin',
    nombre: 'Administrador General',
    rol: 'admin',
    activo: true,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  },
  {
    id: 'operador-001',
    email: 'operador@fundacion.local',
    documento: '1234567890',
    nombre: 'Carlos Operador',
    rol: 'operador',
    activo: true,
    created_at: '2025-02-15T10:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  }
];

const _formatFechaHoy = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const _formatFechaRelativa = (offsetDias) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const INITIAL_DESTINACIONES = [
  { id: 'dest-001', nombre: 'General' },
  { id: 'dest-002', nombre: 'Apadrinamiento' },
  { id: 'dest-003', nombre: 'Fondo de Emergencia' },
  { id: 'dest-004', nombre: 'Educación y Becas' }
];

const INITIAL_DONANTES = [
  {
    id: 'donante-001',
    nombre: 'María Camila Restrepo',
    tipo: 'Natural',
    documento: '1020304050',
    correo: 'maria.restrepo@example.com',
    telefono: '3101234567',
    periodicidad: 'Mensual',
    estado: 'Activo',
    fecha_nac: '1990-05-14',
    fecha_registro: '2025-01-10',
    nota: 'Donante comprometida con el programa de becas.',
    created_at: '2025-01-10T10:00:00.000Z'
  },
  {
    id: 'donante-002',
    nombre: 'Inversiones y Alimentos SAS',
    tipo: 'Juridica',
    documento: '900555444-1',
    correo: 'donaciones@alimentos.com',
    telefono: '6012345678',
    periodicidad: 'Mensual',
    estado: 'Activo',
    fecha_nac: null,
    fecha_registro: '2025-02-01',
    nota: 'Donación corporativa para el comedor comunitario.',
    created_at: '2025-02-01T12:00:00.000Z'
  },
  {
    id: 'donante-003',
    nombre: 'Andrés Felipe Gómez',
    tipo: 'Natural',
    documento: '79888999',
    correo: 'andres.gomez@example.com',
    telefono: '3159876543',
    periodicidad: 'Ocasional',
    estado: 'Activo',
    fecha_nac: '1985-09-12',
    fecha_registro: '2025-03-15',
    nota: 'Aporte para eventos de fin de año y emergencias.',
    created_at: '2025-03-15T15:30:00.000Z'
  },
  {
    id: 'donante-004',
    nombre: 'Gloria Inés Morales',
    tipo: 'Natural',
    documento: '52333444',
    correo: 'gloria.morales@example.com',
    telefono: '3004445566',
    periodicidad: 'Mensual',
    estado: 'Activo',
    fecha_nac: '1978-09-08',
    fecha_registro: '2024-11-20',
    nota: 'Donante activa de larga trayectoria.',
    created_at: '2024-11-20T08:00:00.000Z'
  },
  {
    id: 'donante-005',
    nombre: 'Pedro Antonio Salazar',
    tipo: 'Natural',
    documento: '14888222',
    correo: 'pedro.salazar@example.com',
    telefono: '3128889900',
    periodicidad: 'Anual',
    estado: 'Inactivo',
    fecha_nac: '1965-03-22',
    fecha_registro: '2024-06-10',
    nota: 'Pendiente de llamada para renovación de suscripción anual.',
    created_at: '2024-06-10T14:20:00.000Z'
  }
];

const INITIAL_RECORDATORIOS = [
  {
    id: 'rec-001',
    donante_id: 'donante-001',
    fecha_recordatorio: _formatFechaHoy(),
    estado_recordatorio: 'Pendiente',
    monto_recordatorio: 250000,
    nota_recordatorio: 'Aporte mensual programa de becas escolares',
    created_at: '2025-01-10T10:00:00.000Z',
    updated_at: '2025-01-10T10:00:00.000Z'
  },
  {
    id: 'rec-002',
    donante_id: 'donante-002',
    fecha_recordatorio: _formatFechaRelativa(5),
    estado_recordatorio: 'Pendiente',
    monto_recordatorio: 1500000,
    nota_recordatorio: 'Donación corporativa comedor comunitario',
    created_at: '2025-02-01T12:00:00.000Z',
    updated_at: '2025-02-01T12:00:00.000Z'
  },
  {
    id: 'rec-003',
    donante_id: 'donante-003',
    fecha_recordatorio: _formatFechaRelativa(-3),
    estado_recordatorio: 'Pendiente',
    monto_recordatorio: 100000,
    nota_recordatorio: 'Aporte para campaña de útiles y emergencias',
    created_at: '2025-03-15T15:30:00.000Z',
    updated_at: '2025-03-15T15:30:00.000Z'
  },
  {
    id: 'rec-004',
    donante_id: 'donante-004',
    fecha_recordatorio: _formatFechaRelativa(12),
    estado_recordatorio: 'Mensaje enviado',
    monto_recordatorio: 180000,
    nota_recordatorio: 'Confirmó fecha de transferencia fin de mes',
    created_at: '2024-11-20T08:00:00.000Z',
    updated_at: '2024-11-20T08:00:00.000Z'
  }
];

const INITIAL_DONACIONES = [
  {
    id: 'don-001',
    donante_id: 'donante-001',
    monto: 250000,
    moneda_aporte: 'COP',
    fecha: '2026-09-01',
    medio: 'Transferencia',
    comprobante: 'TRF-9021',
    destinacion: 'Apadrinamiento',
    nota: 'Aporte mensual de educación',
    created_at: '2026-09-01T10:00:00.000Z'
  },
  {
    id: 'don-002',
    donante_id: 'donante-002',
    monto: 1500000,
    moneda_aporte: 'COP',
    fecha: '2026-09-02',
    medio: 'Transferencia',
    comprobante: 'TRF-9034',
    destinacion: 'Donación General',
    nota: 'Alimentación septiembre',
    created_at: '2026-09-02T11:30:00.000Z'
  },
  {
    id: 'don-003',
    donante_id: 'donante-003',
    monto: 100,
    moneda_aporte: 'USD',
    fecha: '2026-09-03',
    medio: 'Tarjeta',
    comprobante: 'CC-8821',
    destinacion: 'Fondo de Emergencia',
    nota: 'Donación internacional online',
    created_at: '2026-09-03T14:15:00.000Z'
  },
  {
    id: 'don-004',
    donante_id: 'donante-004',
    monto: 180000,
    moneda_aporte: 'COP',
    fecha: '2026-09-04',
    medio: 'PSE',
    comprobante: 'PSE-4401',
    destinacion: 'Apadrinamiento',
    nota: 'Aporte mensual apadrinamiento',
    created_at: '2026-09-04T09:40:00.000Z'
  },
  {
    id: 'don-005',
    donante_id: 'donante-001',
    monto: 250000,
    moneda_aporte: 'COP',
    fecha: '2026-08-01',
    medio: 'Transferencia',
    comprobante: 'TRF-8109',
    destinacion: 'Apadrinamiento',
    nota: 'Aporte mensual agosto',
    created_at: '2026-08-01T10:00:00.000Z'
  },
  {
    id: 'don-006',
    donante_id: 'donante-004',
    monto: 180000,
    moneda_aporte: 'COP',
    fecha: '2026-08-05',
    medio: 'PSE',
    comprobante: 'PSE-3920',
    destinacion: 'Apadrinamiento',
    nota: 'Aporte mensual agosto',
    created_at: '2026-08-05T09:40:00.000Z'
  }
];

const INITIAL_AUDITORIA = [
  {
    id: 'audit-001',
    tabla: 'donaciones',
    operacion: 'INSERT',
    registro_id: 'don-004',
    usuario_id: 'admin-001',
    usuario_nombre: 'Administrador General',
    usuario_documento: 'admin',
    usuario_email: 'admin@fundacion.local',
    datos_anteriores: null,
    datos_nuevos: { monto: 180000, moneda_aporte: 'COP', donante_id: 'donante-004' },
    created_at: '2026-09-04T09:40:00.000Z'
  },
  {
    id: 'audit-002',
    tabla: 'donantes',
    operacion: 'INSERT',
    registro_id: 'donante-001',
    usuario_id: 'admin-001',
    usuario_nombre: 'Administrador General',
    usuario_documento: 'admin',
    usuario_email: 'admin@fundacion.local',
    datos_anteriores: null,
    datos_nuevos: { nombre: 'María Camila Restrepo', documento: '1020304050' },
    created_at: '2025-01-10T10:00:00.000Z'
  }
];

function getTableData(tableName) {
  const defaults = {
    profiles: INITIAL_PROFILES,
    donantes: INITIAL_DONANTES,
    donaciones: INITIAL_DONACIONES,
    auditoria_operaciones: INITIAL_AUDITORIA,
    recordatorios_donacion: INITIAL_RECORDATORIOS,
    destinaciones: INITIAL_DESTINACIONES
  };
  const data = getStorageItem(`fundacion_db_${tableName}`, defaults[tableName] || []);
  return data;
}

function setTableData(tableName, data) {
  setStorageItem(`fundacion_db_${tableName}`, data);
}

class MockQueryBuilder {
  constructor(tableName, action = 'select', payload = null) {
    this.tableName = tableName;
    this.action = action;
    this.payload = payload;
    this.filters = [];
    this.orderClause = null;
    this.limitCount = null;
    this.isSingle = false;
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  ilike(column, pattern) {
    this.filters.push({ type: 'ilike', column, pattern });
    return this;
  }

  order(column, options = {}) {
    this.orderClause = { column, ascending: options.ascending !== false };
    return this;
  }

  select(cols = '*') {
    this.selectCols = cols;
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  async _execute() {
    const list = [...getTableData(this.tableName)];

    if (this.action === 'select') {
      let result = list.filter(item => {
        for (const f of this.filters) {
          if (f.type === 'eq') {
            if (String(item[f.column]) !== String(f.value)) return false;
          } else if (f.type === 'ilike') {
            const cleanPattern = String(f.pattern).replace(/[%_\\]/g, '').toLowerCase();
            const val = String(item[f.column] || '').toLowerCase();
            if (!val.includes(cleanPattern)) return false;
          }
        }
        return true;
      });

      if (this.orderClause) {
        const { column, ascending } = this.orderClause;
        result.sort((a, b) => {
          const valA = a[column] ?? '';
          const valB = b[column] ?? '';
          if (valA < valB) return ascending ? -1 : 1;
          if (valA > valB) return ascending ? 1 : -1;
          return 0;
        });
      }

      if (this.limitCount !== null) {
        result = result.slice(0, this.limitCount);
      }

      if (this.tableName === 'recordatorios_donacion') {
        const donantesList = getTableData('donantes');
        result = result.map(item => {
          const donante = donantesList.find(d => d.id === item.donante_id);
          return {
            ...item,
            donantes: donante ? {
              nombre: donante.nombre,
              documento: donante.documento,
              telefono: donante.telefono,
              correo: donante.correo
            } : null
          };
        });
      }

      if (this.isSingle) {
        return { data: result[0] || null, error: null };
      }
      return { data: result, error: null };
    }

    if (this.action === 'insert') {
      const itemsToInsert = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = itemsToInsert.map(item => ({
        id: item.id || `${this.tableName}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        created_at: item.created_at || new Date().toISOString(),
        ...item
      }));

      const updatedList = [...list, ...created];
      setTableData(this.tableName, updatedList);

      return {
        data: Array.isArray(this.payload) ? created : created[0],
        error: null
      };
    }

    if (this.action === 'update') {
      const updatedList = list.map(item => {
        const matches = this.filters.every(f => {
          if (f.type === 'eq') return String(item[f.column]) === String(f.value);
          return true;
        });
        if (matches) {
          return { ...item, ...this.payload, updated_at: new Date().toISOString() };
        }
        return item;
      });

      setTableData(this.tableName, updatedList);
      return { data: this.payload, error: null };
    }

    if (this.action === 'delete') {
      const remaining = list.filter(item => {
        const matches = this.filters.every(f => {
          if (f.type === 'eq') return String(item[f.column]) === String(f.value);
          return true;
        });
        return !matches;
      });

      setTableData(this.tableName, remaining);
      return { data: null, error: null };
    }

    return { data: null, error: null };
  }

  then(onFulfilled, onRejected) {
    return this._execute().then(onFulfilled, onRejected);
  }
}

const authListeners = new Set();

function notifyAuth(event, session) {
  authListeners.forEach(cb => {
    try { cb(event, session); } catch (e) { console.error('Error in auth listener:', e); }
  });
}

export function createMockSupabaseClient() {
  return {
    from(tableName) {
      return {
        select(cols = '*') {
          return new MockQueryBuilder(tableName, 'select');
        },
        insert(payload) {
          return new MockQueryBuilder(tableName, 'insert', payload);
        },
        update(payload) {
          return new MockQueryBuilder(tableName, 'update', payload);
        },
        delete() {
          return new MockQueryBuilder(tableName, 'delete');
        }
      };
    },

    auth: {
      onAuthStateChange(callback) {
        authListeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => authListeners.delete(callback)
            }
          }
        };
      },

      async getSession() {
        const session = getStorageItem('fundacion_mock_session', null);
        return { data: { session }, error: null };
      },

      async signInWithPassword({ email, password }) {
        const profiles = getTableData('profiles');
        const cleanEmail = String(email || '').trim().toLowerCase();

        const profile = profiles.find(p => {
          const pEmail = String(p.email || '').toLowerCase();
          const pDoc = String(p.documento || '').toLowerCase();
          return pEmail === cleanEmail || cleanEmail.startsWith(`${pDoc}@`) || pDoc === 'admin';
        }) || profiles[0];

        if (profile && profile.activo === false) {
          return { data: { user: null, session: null }, error: { message: 'Cuenta inactiva' } };
        }

        const session = {
          access_token: `mock-token-${Date.now()}`,
          token_type: 'bearer',
          user: {
            id: profile.id,
            email: profile.email,
            user_metadata: {
              nombre: profile.nombre,
              documento: profile.documento
            }
          }
        };

        setStorageItem('fundacion_mock_session', session);
        notifyAuth('SIGNED_IN', session);
        return { data: { user: session.user, session }, error: null };
      },

      async signOut() {
        setStorageItem('fundacion_mock_session', null);
        notifyAuth('SIGNED_OUT', null);
        return { error: null };
      }
    },

    async rpc(fnName, args = {}) {
      if (fnName === 'obtener_login_info') {
        const pDoc = String(args.p_documento || '').trim().toLowerCase();
        const profiles = getTableData('profiles');
        const profile = profiles.find(p => {
          const doc = String(p.documento || '').toLowerCase();
          const em = String(p.email || '').toLowerCase();
          return doc === pDoc || em === pDoc || (pDoc === 'admin' && doc === 'admin');
        });

        if (profile) {
          return { data: { encontrado: true, activo: profile.activo, email: profile.email }, error: null };
        }
        return { data: { encontrado: false }, error: null };
      }

      if (fnName === 'importar_donaciones_batch') {
        const items = args.donaciones_json || [];
        const current = getTableData('donaciones');
        const toAdd = items.map((it, idx) => ({
          id: it.id || `don-imp-${Date.now()}-${idx}`,
          created_at: new Date().toISOString(),
          ...it
        }));
        setTableData('donaciones', [...current, ...toAdd]);
        return { data: { insertadas: toAdd.length }, error: null };
      }

      if (fnName === 'admin_cambiar_password') {
        return { data: { success: true }, error: null };
      }

      return { data: null, error: null };
    },

    functions: {
      async invoke(fnName, { body = {} } = {}) {
        if (fnName === 'gestion-usuarios') {
          if (body.accion === 'crear') {
            const profiles = getTableData('profiles');
            const newProf = {
              id: `usr-${Date.now()}`,
              email: `${body.documento}@auth.fundacion.local`,
              documento: body.documento,
              nombre: body.nombre,
              rol: body.rol || 'operador',
              activo: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            setTableData('profiles', [newProf, ...profiles]);
            return { data: { success: true, user: newProf }, error: null };
          }
        }
        return { data: { success: true }, error: null };
      }
    }
  };
}
