import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea errores técnicos de AWS en mensajes legibles para el usuario.
 */
export function formatAwsError(error: any): string {
  const errStr = String(error);

  if (errStr.includes("ExpiredTokenException") || errStr.includes("security token included in the request is expired")) {
    return "La sesión de AWS ha expirado. Por favor, refresca tus credenciales en el panel de cuentas.";
  }

  if (errStr.includes("AccessDeniedException")) {
    const match = errStr.match(/is not authorized to perform: ([a-zA-Z0-9:]+)/);
    const action = match ? match[1] : "esta acción";
    return `Acceso Denegado: Tu usuario no tiene permisos para realizar ${action}.`;
  }

  if (errStr.includes("ResourceNotFoundException")) {
    return "El recurso solicitado no fue encontrado. Verifica el ARN o el nombre.";
  }

  if (errStr.includes("ServiceError")) {
     // Intento de extraer el mensaje interno de un ServiceError de Rust
     try {
         const match = errStr.match(/message: Some\("([^"]+)"\)/);
         if (match) return match[1];
     } catch {}
  }

  return errStr.length > 200 ? errStr.substring(0, 200) + "..." : errStr;
}
