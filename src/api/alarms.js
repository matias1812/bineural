// src/api/alarms.js
// Alarmas web/PWA sincronizadas con el backend.
//
// IMPORTANTE: la alarma del backend es DATOS. La ejecución (notificación y
// gesto del usuario) sigue siendo responsabilidad del AlarmManager local
// (src/core/alarm-manager.js). Este módulo NUNCA inicia audio.

import { get, post, put, del } from './client.js';

export const listAlarms = () => get('/api/v1/alarms');
export const createAlarm = (body) => post('/api/v1/alarms', body);
export const getAlarm = (id) => get(`/api/v1/alarms/${id}`);
export const updateAlarm = (id, body) => put(`/api/v1/alarms/${id}`, body);
export const deleteAlarm = (id) => del(`/api/v1/alarms/${id}`);
