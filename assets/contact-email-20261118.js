const emailParts = (label) => /^([a-z0-9._+-]+) \[at\] ([a-z0-9-]+(?: \[dot\] [a-z0-9-]+)+)$/i.exec(label);

function sendEmail(label, subject) {
  const parts = emailParts(label);
  if (!parts) return;
  // Keep the readable label and DOM obfuscated, even after activation.
  const address = parts[1] + String.fromCharCode(64) + parts[2].replace(/ \[dot\] /gi, '.');
  window.location.assign('mailto:' + address + (subject ? '?subject=' + encodeURIComponent(subject) : ''));
}

document.querySelectorAll('span[data-contact-email]').forEach((element) => {
  const label = element.textContent.trim();
  const parts = emailParts(label);
  if (!parts) return;

  const language = document.documentElement.lang.toLowerCase();
  const action = language.startsWith('zh') ? '发送邮件' : language.startsWith('de') ? 'E-Mail senden' : 'Send email';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'contact-email';
  button.textContent = label;
  button.title = `${action}: ${label}`;
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', () => {
    sendEmail(label, element.dataset.contactSubject);
  });
  element.replaceChildren(button);
});

// Map contact controls are inserted after the initial document has loaded.
document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-contact-email]');
  if (button) sendEmail(button.textContent.trim(), button.dataset.contactSubject);
});
