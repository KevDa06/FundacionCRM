/**
 * Catálogo de Tutoriales Interactivos y Reglas RBAC (FundaciónCRM)
 * Módulo puro (sin dependencias DOM) para definir secciones, pasos guiados,
 * ejemplos prácticos y filtrado estricto según los permisos del rol actual.
 */
import { VISTAS } from '../../config/constants.js';

export const CATEGORIAS_TUTORIAL = [
    { id: 'inicio', titulo: 'Inicio y navegación' },
    { id: 'operacion', titulo: 'Gestión diaria del libro' },
    { id: 'herramientas', titulo: 'Datos y catálogos' },
    { id: 'administracion', titulo: 'Administración del sistema' }
];

/**
 * Definición integral de tutoriales por sección.
 * Cada sección y cada paso puede declarar:
 * - roles: string[] (ej. ['lector'] o ['admin', 'operador'])
 * - permiso: string (verificado con tienePermiso)
 * - permisosAny: string[] (al menos uno)
 */
export const TUTORIAL_SECCIONES = [
    {
        id: 'navegacion',
        titulo: 'Navegación y controles principales',
        subtitulo: 'Cómo moverte por los módulos, cambiar la moneda contable y revisar novedades.',
        icono: 'fa-compass',
        categoria: 'inicio',
        vista: null,
        pasos: [
            {
                id: 'nav-menu-btn',
                setup: 'closeSidebar',
                target: '#btn-menu-sidebar',
                placement: 'bottom',
                titulo: 'Abrir el menú principal',
                queEs: 'Este botón abre el menú lateral desde cualquier pantalla de la aplicación.',
                comoUsar: [
                    'Haz clic en el botón de las tres líneas en la esquina superior izquierda.',
                    'Elige la sección a la que quieras ir y el menú se cerrará automáticamente.'
                ],
                ejemplo: 'Si estás revisando el tablero general y quieres consultar un comprobante, abre este menú y entra a Donaciones.'
            },
            {
                id: 'nav-sidebar-modulos',
                setup: 'openSidebar',
                target: '#sidebar-nav',
                placement: 'right',
                titulo: 'Módulos disponibles para tu perfil',
                queEs: 'Aquí aparecen únicamente las secciones habilitadas según tu rol dentro de la fundación.',
                comoUsar: [
                    'Selecciona cualquier módulo de la lista para cambiar de vista al instante.',
                    'Los contadores en Cumpleaños y Alertas te avisan cuántos casos requieren atención.'
                ],
                ejemplo: 'Si ves un número en rojo junto a Alertas y compromisos, entra ahí para revisar quién lleva tiempo sin aportar.'
            },
            {
                id: 'nav-usuario-sesion',
                setup: 'openSidebar',
                target: '#sidebar-user-badge',
                placement: 'right',
                titulo: 'Tu perfil y cierre de sesión',
                queEs: 'Muestra tu nombre, documento y rol actual junto al acceso rápido para cerrar sesión de forma segura.',
                comoUsar: [
                    'Verifica en la tarjeta inferior con qué usuario y permisos estás operando.',
                    'Pulsa el icono rojo de salida a la derecha cuando termines tu jornada para bloquear el sistema.'
                ],
                ejemplo: 'Si compartes el equipo en la oficina, usa el botón de salida al retirarte para proteger la información de los donantes.'
            },
            {
                id: 'nav-moneda',
                setup: 'closeSidebar',
                target: '#selector-moneda',
                placement: 'bottom',
                titulo: 'Moneda contable de visualización',
                queEs: 'Te permite ver las cifras totales y tablas convertidas a pesos colombianos (COP), dólares (USD) o euros (EUR) desde la barra superior.',
                comoUsar: [
                    'Abre el selector de moneda en la barra superior derecha.',
                    'Elige la divisa en la que deseas consultar los valores del tablero y las tablas.'
                ],
                ejemplo: 'Si una junta directiva te pide el recaudo del mes en dólares, cambia a USD sin modificar los registros originales.'
            },
            {
                id: 'nav-resumen-campana',
                setup: 'closeSidebar',
                target: '#btn-resumen-header',
                placement: 'bottom',
                titulo: 'Centro operativo y novedades',
                queEs: 'La campana reúne en un solo resumen los donantes pendientes de aporte, próximas donaciones en 3 días, recordatorios y cumpleaños de la semana.',
                comoUsar: [
                    'Haz clic en la campana superior cuando quieras ver el panorama del día.',
                    'Usa los botones dentro de cada tarjeta para ir directo a la lista correspondiente.'
                ],
                ejemplo: 'Al iniciar tu jornada, abre la campana para ver cuántos donantes cumplen años hoy o tienen compromiso esta semana.'
            },
            {
                id: 'nav-estado-db',
                setup: 'closeSidebar',
                target: '#btn-config-db-header',
                placement: 'bottom',
                titulo: 'Estado de conexión y respaldo',
                queEs: 'Muestra si la aplicación está sincronizada en línea con la base de datos o trabajando en modo local demostrativo.',
                comoUsar: [
                    'Observa el punto de color junto al texto en la parte superior derecha.',
                    'Haz clic si necesitas revisar o ajustar la conexión a la base de datos.'
                ],
                ejemplo: 'Antes de una jornada de registro importante, verifica que el indicador diga sistema en línea.'
            }
        ]
    },
    {
        id: 'dashboard',
        titulo: 'Tablero general',
        subtitulo: 'Lectura rápida de recaudación, donantes activos, gráficos cronológicos y medios de pago.',
        icono: 'fa-chart-pie',
        categoria: 'operacion',
        vista: VISTAS.DASHBOARD,
        pasos: [
            {
                id: 'dash-kpis',
                vista: VISTAS.DASHBOARD,
                target: '#dashboard-kpi-strip',
                placement: 'bottom',
                titulo: 'Indicadores principales del libro',
                queEs: 'Resume en cuatro cifras clave el total histórico recaudado, los donantes activos, el recaudo del período elegido y los casos en seguimiento.',
                comoUsar: [
                    'Revisa "Total recaudado" para conocer el acumulado histórico completo.',
                    'Compara "Mes seleccionado" con tus metas y revisa "En seguimiento" si sube la cifra.'
                ],
                ejemplo: 'Si ves "En seguimiento: 4", significa que hay 4 donantes que superaron su fecha esperada de aporte o aún no registran donaciones.'
            },
            {
                id: 'dash-acciones',
                vista: VISTAS.DASHBOARD,
                permisosAny: ['crear_donaciones', 'crear_donantes'],
                target: '#dashboard-acciones-rapidas',
                placement: 'bottom',
                titulo: 'Botones de registro rápido',
                queEs: 'Atajos directos para registrar un nuevo aporte o crear la ficha de un donante sin salir del tablero.',
                comoUsar: [
                    'Pulsa "Registrar aporte" cuando acabes de recibir una transferencia o efectivo.',
                    'Pulsa "Nuevo donante" para inscribir a una persona o empresa antes de cargar su primer aporte.'
                ],
                ejemplo: 'Si un benefactor nuevo hace una transferencia por Nequi, primero regístralo con "Nuevo donante" y luego carga el ingreso con "Registrar aporte".'
            },
            {
                id: 'dash-filtros-grafico',
                vista: VISTAS.DASHBOARD,
                target: '#dashboard-filtros-grafico',
                placement: 'bottom',
                titulo: 'Evolución y filtros del gráfico',
                queEs: 'Controla cómo se agrupan las barras o líneas de ingresos según el período que necesites analizar.',
                comoUsar: [
                    'Elige entre vista Mensual (por días), Trimestral (por semanas) o Anual (por meses).',
                    'Ajusta el año, el mes o el trimestre y cambia entre gráfico de Barras o Línea.'
                ],
                ejemplo: 'Selecciona "Anual (por meses)" y el año actual para comparar en qué mes hubo mayor recaudación.'
            },
            {
                id: 'dash-medios-pago',
                vista: VISTAS.DASHBOARD,
                target: '#chart-medios-pago',
                placement: 'left',
                titulo: 'Distribución por medios de pago',
                queEs: 'Muestra qué canales prefieren los donantes (transferencia, efectivo, PSE / Nequi / Daviplata, tarjeta, entre otros) en el período seleccionado.',
                comoUsar: [
                    'Pasa el cursor sobre cada segmento del anillo para ver el monto exacto por canal.',
                    'Cambia el mes o el año en el panel izquierdo para actualizar también este gráfico.'
                ],
                ejemplo: 'Puedes comprobar rápidamente cuánto ingresó por PSE / Nequi / Daviplata frente a transferencias bancarias en el mes.'
            }
        ]
    },
    {
        id: 'donantes',
        titulo: 'Directorio de donantes',
        subtitulo: 'Búsqueda, filtros, ficha 360° de benefactores y gestión de su información.',
        icono: 'fa-users',
        categoria: 'operacion',
        vista: VISTAS.DONANTES,
        permiso: 'ver_donantes',
        pasos: [
            {
                id: 'donantes-crear',
                vista: VISTAS.DONANTES,
                permiso: 'crear_donantes',
                target: '#btn-nuevo-donante',
                placement: 'bottom',
                titulo: 'Crear un nuevo donante',
                queEs: 'Abre el formulario para inscribir una persona natural o jurídica con sus datos de contacto, cumpleaños y periodicidad de aporte.',
                comoUsar: [
                    'Haz clic en "Nuevo donante" y selecciona si es Persona natural o Persona jurídica.',
                    'Completa el nombre o razón social, documento o NIT, teléfono, periodicidad y estado.'
                ],
                ejemplo: 'Si María Fernanda aporta $80.000 cada mes, guárdala como Persona natural con periodicidad "Mensual" y estado "Activo".'
            },
            {
                id: 'donantes-filtros',
                vista: VISTAS.DONANTES,
                target: '#donantes-filtros-barra',
                placement: 'bottom',
                titulo: 'Buscar y segmentar el directorio',
                queEs: 'Combina búsqueda por texto con filtros de tipo, periodicidad y estado para encontrar donantes en segundos.',
                comoUsar: [
                    'Escribe un nombre, documento o NIT en el buscador.',
                    'Usa "Toda periodicidad" -> "Próximas (≤ 3 días)" para ver aportes esperados muy pronto, o filtra "Con campos faltantes" para completar fichas incompletas.'
                ],
                ejemplo: 'Elige "Con campos faltantes" en el filtro de estado si quieres revisar a qué donantes les falta correo, teléfono o fecha de nacimiento.'
            },
            {
                id: 'donantes-tabla-crud',
                vista: VISTAS.DONANTES,
                permisosAny: ['editar_donantes', 'eliminar_donantes'],
                target: '#tabla-donantes-wrap',
                placement: 'top',
                titulo: 'Ficha 360° y acciones por fila',
                queEs: 'Muestra cada donante con su documento, contacto, periodicidad, estado y botones para consultar, editar o eliminar.',
                comoUsar: [
                    'Haz clic en el nombre o en el ícono de detalle (ojo) para abrir la ficha 360° con su historial y total aportado.',
                    'Usa el ícono de editar para actualizar teléfono o periodicidad, o el de eliminar si necesitas retirar un registro erróneo.'
                ],
                ejemplo: 'Antes de llamar a un benefactor, abre su ficha 360° para ver cuándo fue su última donación y si tiene notas guardadas.'
            },
            {
                id: 'donantes-tabla-lector',
                vista: VISTAS.DONANTES,
                roles: ['lector'],
                target: '#tabla-donantes-wrap',
                placement: 'top',
                titulo: 'Consulta de donantes y ficha 360°',
                queEs: 'Presenta el directorio en modo solo lectura para verificar datos de contacto, periodicidad y trayectoria de cada benefactor.',
                comoUsar: [
                    'Revisa la columna de contacto, periodicidad y estado directamente en la tabla.',
                    'Pulsa el ícono de detalle (ojo) en la columna Acciones para abrir la ficha completa del donante y consultar su historial.'
                ],
                ejemplo: 'Si necesitas confirmar el historial anual de un donante para un informe, abre su ficha 360° y filtra sus aportes por año.'
            }
        ]
    },
    {
        id: 'donaciones',
        titulo: 'Registro de donaciones',
        subtitulo: 'Historial de aportes, filtros por destinación o mes y emisión de recibos.',
        icono: 'fa-receipt',
        categoria: 'operacion',
        vista: VISTAS.DONACIONES,
        permiso: 'ver_donaciones',
        pasos: [
            {
                id: 'donaciones-crear',
                vista: VISTAS.DONACIONES,
                permiso: 'crear_donaciones',
                target: '#btn-registrar-donacion',
                placement: 'bottom',
                titulo: 'Registrar un nuevo aporte',
                queEs: 'Permite anotar una donación recibida asociándola a un donante, con fecha, valor, moneda, medio de pago, destinación y comprobante.',
                comoUsar: [
                    'Haz clic en "Registrar aporte" y selecciona el donante en la lista.',
                    'Ingresa la fecha, el monto, el medio de pago, la destinación y guarda el comprobante.'
                ],
                ejemplo: 'Cuando recibas una transferencia de $200.000 para "Útiles Escolares", selecciónalo en Destinación y anota el número de referencia bancaria.'
            },
            {
                id: 'donaciones-filtros',
                vista: VISTAS.DONACIONES,
                target: '#donaciones-filtros-barra',
                placement: 'bottom',
                titulo: 'Filtrar aportes por comprobante, causa o mes',
                queEs: 'Facilita ubicar donaciones específicas sin recorrer todo el historial.',
                comoUsar: [
                    'Escribe un número de comprobante o palabra clave de notas en el buscador.',
                    'Filtra por una destinación específica o selecciona un mes en el selector de fecha (usa la X para limpiar el mes).'
                ],
                ejemplo: 'Para cuadrar caja de octubre, selecciona octubre en el filtro "Mes" y revisa solo los aportes de ese período.'
            },
            {
                id: 'donaciones-tabla-crud',
                vista: VISTAS.DONACIONES,
                permisosAny: ['editar_donaciones', 'eliminar_donaciones'],
                target: '#tabla-donaciones-wrap',
                placement: 'top',
                titulo: 'Comprobantes oficiales y edición',
                queEs: 'Lista cada ingreso cronológicamente con acciones para imprimir el recibo oficial, corregir un dato o anular un registro.',
                comoUsar: [
                    'Pulsa el botón de impresora/recibo en la fila para generar el Recibo Oficial de la donación.',
                    'Si cometiste un error de monto o comprobante, usa el botón de editar para corregirlo.'
                ],
                ejemplo: 'Si un donante solicita su soporte de aporte apenas realiza el pago, ubica la fila y pulsa Imprimir recibo.'
            },
            {
                id: 'donaciones-tabla-lector',
                vista: VISTAS.DONACIONES,
                roles: ['lector'],
                target: '#tabla-donaciones-wrap',
                placement: 'top',
                titulo: 'Consulta de aportes y recibo oficial',
                queEs: 'Permite verificar cada aporte registrado con su fecha, valor, medio de pago, destinación y soporte de comprobante.',
                comoUsar: [
                    'Consulta el detalle de cada fila directamente en el libro.',
                    'Usa el botón de recibo en la columna Acciones si necesitas visualizar o imprimir el comprobante oficial de un aporte.'
                ],
                ejemplo: 'Para auditar un comprobante específico, búscalo por referencia arriba y revisa la fila correspondiente.'
            }
        ]
    },
    {
        id: 'seguimiento',
        titulo: 'Seguimiento de cumplimiento',
        subtitulo: 'Control de donantes con periodicidad fija (quién donó y quién falta) y donantes ocasionales.',
        icono: 'fa-clipboard-check',
        categoria: 'operacion',
        vista: VISTAS.SEGUIMIENTO,
        permiso: 'ver_seguimiento',
        pasos: [
            {
                id: 'seg-filtros',
                vista: VISTAS.SEGUIMIENTO,
                subtab: 'periodicos',
                target: '#seguimiento-filtros-periodo',
                placement: 'bottom',
                titulo: 'Elegir el período de control',
                queEs: 'Define el marco de tiempo (Mensual, Semanal, Trimestral o Anual) sobre el cual quieres medir el cumplimiento.',
                comoUsar: [
                    'Selecciona el Año y el Tipo de período en las listas superiores.',
                    'Ajusta el mes, la semana o el trimestre que aparece automáticamente según tu elección.'
                ],
                ejemplo: 'Si haces corte los viernes, cambia "Período de seguimiento" a "Semanal" y elige la semana en curso.'
            },
            {
                id: 'seg-kpis',
                vista: VISTAS.SEGUIMIENTO,
                subtab: 'periodicos',
                target: '#seguimiento-kpis-panel',
                placement: 'bottom',
                titulo: 'Resumen de cumplimiento y porcentaje',
                queEs: 'Compara cuántos donadores con periodicidad fija ya cumplieron su aporte frente a los que aún están pendientes.',
                comoUsar: [
                    'Revisa "Donaron" y "No Donaron" junto con su porcentaje de cumplimiento.',
                    'Verifica en "Total Recaudado" el monto acumulado en ese corte.'
                ],
                ejemplo: 'Si tienes 40 donadores esperados y 32 ya aportaron, verás un 80% de cumplimiento en verde y 8 pendientes en carmín.'
            },
            {
                id: 'seg-vista-donaron',
                vista: VISTAS.SEGUIMIENTO,
                subtab: 'periodicos',
                target: '#seguimiento-filtro-vista-donaron',
                placement: 'bottom',
                titulo: 'Alternar entre Donaron y No donaron',
                queEs: 'Te permite cambiar la tabla entre los donantes que ya aportaron en el período y los que faltan por aportar.',
                comoUsar: [
                    'Haz clic en "No donaron" para ver la lista exacta de donantes pendientes en ese corte.',
                    'Usa el buscador de la derecha para localizar rápidamente a un donante específico.'
                ],
                ejemplo: 'Al cierre de mes, pulsa "No donaron" para enviar un recordatorio cordial por WhatsApp desde la columna Acción.'
            },
            {
                id: 'seg-ocasionales',
                vista: VISTAS.SEGUIMIENTO,
                subtab: 'ocasionales',
                target: '#btn-subtab-ocasionales',
                placement: 'bottom',
                titulo: 'Informe de donantes ocasionales',
                queEs: 'Separa a los benefactores sin compromiso fijo para consultar sus aportes eventuales sin afectar las métricas de cumplimiento periódico.',
                comoUsar: [
                    'Haz clic en la pestaña "Donantes Ocasionales".',
                    'Filtra por período activo, trimestre, año o histórico completo para ver cuántas donaciones ha hecho cada uno.'
                ],
                ejemplo: 'Úsalo para identificar donantes ocasionales frecuentes a quienes podrías invitar a un plan mensual.'
            },
            {
                id: 'seg-exportar',
                vista: VISTAS.SEGUIMIENTO,
                subtab: 'periodicos',
                permiso: 'exportar_excel',
                target: '#btn-exportar-seguimiento',
                placement: 'bottom',
                titulo: 'Descargar informe en Excel',
                queEs: 'Genera un archivo .xlsx con el resumen de cumplimiento, la lista de quienes donaron y no donaron, y los ocasionales.',
                comoUsar: [
                    'Configura primero el año y período que deseas reportar.',
                    'Haz clic en "Descargar Informe" para guardar el archivo listo para compartir en reuniones.'
                ],
                ejemplo: 'Al terminar el trimestre, descarga el informe de seguimiento para presentarlo en el comité directivo.'
            }
        ]
    },
    {
        id: 'cumpleanos',
        titulo: 'Cumpleaños de donantes',
        subtitulo: 'Agenda de fechas especiales y envío directo de felicitaciones por WhatsApp.',
        icono: 'fa-cake-candles',
        categoria: 'operacion',
        vista: VISTAS.CUMPLEANOS,
        permiso: 'ver_cumpleanos',
        pasos: [
            {
                id: 'cumple-filtro',
                vista: VISTAS.CUMPLEANOS,
                target: '#cumpleanos-filtro-dias',
                placement: 'bottom',
                titulo: 'Seleccionar ventana de cumpleaños',
                queEs: 'Filtra el listado para ver cumpleaños en los próximos 7, 15 o 30 días, este mes o todos los meses del año.',
                comoUsar: [
                    'Abre el selector "Ver" en la esquina superior derecha del módulo.',
                    'Escoge "Próximos 7 días" para planificar saludos de la semana o "Todos los meses" para revisar la agenda anual.'
                ],
                ejemplo: 'Cada lunes, selecciona "Próximos 7 días" para preparar los saludos de la semana.'
            },
            {
                id: 'cumple-kpis',
                vista: VISTAS.CUMPLEANOS,
                target: '#cumpleanos-kpis',
                placement: 'bottom',
                titulo: 'Contadores rápidos de fechas',
                queEs: 'Te muestra cuántos donantes cumplen años hoy, esta semana, este mes y cuántos tienen fecha de nacimiento registrada.',
                comoUsar: [
                    'Fíjate primero en "Cumpleaños Hoy" para no dejar pasar ninguna felicitación del día.',
                    'Compara "Con Fecha Registrada" frente al total de donantes para saber si conviene pedir ese dato en próximas llamadas.'
                ],
                ejemplo: 'Si "Cumpleaños Hoy" marca 2, revisa las dos primeras filas de la tabla inferior.'
            },
            {
                id: 'cumple-tabla',
                vista: VISTAS.CUMPLEANOS,
                target: '#tabla-cumpleanos-wrap',
                placement: 'top',
                titulo: 'Lista de cumpleañeros y saludo por WhatsApp',
                queEs: 'Ordena los cumpleaños del más cercano al más lejano con edad a cumplir, teléfono y acceso directo de felicitación.',
                comoUsar: [
                    'Usa el buscador "Próximos Cumpleañeros" si buscas a una persona por nombre o documento.',
                    'Pulsa el botón de WhatsApp en la columna "Felicitar" para abrir un mensaje personalizado listo para enviar.'
                ],
                ejemplo: 'Si el botón aparece disponible, al pulsarlo se abre WhatsApp con un saludo cordial con el nombre del benefactor.'
            }
        ]
    },
    {
        id: 'alertas',
        titulo: 'Alertas y recordatorios',
        subtitulo: 'Detección de donantes ausentes y agenda de compromisos de donación.',
        icono: 'fa-bell',
        categoria: 'operacion',
        vista: VISTAS.ALERTAS,
        permiso: 'ver_retencion',
        pasos: [
            {
                id: 'alertas-subtab',
                vista: VISTAS.ALERTAS,
                subtab: 'alertas',
                target: '#btn-subtab-alertas-retencion',
                placement: 'bottom',
                titulo: 'Centro de retención (Alertas)',
                queEs: 'Detecta automáticamente donantes activos cuya periodicidad esperada ya venció o que aún no tienen donaciones registradas.',
                comoUsar: [
                    'Revisa en la tabla la fecha de última donación y los días de ausencia acumulados.',
                    'Utiliza el botón de contacto en la fila para retomar la comunicación con el benefactor.'
                ],
                ejemplo: 'Si un donante mensual hizo su último aporte hace 75 días, aparecerá aquí para hacerle seguimiento oportuno.'
            },
            {
                id: 'alertas-umbral',
                vista: VISTAS.ALERTAS,
                subtab: 'alertas',
                target: '#selector-umbral-alertas',
                placement: 'bottom',
                titulo: 'Ajustar el umbral de tolerancia',
                queEs: 'Define cuántos días de margen (30, 60 o 90 días) se esperan después de la fecha prometida antes de activar la alerta.',
                comoUsar: [
                    'Despliega "Umbral de alerta" y selecciona 30, 60 o 90 días según la política de la fundación.',
                    'Tanto la tabla de alertas como el indicador del tablero general se recalculan de inmediato.'
                ],
                ejemplo: 'Usa 30 días para un seguimiento estricto o 60 días si deseas dar un margen más amplio antes de marcar alerta.'
            },
            {
                id: 'alertas-rec-subtab',
                vista: VISTAS.ALERTAS,
                subtab: 'recordatorios',
                target: '#btn-subtab-alertas-recordatorios',
                placement: 'bottom',
                titulo: 'Agenda de recordatorios de donación',
                queEs: 'Administra compromisos específicos con fecha exacta, monto esperado y seguimiento por WhatsApp.',
                comoUsar: [
                    'Haz clic en "Recordatorios de donación" para ver las tarjetas de resumen (Para Hoy, Vencidos, Próximos y Gestionados).',
                    'Revisa la columna "Plazo / Vencimiento" para priorizar primero los compromisos de hoy o vencidos.'
                ],
                ejemplo: 'Si un donante te pidió que le escribas el día 15 porque ese día recibe su pago, agenda aquí ese compromiso.'
            },
            {
                id: 'alertas-rec-programar',
                vista: VISTAS.ALERTAS,
                subtab: 'recordatorios',
                permiso: 'crear_recordatorios',
                target: '#btn-programar-recordatorio',
                placement: 'bottom',
                titulo: 'Programar un nuevo recordatorio',
                queEs: 'Crea una cita o compromiso de aporte vinculado a un donante específico.',
                comoUsar: [
                    'Pulsa "Programar Recordatorio", elige el donante y define la fecha.',
                    'Opcionalmente indica el monto esperado en COP y una nota de contexto.'
                ],
                ejemplo: 'Agenda "Carlos Ruiz — 20 de mayo — $150.000 — Llamar después de mediodía" para que aparezca en el resumen de ese día.'
            },
            {
                id: 'alertas-rec-filtros',
                vista: VISTAS.ALERTAS,
                subtab: 'recordatorios',
                target: '#recordatorios-filtros-barra',
                placement: 'bottom',
                titulo: 'Filtrar recordatorios por plazo o estado',
                queEs: 'Permite enfocar la agenda en los compromisos más urgentes o revisar cuáles ya fueron atendidos.',
                comoUsar: [
                    'Busca por nombre o documento, o selecciona "Solo Hoy" / "Vencidos" en el filtro de plazos.',
                    'Filtra por estado ("Pendiente", "Mensaje enviado" o "Gestionado") para llevar el control ordenado.'
                ],
                ejemplo: 'Al empezar el día, filtra por "Solo Hoy" y estado "Pendiente" para ver exactamente a quién contactar.'
            }
        ]
    },
    {
        id: 'herramientas',
        titulo: 'Herramientas y catálogos',
        subtitulo: 'Exportación a Excel, importación masiva de datos y catálogo de destinaciones.',
        icono: 'fa-toolbox',
        categoria: 'herramientas',
        vista: VISTAS.HERRAMIENTAS,
        permisosAny: ['exportar_excel', 'importar_donaciones', 'administrar_destinaciones'],
        pasos: [
            {
                id: 'herr-exportar',
                vista: VISTAS.HERRAMIENTAS,
                permiso: 'exportar_excel',
                target: '#card-exportar-excel',
                placement: 'bottom',
                titulo: 'Exportar bases completas a Excel',
                queEs: 'Descarga en archivos .xlsx separados toda la base de donantes o todo el historial de donaciones.',
                comoUsar: [
                    'Haz clic en "Donantes" para descargar el directorio completo en Excel.',
                    'Haz clic en "Donaciones" para exportar todas las transacciones con sus columnas ordenadas.'
                ],
                ejemplo: 'Úsalo al cierre de cada mes para guardar una copia contable en tus archivos de la fundación.'
            },
            {
                id: 'herr-importar-donaciones',
                vista: VISTAS.HERRAMIENTAS,
                permiso: 'importar_donaciones',
                target: '#card-importar-donaciones',
                placement: 'bottom',
                titulo: 'Importación masiva de donaciones',
                queEs: 'Carga decenas o cientos de donaciones desde un archivo Excel o CSV validando cada fila antes de guardar.',
                comoUsar: [
                    'Primero descarga la "Plantilla" oficial para usar exactamente las columnas requeridas.',
                    'Pulsa "Seleccionar Archivo", revisa la vista previa de válidos y errores, y confirma la importación.'
                ],
                ejemplo: 'Si recibes un extracto mensual de recaudos con 50 aportes, llénalos en la plantilla y súbelos en un solo paso.'
            },
            {
                id: 'herr-importar-donantes',
                vista: VISTAS.HERRAMIENTAS,
                permiso: 'importar_donaciones',
                target: '#card-importar-donantes',
                placement: 'top',
                titulo: 'Importación masiva de donantes',
                queEs: 'Registra múltiples personas o empresas a la vez desde una hoja de cálculo y genera reporte si alguna fila tiene datos inválidos.',
                comoUsar: [
                    'Descarga la "Plantilla" de Donantes para asegurar el formato correcto de documento, tipo y periodicidad.',
                    'Carga el archivo con "Seleccionar Archivo" y revisa el reporte final en caso de filas observadas.'
                ],
                ejemplo: 'Ideal cuando migras un listado histórico de benefactores que tenías en hojas de cálculo.'
            },
            {
                id: 'herr-destinaciones',
                vista: VISTAS.HERRAMIENTAS,
                permiso: 'administrar_destinaciones',
                target: '#card-destinaciones',
                placement: 'top',
                titulo: 'Catálogo de destinaciones',
                queEs: 'Administra las líneas, programas o causas a las que se pueden asignar los aportes al registrar donaciones.',
                comoUsar: [
                    'Escribe el nombre del nuevo proyecto en el campo de texto y pulsa "Agregar".',
                    'Las nuevas destinaciones quedarán disponibles de inmediato en los filtros y formularios de donación.'
                ],
                ejemplo: 'Agrega "Becas Escolares 2026" o "Comedor Comunitario" para medir cuánto dinero entra a cada programa.'
            }
        ]
    },
    {
        id: 'usuarios',
        titulo: 'Gestión de usuarios',
        subtitulo: 'Creación de cuentas individuales, asignación de roles y activación o bloqueo de acceso.',
        icono: 'fa-users-gear',
        categoria: 'administracion',
        vista: VISTAS.USUARIOS,
        permiso: 'administrar_usuarios',
        pasos: [
            {
                id: 'usr-nuevo',
                vista: VISTAS.USUARIOS,
                permiso: 'crear_usuarios',
                target: '#btn-nuevo-usuario',
                placement: 'bottom',
                titulo: 'Crear una cuenta de usuario',
                queEs: 'Permite dar acceso al equipo de la fundación usando su documento de identidad, contraseña inicial y rol.',
                comoUsar: [
                    'Haz clic en "Nuevo usuario" e ingresa nombre completo, documento y una contraseña de mínimo 6 caracteres.',
                    'Elige el rol adecuado: Administrador (control total), Operador (gestión diaria) o Lector (solo consulta).'
                ],
                ejemplo: 'Si ingresa un voluntario solo para revisar listados, créale una cuenta con rol "Lector".'
            },
            {
                id: 'usr-filtros',
                vista: VISTAS.USUARIOS,
                target: '#usuarios-filtros-barra',
                placement: 'bottom',
                titulo: 'Buscar y filtrar cuentas del equipo',
                queEs: 'Localiza rápidamente a cualquier miembro del equipo por nombre, documento, rol o estado activo/inactivo.',
                comoUsar: [
                    'Escribe el nombre o documento en la barra de búsqueda.',
                    'Combina los filtros de rol y estado para auditar quién tiene acceso vigente.'
                ],
                ejemplo: 'Filtra por rol "Operador" y estado "Activos" para verificar quiénes están operando el registro diario.'
            },
            {
                id: 'usr-tabla',
                vista: VISTAS.USUARIOS,
                target: '#tabla-usuarios-wrap',
                placement: 'top',
                titulo: 'Cambiar rol, contraseña o estado',
                queEs: 'Centraliza las acciones administrativas sobre cada cuenta respetando las reglas de jerarquía.',
                comoUsar: [
                    'Usa el botón de escudo para cambiar el rol, el de llave para restablecer la contraseña y el de usuario para activar o desactivar.',
                    'Cuando desactivas una cuenta, esa persona no podrá volver a iniciar sesión hasta reactivarla.'
                ],
                ejemplo: 'Si alguien olvidó su contraseña o termina su vinculación con la fundación, actualízala o desactiva la cuenta desde aquí.'
            }
        ]
    },
    {
        id: 'auditoria',
        titulo: 'Registro de auditoría',
        subtitulo: 'Trazabilidad histórica de quién creó, editó o eliminó registros en donantes y donaciones.',
        icono: 'fa-clock-rotate-left',
        categoria: 'administracion',
        vista: VISTAS.AUDITORIA,
        permiso: 'ver_auditoria',
        pasos: [
            {
                id: 'audit-filtros',
                vista: VISTAS.AUDITORIA,
                target: '#auditoria-filtros-barra',
                placement: 'bottom',
                titulo: 'Filtrar el historial de cambios',
                queEs: 'Permite buscar operaciones por usuario responsable, ID de registro, tabla afectada (Donantes o Donaciones) y tipo de operación.',
                comoUsar: [
                    'Escribe el nombre del usuario o documento en el buscador.',
                    'Selecciona la tabla y el tipo de operación (INSERT, UPDATE o DELETE) para acotar la revisión.'
                ],
                ejemplo: 'Elige tabla "Donaciones" y operación "DELETE" si deseas revisar qué aportes fueron anulados recientemente.'
            },
            {
                id: 'audit-tabla',
                vista: VISTAS.AUDITORIA,
                target: '#tabla-auditoria-wrap',
                placement: 'top',
                titulo: 'Comparativa detallada antes y después',
                queEs: 'Muestra fecha, hora, responsable y permite abrir el detalle exacto de lo que cambió en cada registro.',
                comoUsar: [
                    'Ubica la operación en la lista y haz clic en el botón de detalle de la fila.',
                    'Revisa la tabla comparativa de valores anteriores frente a los nuevos valores guardados.'
                ],
                ejemplo: 'Si se corrigió el monto de una donación, al abrir el detalle verás claramente el valor anterior y el valor actualizado.'
            }
        ]
    }
];

/**
 * Evalúa si un elemento (sección o paso) está autorizado según permisos y rol del usuario.
 */
export function cumpleRequisitosAcceso(item, tienePermisoFn, usuario) {
    if (!item) return false;
    if (!usuario || usuario.activo === false) return false;

    const rolUsuario = String(usuario.rol || '').toLowerCase();

    if (Array.isArray(item.roles) && item.roles.length > 0) {
        if (!item.roles.includes(rolUsuario)) return false;
    }

    if (item.permiso) {
        if (typeof tienePermisoFn !== 'function' || !tienePermisoFn(item.permiso)) {
            return false;
        }
    }

    if (Array.isArray(item.permisosAny) && item.permisosAny.length > 0) {
        if (typeof tienePermisoFn !== 'function') return false;
        const alguno = item.permisosAny.some(p => tienePermisoFn(p));
        if (!alguno) return false;
    }

    return true;
}

/**
 * Filtra los pasos de una sección manteniendo únicamente los permitidos para el rol actual.
 */
export function filtrarPasosPorPermisos(pasos, tienePermisoFn, usuario) {
    if (!Array.isArray(pasos)) return [];
    return pasos.filter(paso => cumpleRequisitosAcceso(paso, tienePermisoFn, usuario));
}

/**
 * Devuelve la lista de tutoriales por sección disponibles y adaptados al rol actual.
 */
export function obtenerTutorialesDisponibles(tienePermisoFn, usuario) {
    if (!usuario || usuario.activo === false) return [];

    return TUTORIAL_SECCIONES
        .filter(seccion => cumpleRequisitosAcceso(seccion, tienePermisoFn, usuario))
        .map(seccion => {
            const pasosFiltrados = filtrarPasosPorPermisos(seccion.pasos, tienePermisoFn, usuario).map(paso => ({
                ...paso,
                seccionId: seccion.id,
                seccionTitulo: seccion.titulo
            }));
            return {
                ...seccion,
                pasos: pasosFiltrados
            };
        })
        .filter(seccion => seccion.pasos.length > 0);
}

/**
 * Construye el recorrido guiado completo concatenando todas las secciones autorizadas.
 */
export function construirRecorridoGeneral(tienePermisoFn, usuario) {
    const secciones = obtenerTutorialesDisponibles(tienePermisoFn, usuario);
    const pasos = [];
    secciones.forEach(seccion => {
        seccion.pasos.forEach(paso => {
            pasos.push(paso);
        });
    });
    return pasos;
}

/**
 * Busca el tutorial correspondiente a la vista actualmente activa (si existe y está autorizado).
 */
export function obtenerTutorialPorVista(vista, tienePermisoFn, usuario) {
    const disponibles = obtenerTutorialesDisponibles(tienePermisoFn, usuario);
    if (!disponibles.length) return null;
    const match = disponibles.find(sec => sec.vista === vista);
    return match || disponibles[0];
}
