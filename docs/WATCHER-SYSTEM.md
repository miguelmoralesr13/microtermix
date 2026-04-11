# Sistema de Watchers de Microtermix

Este documento describe la arquitectura y el funcionamiento del sistema de monitoreo en tiempo real (Watchers) de Microtermix. El sistema utiliza un modelo **Frontend-Orchestrated, Backend-Executed** para proporcionar actualizaciones fluidas sin sobrecargar la CPU ni la red.

## 1. Arquitectura General

El sistema se divide en dos capas principales conectadas por el sistema de eventos de Tauri:

### Capa de UI (React + React Query)
- **Hooks Especializados**: Cada servicio (GitHub, Jenkins, etc.) tiene su propio hook (ej: `useGithubActionsWatcher`).
- **Ciclo de Vida**: El hook inicia el watcher en el backend al montarse y lo detiene al desmontarse.
- **Sincronización**: Cuando el backend emite un evento de cambio, el frontend invalida las queries de React Query relacionadas para refrescar la UI.

### Capa de Backend (Rust + Tokio)
- **Hilos Independientes**: Cada watcher corre en un hilo de `tokio::spawn` dedicado.
- **Idempotencia**: El orquestador (`watchers/mod.rs`) asegura que solo haya un watcher activo por cada `watcher_id`.
- **Detección de Cambios**: Se utiliza un sistema de "Snapshots" para comparar el estado previo con el nuevo y emitir eventos solo si hay diferencias reales.

---

## 2. Patrón: Polling Adaptativo Inteligente

Para balancear la reactividad y el consumo de API (Rate Limits), el sistema ajusta su frecuencia de monitoreo dinámicamente:

- **Modo Activo (Turbo 🚀)**: Si se detectan cambios recientes o si hay procesos en curso (ej: un pipeline `in_progress`), el backend consulta cada **3 segundos**.
- **Modo Idle (Relax 🛌)**: Si no hay actividad y todo está completado, el intervalo sube a **20 segundos**.

Adicionalmente, el frontend puede aplicar un **Polling de Detalle** (ej: 2s para jobs activos) para mostrar el avance paso a paso mientras el usuario está mirando un recurso específico.

---

## 3. Implementación de un Nuevo Watcher

Para agregar un nuevo tipo de watcher (ej: "GitLab Pipelines"), seguí estos pasos:

### Paso 1: Backend Worker (`src-tauri/src/watchers/new_service.rs`)
Creá la estructura básica del worker:
1. Definí la `Config` (lo que recibe del frontend).
2. Definí el `Snapshot` (lo que querés comparar para detectar cambios).
3. Implementá la función `spawn` que ejecute el loop de polling.

```rust
// Ejemplo de detección de cambios
let is_changed = snapshot.get(&id).map_or(true, |prev| prev != &current);
if is_changed {
    snapshot.insert(id, current.clone());
    changed_list.push(current);
}
```

### Paso 2: Registro en el Orquestador (`src-tauri/src/watchers/mod.rs`)
Agregá el nuevo tipo al comando `start_watcher`:
```rust
"new_service" => {
    let cfg: new_service::NewServiceConfig = serde_json::from_value(config)?;
    new_service::spawn(app, state.watchers.clone(), watcher_id, cfg, interval_ms).await
}
```

### Paso 3: Hook de React (`src/hooks/useNewServiceWatcher.ts`)
Implementá el hook que maneje la comunicación:
1. Generá un `watcherId` único.
2. Usá `invoke('start_watcher', ...)` para arrancar el motor.
3. Usá `listen('update-event-name', ...)` para reaccionar a los cambios.

---

## 4. Buenas Prácticas y Lecciones Aprendidas

- **User-Agent**: GitHub y otras APIs requieren obligatoriamente un header `User-Agent`.
- **Normalización de Paths**: Siempre normalizá los paths del proyecto (ej: eliminar barras diagonales finales) para asegurar que el `watcher_id` coincida entre frontend y backend.
- **Authorization**: Preferí `token ${token}` para compatibilidad con PATs clásicos de GitHub.
- **Rate Limits**: Monitoreá siempre los headers de rate limit (`x-ratelimit-remaining`) y logueá advertencias si el cupo es bajo.
- **Rust Safety**: En loops asíncronos, capturá estados en variables booleanas antes de "mover" (`move`) colecciones pesadas (como `Vec`) hacia los eventos.

---

*Documento actualizado al 11 de Abril, 2026.*
