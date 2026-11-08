/* Daniel & Marina — FUNCIONES DE LA WEB */
'use strict';

// IMPORTANTE: al configurar Google Apps Script, pega aquí la URL pública
// de su implementación (terminada en /exec). No pongas aquí la URL de Google Sheets.
const RSVP_SCRIPT_URL = '';
const WEDDING_DATE = new Date('2027-06-12T00:00:00+02:00');
const MAX_GUESTS = 12;

// CUENTA ATRÁS: solo días, tal como decidimos.
function updateCountdown() {
  const number = document.querySelector('#days-left');
  const caption = document.querySelector('#countdown-label');
  const days = Math.max(0, Math.ceil((WEDDING_DATE - new Date()) / 86400000));
  if (days === 0) {
    number.textContent = '♥';
    caption.innerHTML = '¡Hoy es nuestro gran día!<br><span lang="ro">Astăzi este ziua noastră cea mare!</span>';
  } else {
    number.textContent = String(days);
  }
}
updateCountdown();
// Si alguien deja la pestaña abierta, el contador se actualiza periódicamente.
setInterval(updateCountdown, 60 * 60 * 1000);

// ANIMACIONES DELICADAS DE LAS TARJETAS Y SECCIONES.
const animationsOff = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!animationsOff && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.06 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
}

// FORMULARIO DE ASISTENCIA.
const rsvpForm = document.querySelector('#rsvp-form');
const guestsList = document.querySelector('#guests-list');
const guestAddButton = document.querySelector('#add-guest');
const attendanceInputs = [...document.querySelectorAll('input[name="attendance"]')];
const attendingFields = document.querySelector('#attending-fields');
const submitButton = document.querySelector('#submit-rsvp');
const statusLine = document.querySelector('#form-status');
const setupNotice = document.querySelector('#form-unconfigured');
let guestIndex = 0;
let pendingNonce = null;
let awaitingResponse = false;

// Evitamos insertar nombres de usuarios dentro de HTML: solo usamos texto
// escrito por nosotros y recogemos los valores por los campos del formulario.
function createGuest() {
  if (guestsList.children.length >= MAX_GUESTS) return;
  guestIndex++;
  const card = document.createElement('div');
  card.className = 'guest-card';
  card.innerHTML = `
    <div class="guest-top"><h3>Persona ${guestIndex} · <span lang="ro">Invitat</span></h3>
      <button type="button" class="guest-remove">Quitar · Șterge</button></div>
    <div class="guest-grid">
      <div class="form-group form-group--full"><label>Nombre y apellidos · <span lang="ro">Nume și prenume</span> *</label>
        <input class="guest-name" type="text" maxlength="120" required placeholder="Nombre completo / Nume complet"></div>
      <div class="form-group"><label>Tipo de invitado · <span lang="ro">Tip invitat</span></label>
        <select class="guest-type"><option value="adulto">Adulto · Adult</option><option value="nino">Niño/a · Copil</option></select></div>
      <div class="form-group child-age-group" hidden><label>Edad del niño/a · <span lang="ro">Vârsta copilului</span></label>
        <input class="guest-age" type="number" min="0" max="17" placeholder="0–17"></div>
      <div class="form-group child-menu-group" hidden><label>¿Menú infantil? · <span lang="ro">Meniu pentru copii?</span></label>
        <select class="guest-child-menu"><option value="si">Sí · Da</option><option value="no">No · Nu</option></select></div>
      <div class="form-group form-group--full"><label>Alergias o intolerancias · <span lang="ro">Alergii sau intoleranțe</span></label>
        <input class="guest-allergies" type="text" maxlength="250" placeholder="Ninguna / Niciuna"></div>
    </div>`;
  card.querySelector('.guest-remove').addEventListener('click', () => {
    if (guestsList.children.length > 1) {
      card.remove();
      updateGuestControls();
    }
  });
  const type = card.querySelector('.guest-type');
  type.addEventListener('change', () => {
    const isChild = type.value === 'nino';
    card.querySelector('.child-age-group').hidden = !isChild;
    card.querySelector('.child-menu-group').hidden = !isChild;
    card.querySelector('.guest-age').required = isChild;
  });
  guestsList.append(card);
  updateGuestControls();
}

function updateGuestControls() {
  guestAddButton.disabled = guestsList.children.length >= MAX_GUESTS;
  guestsList.querySelectorAll('.guest-remove').forEach(button => {
    button.hidden = guestsList.children.length <= 1;
  });
}

guestAddButton.addEventListener('click', createGuest);
attendanceInputs.forEach(input => input.addEventListener('change', () => {
  const attending = document.querySelector('input[name="attendance"]:checked')?.value === 'si';
  attendingFields.hidden = !attending;
  if (attending && guestsList.children.length === 0) createGuest();
  guestsList.querySelectorAll('input,select').forEach(input => {
    input.disabled = !attending;
  });
}));

// El envío se activa SOLAMENTE al añadir la URL real de Apps Script.
const isConfigured = /^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec(?:\?.*)?$/.test(RSVP_SCRIPT_URL);
if (isConfigured) {
  setupNotice.hidden = true;
  submitButton.disabled = false;
}

function formError(message) {
  statusLine.textContent = message;
  submitButton.disabled = !isConfigured;
  awaitingResponse = false;
  pendingNonce = null;
}

function getGuests() {
  return [...guestsList.querySelectorAll('.guest-card')].map(card => ({
    name: card.querySelector('.guest-name').value.trim(),
    type: card.querySelector('.guest-type').value,
    age: card.querySelector('.guest-type').value === 'nino' ? card.querySelector('.guest-age').value : '',
    childMenu: card.querySelector('.guest-type').value === 'nino' ? card.querySelector('.guest-child-menu').value : '',
    allergies: card.querySelector('.guest-allergies').value.trim() || 'Ninguna / Niciuna'
  }));
}

rsvpForm.addEventListener('submit', (event) => {
  event.preventDefault();
  statusLine.textContent = '';
  if (!isConfigured) return formError('Todavía estamos preparando el formulario. · Formularul nu este încă activ.');
  if (awaitingResponse) return;
  if (document.querySelector('#website-field').value) return; // Antispam básico.
  if (!rsvpForm.reportValidity()) return;

  const attendance = document.querySelector('input[name="attendance"]:checked')?.value;
  if (!attendance) return formError('Indica si asistirás. · Selectează dacă vei participa.');
  const guests = attendance === 'si' ? getGuests() : [];
  if (attendance === 'si') {
    if (!guests.length || guests.some(g => !g.name)) return formError('Escribe los nombres de todos los asistentes. · Scrie numele tuturor participanților.');
    if (guests.some(g => g.type === 'nino' && (g.age === '' || Number(g.age) < 0 || Number(g.age) > 17))) return formError('Indica la edad de cada niño. · Completează vârsta fiecărui copil.');
    if (!document.querySelector('input[name="bus"]:checked')) return formError('Indica si necesitaréis autobús. · Spune-ne dacă aveți nevoie de autocar.');
  }
  pendingNonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = {
    nonce: pendingNonce,
    contactName: document.querySelector('#contact-name').value.trim(),
    attendance,
    guests,
    bus: attendance === 'si' ? document.querySelector('input[name="bus"]:checked').value : 'no-aplica',
    message: document.querySelector('#message').value.trim(),
    website: document.querySelector('#website-field').value
  };
  // Formulario clásico a iframe: evita las restricciones CORS de Apps Script.
  const transport = document.createElement('form');
  transport.method = 'POST';
  transport.action = RSVP_SCRIPT_URL;
  transport.target = 'rsvp-target';
  transport.style.display = 'none';
  const data = document.createElement('input');
  data.type = 'hidden'; data.name = 'payload'; data.value = JSON.stringify(payload);
  transport.append(data);
  document.body.append(transport);
  awaitingResponse = true;
  submitButton.disabled = true;
  statusLine.textContent = 'Enviando… · Se trimite…';
  transport.submit();
  transport.remove();
  // No afirmamos que se ha enviado si no llega respuesta real del servidor.
  setTimeout(() => {
    if (awaitingResponse && pendingNonce === payload.nonce) {
      formError('No hemos podido comprobar el envío. Antes de repetir, consúltanos por WhatsApp. · Nu am putut verifica trimiterea.');
    }
  }, 20000);
});

// Apps Script responde desde un iframe de un dominio de Google.
// Verificamos dominio, tipo de mensaje y nonce para evitar falsas confirmaciones.
window.addEventListener('message', event => {
  const allowed = /^https:\/\/(?:script\.google\.com|[a-z0-9-]+\.googleusercontent\.com)$/.test(event.origin);
  if (!allowed || event.data?.source !== 'marina-daniel-rsvp' || !awaitingResponse || event.data?.nonce !== pendingNonce) return;
  if (event.data.ok === true) {
    awaitingResponse = false;
    pendingNonce = null;
    document.querySelector('#rsvp-form').hidden = true;
    document.querySelector('#thank-you').hidden = false;
    document.querySelector('#thank-you').focus();
    document.querySelector('#thank-you').scrollIntoView({ behavior: animationsOff ? 'auto' : 'smooth', block: 'center' });
  } else {
    formError('No se ha podido guardar. Prueba de nuevo o escríbenos. · Răspunsul nu a putut fi salvat.');
  }
});
