// When the editor can't open (its texts didn't download, or it failed while
// starting), the skeleton in index.html would wait forever: it gives way to
// a message in the page's language with a button that reloads the page. Its
// texts are the ones index.html carries for each language (copy/static.ts),
// since the app's own texts may be what failed to arrive.

interface BootTexts {
  failed: string;
  reload: string;
}

/** The page's language's texts from index.html, or null if they aren't there. */
function bootTexts(): BootTexts | null {
  try {
    const data = JSON.parse(document.getElementById('boot-copy')?.textContent ?? 'null') as { texts: Record<string, BootTexts> } | null;
    return data?.texts[document.documentElement.lang] ?? null;
  } catch {
    return null;
  }
}

/** Shows that the editor couldn't open, in place of the skeleton (once), with the focus on «Recargar la página». */
export function showBootFailure(reloadPage = () => location.reload()) {
  const texts = bootTexts();
  if (!texts || document.getElementById('boot-failed')) return;
  document.querySelector('.boot')?.remove();
  const box = document.createElement('div');
  box.id = 'boot-failed';
  box.className = 'boot-failed';
  box.setAttribute('role', 'alert');
  const message = document.createElement('p');
  message.textContent = texts.failed;
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'btn primary';
  reload.textContent = texts.reload;
  reload.addEventListener('click', () => reloadPage());
  box.append(message, reload);
  document.body.append(box);
  reload.focus();
}
