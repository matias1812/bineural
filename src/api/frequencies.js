// src/api/frequencies.js
// Frecuencias/configuraciones creadas por el usuario (backend). Son DATOS:
// este módulo nunca inicia reproducción de audio.

import { cachedGet, post, put, del } from './client.js';

export const listFrequencies = () => cachedGet('/api/v1/frequencies');
export const createFrequency = (body) => post('/api/v1/frequencies', body);
export const getFrequency = (id) => cachedGet(`/api/v1/frequencies/${id}`);
export const updateFrequency = (id, body) => put(`/api/v1/frequencies/${id}`, body);
export const deleteFrequency = (id) => del(`/api/v1/frequencies/${id}`);
