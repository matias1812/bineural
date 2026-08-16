// src/api/itineraries.js
// Itinerarios (secuencias planificadas). Un itinerario es DATA: activarlo o
// sincronizarlo NUNCA inicia audio; la reproducción requiere gesto del usuario.

import { get, post, put, patch, del } from './client.js';

export const listItineraries = () => get('/api/v1/itineraries');
export const createItinerary = (body) => post('/api/v1/itineraries', body);
export const getItinerary = (id) => get(`/api/v1/itineraries/${id}`);
export const updateItinerary = (id, body) => put(`/api/v1/itineraries/${id}`, body);
export const deleteItinerary = (id) => del(`/api/v1/itineraries/${id}`);
export const duplicateItinerary = (id) => post(`/api/v1/itineraries/${id}/duplicate`);
export const toggleItinerary = (id) => patch(`/api/v1/itineraries/${id}/toggle`);
