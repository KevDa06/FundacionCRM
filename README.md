# FundaciónApp

CRM para gestión de donantes y donaciones.

## Ejecutar

```bash
npm install
npm run dev
```

## Producción

```bash
npm run build
npm run preview
```

El proyecto no depende del CDN de Tailwind: los estilos usados por la aplicación están en `src/styles/main.css`. Chart.js, PapaParse, SheetJS y Supabase se empaquetan con Vite.

## Importar donaciones

Desde **Registro de Donaciones > Importar Donaciones** se puede cargar CSV/XLS/XLSX. El importador valida fecha, monto, moneda, medio, destinación y la identificación del donante mediante ID, documento, correo o nombre exacto. Los registros inválidos no se insertan.
