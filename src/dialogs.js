// Diálogos modales (<dialog>): abrir con showModal, cerrar con Esc, con su
// botón o con un click en el fondo, y devolver el foco a quien los abrió.

/**
 * Prepara `dialog`. `close`: botones que lo cierran. `fallback()`: a dónde va
 * el foco al cerrar si quien lo abrió ya no está (p. ej. el botón de la barra).
 * Devuelve `open({returnTo})`.
 */
export function setupDialog(dialog, { close = [], fallback = () => null } = {}) {
  let session = 0;
  for (const button of close) button.addEventListener('click', () => dialog.close());
  // Click en el fondo (fuera de la caja) cierra.
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });
  return function open({ returnTo = document.activeElement, focus = null } = {}) {
    if (dialog.open) return false;
    // Quién lo abrió, por apertura: «close» llega de forma asíncrona y uno
    // atrasado de una apertura anterior no tiene que pisar a este.
    const id = ++session;
    dialog.addEventListener('close', function onClose() {
      if (dialog.open) return; // atrasado: sigue esperando su propio cierre
      dialog.removeEventListener('close', onClose);
      if (id !== session) return;
      const usable = (el) => el?.isConnected && el !== document.body && !el.closest('[hidden]') && !el.disabled;
      const target = [returnTo, fallback()].find(usable);
      target?.focus({ preventScroll: true });
    });
    dialog.showModal();
    focus?.focus();
    return true;
  };
}
