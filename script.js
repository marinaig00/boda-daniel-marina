/* Daniel & Marina — FUNCIONES DE LA WEB */
'use strict';

// IMPORTANTE: al configurar Google Apps Script, pega aquí la URL pública
// de su implementación (terminada en /exec). No pongas aquí la URL de Google Sheets.
const RSVP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyIDRKkUEWRuRZdpjFgNGwSiSWKwbhRmPBht5ozJk_-Qz0FN1dypfItcQFKv1zDC14W/exec';
const WEDDING_DATE = new Date('2027-06-12T00:00:00+02:00');

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

// PRECONFIRMACIÓN DE ASISTENCIA: nombre, respuesta y acompañantes.
const rsvpForm = document.querySelector('#rsvp-form');
const attendanceInputs = [...document.querySelectorAll('input[name="attendance"]')];
const companionsInput = document.querySelector('#companions');
const companionsGroup = document.querySelector('#companions-group');
const submitButton = document.querySelector('#submit-rsvp');
const statusLine = document.querySelector('#form-status');
const thankYou = document.querySelector('#thank-you');
const iframe = document.querySelector('#rsvp-target');
let awaitingResponse = false;
let pendingNonce = null;
let responseTimer = null;

const isConfigured = /^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec(?:\?.*)?$/.test(RSVP_SCRIPT_URL);

function onAttendanceChanged() {
  const response = document.querySelector('input[name="attendance"]:checked')?.value;
  const unable = response === 'no';
  companionsInput.disabled = unable;
  companionsInput.required = !unable;
  companionsGroup.hidden = unable;
  if (unable) companionsInput.value = '0';
}
attendanceInputs.forEach(input => input.addEventListener('change', onAttendanceChanged));
onAttendanceChanged();

function showError(message) {
  if (responseTimer) clearTimeout(responseTimer);
  responseTimer = null;
  awaitingResponse = false;
  pendingNonce = null;
  submitButton.disabled = !isConfigured;
  statusLine.textContent = message;
}

if (!isConfigured) {
  submitButton.disabled = true;
  statusLine.textContent = 'El formulario todavía no está configurado. · Formularul nu este încă configurat.';
}

rsvpForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!isConfigured || awaitingResponse) return;
  statusLine.textContent = '';
  if (document.querySelector('#website-field').value) return;
  if (!rsvpForm.reportValidity()) return;

  const name = document.querySelector('#contact-name').value.trim();
  const attendance = document.querySelector('input[name="attendance"]:checked')?.value;
  const companions = attendance === 'no' ? 0 : Number(companionsInput.value);

  if (!name || name.length > 120 || !['si', 'no', 'nose'].includes(attendance) ||
      !Number.isInteger(companions) || companions < 0 || companions > 15) {
    showError('Revisa los datos antes de enviar. · Verifică datele înainte de trimitere.');
    return;
  }

  pendingNonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = { nonce: pendingNonce, contactName: name, attendance, companions };

  // Se envía por POST a un iframe oculto para evitar restricciones CORS.
  const transport = document.createElement('form');
  transport.method = 'POST';
  transport.action = RSVP_SCRIPT_URL;
  transport.target = iframe.name;
  transport.hidden = true;
  const field = document.createElement('input');
  field.type = 'hidden';
  field.name = 'payload';
  field.value = JSON.stringify(payload);
  transport.appendChild(field);
  document.body.appendChild(transport);

  awaitingResponse = true;
  submitButton.disabled = true;
  statusLine.textContent = 'Enviando… · Se trimite…';
  transport.submit();
  transport.remove();

  // No se afirma que se haya enviado hasta recibir confirmación del backend.
  responseTimer = setTimeout(() => {
    if (awaitingResponse && pendingNonce === payload.nonce) {
      showError('No hemos podido comprobar el envío. Antes de repetir, consúltanos para evitar duplicados. · Nu am putut confirma trimiterea.');
    }
  }, 20000);
});

window.addEventListener('message', (event) => {
  const allowedOrigin = /^https:\/\/(?:script\.google\.com|[a-z0-9-]+\.googleusercontent\.com)$/.test(event.origin);
  if (!allowedOrigin || !awaitingResponse || event.data?.source !== 'marina-daniel-rsvp' ||
      event.data?.nonce !== pendingNonce) return;

  if (event.data.ok !== true) {
    showError('No se ha podido guardar la respuesta. · Nu am putut salva răspunsul.');
    return;
  }
  if (responseTimer) clearTimeout(responseTimer);
  responseTimer = null;
  awaitingResponse = false;
  pendingNonce = null;
  rsvpForm.hidden = true;
  thankYou.hidden = false;
  thankYou.focus();
  thankYou.scrollIntoView({ behavior: animationsOff ? 'auto' : 'smooth', block: 'center' });
});
