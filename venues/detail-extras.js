const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const external = (url, text, className = '') =>
  `<a class="${className}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(text)} <span aria-hidden="true">↗</span></a>`;

export function venuePhoto(venue, labels) {
  const photo = venue.photo;
  if (!photo) return '';
  const caption = labels[photo.kind];
  return `<figure class="venue-photo">
    <img src="${escape(photo.url)}" alt="${escape(`${caption} · ${venue.name}`)}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async">
    <figcaption>${escape(caption)} · ${external(photo.source, photo.credit)} · ${external(photo.licenseUrl, photo.license)} · ${escape(labels.photoAdjusted)}</figcaption>
  </figure>`;
}

export function venueContact(venue, labels) {
  const { website, contact = {}, photoPage } = venue;
  if (!(website || contact.url || contact.phone || contact.email || photoPage)) return '';
  const links = [
    website ? external(website, `${labels.website} · ${new URL(website).hostname.replace(/^www\./, '')}`, 'venue-website') : '',
    contact.phone ? `<a href="tel:${escape(contact.phone.replace(/[^\d+]/g, ''))}">${escape(contact.parkPhone ? labels.parkPhone : labels.phone)} · <bdi>${escape(contact.phone)}</bdi></a>` : '',
    contact.email ? `<a href="mailto:${escape(contact.email)}">${escape(labels.email)} · ${escape(contact.email)}</a>` : '',
    contact.url && contact.url !== website ? external(contact.url, labels.contactPage) : '',
    photoPage ? external(photoPage, labels.photoPage) : '',
    contact.phone && !contact.url && contact.source && contact.source !== website ? external(contact.source, labels.contactSource, 'venue-contact-source') : '',
  ];
  return `<div class="venue-contact" aria-label="${escape(labels.visitDetails)}">${links.join('')}</div>`;
}
