// src/api/itineraries.js
// Itinerarios (secuencias planificadas). Un itinerario es DATA: activarlo o
// sincronizarlo NUNCA inicia audio; la reproducción requiere gesto del usuario.

import { cachedGet, post, put, patch, del, invalidateCache } from './client.js';

// Crear/editar/borrar/duplicar un itinerario resincroniza sus alarmas del lado
// del backend (paso con time_of_day → Alarm vinculada, ver itineraries.py). El
// cache TTL de GET es por recurso: sin esto, /api/v1/alarms podía quedar
// sirviendo la lista vieja hasta 8 s después de guardar el itinerario.
const invalidateAlarms = (data) => {
  invalidateCache('/api/v1/alarms');
  return data;
};

export const listItineraries = () => cachedGet('/api/v1/itineraries');
export const createItinerary = (body) => post('/api/v1/itineraries', body).then(invalidateAlarms);
export const getItinerary = (id) => cachedGet(`/api/v1/itineraries/${id}`);
export const updateItinerary = (id, body) => put(`/api/v1/itineraries/${id}`, body).then(invalidateAlarms);
export const deleteItinerary = (id) => del(`/api/v1/itineraries/${id}`).then(invalidateAlarms);
export const duplicateItinerary = (id) => post(`/api/v1/itineraries/${id}/duplicate`).then(invalidateAlarms);
export const toggleItinerary = (id) => patch(`/api/v1/itineraries/${id}/toggle`);
export const reorderItineraryItems = (id, order) => patch(`/api/v1/itineraries/${id}/reorder`, { order });
