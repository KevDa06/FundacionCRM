# FundaciónApp — Sistema de Gestión de Donantes y Donaciones (CRM)

> **Plataforma web para la administración centralizada de donantes, trazabilidad de aportes financieros, análisis de impacto y prevención de deserción en organizaciones sin fines de lucro.**

---

## 📌 1. Descripción del Proyecto

Las organizaciones sin ánimo de lucro y fundaciones sociales enfrentan frecuentemente dificultades para mantener un registro estructurado y trazable de sus donantes y aportes monetarios. La dispersión de información en hojas de cálculo tradicionales genera inconsistencias, pérdida de contacto con donantes recurrentes y falta de visibilidad sobre los fondos captados.

**FundaciónApp (FundaciónCRM)** es una solución integral orientada a la gestión de relaciones con donantes (Donor CRM). Proporciona un entorno seguro, moderno y reactivo para registrar benefactores, gestionar donaciones multimoneda, emitir recibos oficiales, analizar métricas de recaudación en tiempo real y ejecutar procesos de importación y exportación masiva de datos.

### Propósito y Usuarios Objetivo
- **Propósito:** Optimizar la sostenibilidad financiera, fidelización de donantes y transparencia operativa de las fundaciones.
- **Usuarios Destinatarios:** Administradores de fundaciones, coordinadores de recaudación de fondos (*fundraising*), directores de programas y personal administrativo contable.

---

## 🚀 2. Características Principales

### 🔐 Autenticación y Control de Acceso
- **Pantalla de bloqueo segura:** Acceso protegido mediante contraseña maestra corporativa.
- **Autenticación con Supabase Auth:** Inicio de sesión delegado a una cuenta de sistema interna (`admin@fundacion.local`) con manejo de tokens JWT y persistencia de sesión.
- **Opción de bloqueo manual:** Cierre rápido de sesión para proteger la información en terminales compartidas.

### 👥 Gestión Integral de Donantes (Directorio)
- **Operaciones CRUD completas:** Registro, actualización de datos, consulta detallada y eliminación de donantes.
- **Clasificación por tipo:** Segmentación entre personas *Naturales* y personas *Jurídicas* (Empresas).
- **Control de periodicidad y estado:** Seguimiento de frecuencia de aporte (*Ocasional*, *Mensual*, *Anual*) y estado de actividad (*Activo*, *Inactivo*, *Retirado*).
- **Vista de Detalle 360°:** Modal interactivo con historial acumulado de donaciones, desglose con filtros mensuales/anuales y notas de contacto.
- **Búsqueda y filtros en tiempo real:** Búsqueda instantánea por nombre, documento (C.C./NIT), correo o teléfono.

### 💳 Registro y Control de Donaciones
- **Historial detallado de aportes:** Registro de donaciones vinculadas a donantes registrados con fecha, medio de pago, número de comprobante y notas.
- **Soporte Multimoneda:** Registro en Pesos Colombianos (COP), Dólares Estadounidenses (USD) y Euros (EUR).
- **Asignación por Destinación:** Clasificación de los fondos según el programa social o área de inversión.
- **Emisión e Impresión de Recibos Oficiales:** Generador de comprobantes de donación con formato imprimible institucional (`window.print()`).
- **Filtros avanzados:** Filtrado combinado por texto/comprobante, mes de recepción y programa de destinación.

### 📊 Dashboard de Métricas y Analítica Visual
- **Tarjetas KPI de Impacto:** Total histórico recaudado, donantes activos, recaudación del mes en curso y ticket promedio por donación.
- **Conversor de Moneda Global:** Selector en el panel lateral que ajusta dinámicamente las métricas consolidadas a COP, USD o EUR con tasas normalizadas.
- **Visualizaciones Interactivas (Chart.js):**
  - Gráfico de barras/líneas con la evolución temporal de la recaudación mensual.
  - Gráfico de dona/anillos con la distribución porcentual de fondos por destinación.

### 🔔 Centro de Retención (Alertas Tempranas)
- **Monitoreo de deserción:** Algoritmo que detecta donantes activos que han dejado de aportar según umbrales configurables (30, 60 o 90 días) acorde a su periodicidad prometida.
- **Acceso a contacto directo:** Enlaces rápidos para contactar al donante por llamada o mensajería y badge de alertas pendientes en la barra de navegación.

### 📥 Importación y Exportación Masiva
- **Importador de Donaciones Inteligente:** Carga de archivos `.xlsx`, `.xls` o `.csv` con detección flexible de columnas, normalización de montos y fechas, resolución automática del donante por ID, documento, correo o nombre, y visualización previa de registros válidos y reporte de errores.
- **Importador de Donantes:** Carga masiva con plantilla oficial descargable.
- **Exportación a Excel:** Descarga directa de las tablas de donantes y donaciones en formato nativo de Microsoft Excel (`.xlsx`) sin intermediarios.

### 🏷️ Catálogo de Destinaciones
- Configuración y administración personalizada de las categorías hacia donde se canalizan los aportes.

---

## 🛠️ 3. Tecnologías Utilizadas

| Capa / Componente | Tecnología | Descripción / Uso |
| :--- | :--- | :--- |
| **Lenguaje Core** | `JavaScript (ES6+)` | Lógica del cliente, manipulación reactiva del DOM y servicios modulares. |
| **Estructura y Vistas** | `HTML5 Semántico` | Maquetación responsiva basada en SPA con navegación por pestañas (*Tabs*). |
| **Estilos y Diseño** | `Tailwind CSS v4` | Sistema de diseño moderno, limpio y adaptable a pantallas de escritorio y móviles. |
| **Iconografía y Tipografía** | `Font Awesome 6` & `Inter` | Iconos vectoriales y fuente tipográfica optimizada para interfaces de datos. |
| **Empaquetador y Build** | `Vite 7` | Entorno de desarrollo ultrarrápido y compilador de producción optimizado. |
| **Visualización de Datos** | `Chart.js 4` | Gráficos dinámicos para dashboard de tendencias y distribución financiera. |
| **Procesamiento de Archivos** | `SheetJS (xlsx)` & `PapaParse` | Lectura/escritura de libros Excel (.xlsx/.xls) y procesamiento de archivos CSV. |
| **Backend as a Service (BaaS)** | `Supabase` | Infraestructura en la nube con API REST generada automáticamente. |
| **Base de Datos** | `PostgreSQL` | Base de datos relacional con integridad referencial y tipos nativos. |
| **Seguridad de Datos** | `Row-Level Security (RLS)` | Políticas de seguridad granulares a nivel de fila en la base de datos. |

---

## 📂 4. Arquitectura y Estructura del Proyecto

El proyecto sigue una arquitectura desacoplada basada en servicios y módulos funcionales:

```text
FundacionCRM/
├── src/
│   ├── modules/
│   │   └── importacionDonaciones.js  # Motor de procesamiento, mapeo y validación de archivos masivos
│   ├── services/
│   │   ├── donacionesService.js      # Operaciones CRUD para la entidad 'donaciones' en Supabase
│   │   ├── donantesService.js        # Operaciones CRUD para la entidad 'donantes' en Supabase
│   │   └── supabase.js               # Inicialización del cliente Supabase y configuración Auth
│   ├── styles/
│   │   └── main.css                  # Estilos globales y capas de Tailwind CSS compiladas
│   ├── app.js                        # Controlador principal de la UI, estado global y ciclo de vida
│   └── main.js                       # Punto de entrada de la aplicación para Vite
├── .env.example                      # Plantilla de variables de entorno requeridas
├── .gitignore                        # Reglas de exclusión para Git
├── index.html                        # Interfaz de usuario SPA con vistas modales y plantillas
├── metadata.json                     # Metadatos descriptivos de la plataforma
├── package.json                      # Definición de scripts y dependencias npm
├── README.md                         # Documentación técnica y funcional del proyecto
└── vite.config.js                    # Configuración del servidor y empaquetador Vite
```

---

## 🗄️ 5. Modelo de Base de Datos

La persistencia de datos se gestiona en PostgreSQL a través de Supabase mediante dos tablas principales vinculadas por clave foránea:

```
┌───────────────────────────┐         ┌───────────────────────────┐
│         donantes          │         │        donaciones         │
├───────────────────────────┤         ├───────────────────────────┤
│ id (PK, UUID)             │◀───┐    │ id (PK, UUID)             │
│ nombre (TEXT)             │    │    │ donante_id (FK, UUID)     │────┘
│ documento (TEXT)          │    └─── │ monto (NUMERIC)           │
│ fecha_nac (DATE)          │         │ moneda_aporte (TEXT)      │
│ telefono (TEXT)           │         │ fecha (DATE)              │
│ correo (TEXT)             │         │ medio (TEXT)              │
│ tipo (TEXT)               │         │ comprobante (TEXT)        │
│ periodicidad (TEXT)       │         │ destinacion (TEXT)        │
│ estado (TEXT)             │         │ nota (TEXT)               │
│ fecha_registro (DATE)     │         │ created_at (TIMESTAMPTZ)  │
│ nota (TEXT)               │         └───────────────────────────┘
│ created_at (TIMESTAMPTZ)  │
└───────────────────────────┘
```

### Detalle de Entidades

#### 1. Tabla `donantes`
Almacena el directorio maestro de personas o entidades benefactoras.
- **`id`** (`UUID`, Primary Key): Identificador único generado automáticamente.
- **`nombre`** (`TEXT`): Nombre completo de la persona natural o razón social.
- **`documento`** (`TEXT`): Número de identificación legal (Cédula de Ciudadanía, Extranjería o NIT).
- **`fecha_nac`** (`DATE`): Fecha de nacimiento o fecha de constitución.
- **`telefono`** (`TEXT`): Teléfono de contacto / WhatsApp.
- **`correo`** (`TEXT`): Dirección de correo electrónico.
- **`tipo`** (`TEXT`): Segmentación (`Natural` o `Juridica`).
- **`periodicidad`** (`TEXT`): Compromiso de aporte (`Ocasional`, `Mensual`, `Anual`).
- **`estado`** (`TEXT`): Situación en la organización (`Activo`, `Inactivo`, `Retirado`).
- **`fecha_registro`** (`DATE`): Fecha en la que ingresó a la base de datos.
- **`nota`** (`TEXT`): Observaciones adicionales o historial de seguimiento.

#### 2. Tabla `donaciones`
Registra cada una de las transacciones monetarias percibidas por la fundación.
- **`id`** (`UUID`, Primary Key): Identificador único del registro de donación.
- **`donante_id`** (`UUID`, Foreign Key): Referencia directa a `donantes.id`.
- **`monto`** (`NUMERIC`): Valor numérico del aporte realizado.
- **`moneda_aporte`** (`TEXT`): Código ISO de la moneda de la transacción (`COP`, `USD`, `EUR`).
- **`fecha`** (`DATE`): Fecha efectiva de recepción del aporte.
- **`medio`** (`TEXT`): Canal de pago (`Transferencia`, `Tarjeta`, `Efectivo`, `Cheque`).
- **`comprobante`** (`TEXT`, Opcional): Número de radicado, referencia bancaria o comprobante.
- **`destinacion`** (`TEXT`): Destino o proyecto asignado al recurso.
- **`nota`** (`TEXT`, Opcional): Detalles adicionales sobre el depósito o transacción.

---

## 🔒 6. Seguridad y Políticas de Acceso (RLS)

El sistema implementa un modelo de seguridad por capas en el cliente y en la base de datos:

1. **Autenticación Delegada:**
   - La aplicación inicia sesión de forma transparente contra el servicio `Supabase Auth` utilizando una cuenta de sistema interna (`admin@fundacion.local`).
   - El cliente web almacena el token JWT de sesión autenticado, el cual viaja en las cabeceras `Authorization: Bearer <token>` de cada petición.

2. **Row-Level Security (RLS) en PostgreSQL:**
   - Las tablas `donantes` y `donaciones` tienen RLS habilitado (`ENABLE ROW LEVEL SECURITY`).
   - **Usuarios anónimos (`anon`):** No tienen permisos de lectura, escritura ni modificación directa.
   - **Usuarios autenticados (`authenticated`):** Poseen políticas explícitas que autorizan operaciones `SELECT`, `INSERT`, `UPDATE` y `DELETE` para el rol validado por Supabase.

3. **Manejo Seguro de Secretos:**
   - Las claves y URLs públicas se configuran mediante variables con prefijo `VITE_` sin exponer credenciales de administración (*Service Role Keys*) en el frontend.

---

## 🔄 7. Flujo General del Sistema

```
[ Usuario ]
    │
    ▼
[ Pantalla de Bloqueo ] ──( Contraseña de Fundación )──▶ [ Supabase Auth ]
    │                                                          │
    ▼ (Sesión Exitosa / Token JWT)                            │
[ Interfaz CRM (SPA) ] ◀───────────────────────────────────────┘
    │
    ├─▶ [ Dashboard ] ──────────▶ Cálculo de KPIs y Gráficos (Chart.js)
    ├─▶ [ Directorio Donantes ] ─▶ donantesService.js ──┐
    ├─▶ [ Registro Donaciones ] ─▶ donacionesService.js ──┤
    ├─▶ [ Alertas Retención ] ──▶ Algoritmo de Umbrales   │
    └─▶ [ Importador / Export ] ─▶ PapaParse & SheetJS    ▼
                                                   [ Supabase Client ]
                                                          │
                                                (REST API con JWT + RLS)
                                                          │
                                                          ▼
                                                  [ PostgreSQL DB ]
```

---

## 📋 8. Matriz de Operaciones CRUD

| Módulo | Crear (Create) | Leer / Consultar (Read) | Actualizar (Update) | Eliminar (Delete) |
| :--- | :--- | :--- | :--- | :--- |
| **Donantes** | Modal con validación de campos obligatorios (`insertar`). | Listado reactivo, filtros combinados y modal de detalle histórico (`listar`). | Edición de contacto, tipo, periodicidad y estado (`actualizar`). | Eliminación individual con borrado en cascada de sus donaciones vinculadas (`eliminar`). |
| **Donaciones** | Modal de registro con selector de donante y moneda (`insertar`). | Tabla general filtrable por mes, comprobante y destinación (`listar`). | Administrable mediante recarga o reingreso. | Eliminación de donación individual con recálculo de métricas (`eliminar`). |

---

## ⚙️ 9. Instalación y Ejecución Local

### Prerrequisitos
- **Node.js**: Versión 18.0.0 o superior instalada.
- **npm**: Gestor de paquetes incluido con Node.js.
- **Cuenta en Supabase**: Con un proyecto activo y las tablas `donantes` y `donaciones` aprovisionadas.

### Paso a Paso

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/KevDa06/FundacionCRM.git
   cd FundacionCRM
   ```

2. **Instalar las dependencias:**
   ```bash
   npm install
   ```

3. **Configurar las variables de entorno:**
   Copia el archivo de ejemplo `.env.example` y renómbralo a `.env`:
   ```bash
   cp .env.example .env
   ```
   Edita `.env` con las credenciales de tu proyecto de Supabase:
   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu_clave_anonima_publica
   VITE_AUTH_SYSTEM_EMAIL=admin@fundacion.local
   ```

4. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   Abre tu navegador en `http://localhost:3000`.

5. **Generar la versión de producción (Build):**
   ```bash
   npm run build
   ```
   Para previsualizar la compilación final:
   ```bash
   npm run preview
   ```

---

## 🌐 10. Variables de Entorno

| Variable | Descripción | Ejemplo / Valor |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | URL base de la API del proyecto en Supabase. | `https://xyzcompany.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Clave pública (`anon-key`) para solicitudes de cliente. | `eyJhbGciOi...` |
| `VITE_AUTH_SYSTEM_EMAIL` | Correo electrónico de la cuenta interna utilizada por el CRM. | `admin@fundacion.local` |

---

## 📈 11. Estado del Proyecto

Actualmente, el proyecto se encuentra en estado **Funcional y en Desarrollo Activo (Versión 1.0.0)** en el marco de un proyecto académico y formativo en ingeniería de software. 

Cuenta con todas sus funcionalidades principales estabilizadas:
- ✅ Persistencia y consultas en Supabase en tiempo real.
- ✅ Resiliencia ante valores nulos en donaciones y comprobantes.
- ✅ Importación y exportación masiva con validación de tipos.
- ✅ Centro de retención de donantes con umbrales dinámicos.
