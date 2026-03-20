# Plan de Diseño: Integración de Zeplin en Microtermix

**Fecha:** 2026-03-20
**Estado:** Draft
**Autor:** Gemini CLI

## 1. Visión General
Integrar Zeplin como un módulo de "Superpower" dentro de Microtermix para cerrar la brecha entre el diseño y el código. La utilidad permitirá visualizar flujos, pantallas e inspeccionar elementos técnicos sin salir del entorno de desarrollo.

## 2. Requerimientos Técnicos

### A. Autenticación
- Uso de **Personal Access Token (PAT)** de Zeplin.
- Almacenamiento seguro en la configuración global de Microtermix (gestionado vía `AccountManagerModal`).

### B. Estado (Zustand)
- Archivo: `src/stores/zeplinStore.ts`.
- Responsabilidades: Cache de proyectos, pantallas seleccionadas, gestión de flujos y estado de carga.

### C. Backend (Tauri)
- Comandos en Rust para:
    - Escritura de assets en el filesystem (`src-tauri/src/lib.rs`).
    - Peticiones HTTP seguras (opcional si hay CORS).

## 3. Componentes de UI (React + shadcn/ui)

| Componente | Descripción |
| :--- | :--- |
| `ZeplinPanel` | Vista principal del módulo. |
| `ZeplinCanvas` | Visor interactivo de pantallas con Zoom y Pan. |
| `ZeplinFlowTree` | Navegación por flujos de usuario. |
| `ZeplinInspector` | Extracción de tokens de Tailwind v4 y assets. |

## 4. Flujo de Trabajo del Usuario

1. **Vinculación**: El usuario asocia un `project_id` de Zeplin en la configuración del proyecto de Microtermix.
2. **Navegación**: Selecciona un "Flow" en el panel lateral.
3. **Inspección**: Al hacer clic en una pantalla del flujo, se abre el visor detallado.
4. **Sincronización**: Selecciona un icono y presiona "Sync to Assets", el archivo se guarda automáticamente en el proyecto local.

## 5. Integración con Tailwind v4
- El inspector mapeará automáticamente valores de diseño a variables de CSS de Tailwind v4 (ej. `--color-primary`).
- Soporte para copiar fragmentos de JSX con clases aplicadas.

## 6. Próximos Pasos
1. Crear `src/stores/zeplinStore.ts`.
2. Crear `src/services/zeplinApi.ts`.
3. Implementar `ZeplinPanel.tsx` básico.
